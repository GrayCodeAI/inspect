import type {
  TestPlan,
  TestStep,
  TestFlow,
  TestDataSet,
  PageType,
  LLMCall,
  ProgressCallback,
} from "./types.js";
import { generateTestData } from "./form-filler.js";

// ---------------------------------------------------------------------------
// Robust JSON extraction from LLM responses
// ---------------------------------------------------------------------------

function tryParseSteps(response: string): TestStep[] | null {
  try {
    let jsonStr = response.trim();

    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    // Find outermost array boundaries
    const arrayStart = jsonStr.indexOf("[");
    const arrayEnd = jsonStr.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
    }

    // Fix common LLM JSON mistakes
    // 1. Trailing commas before ] or }
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
    // 2. Single-line // comments
    jsonStr = jsonStr.replace(/\/\/[^\n]*/g, "");
    // 3. Unescaped newlines inside strings (replace with space)
    jsonStr = jsonStr.replace(/(?<=":[ ]*"[^"]*)\n(?=[^"]*")/g, " ");

    const parsed = JSON.parse(jsonStr) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return parsed.map((s, i) => ({
      id: (s.id as number) ?? i + 1,
      action: (s.action as string) ?? "assert",
      description: (s.description as string) ?? `Step ${i + 1}`,
      target: s.target as string | undefined,
      value: s.value as string | undefined,
      assertion: s.assertion as string | undefined,
      flow: s.flow as string | undefined,
      priority: (s.priority as number) ?? 3,
      status: "pending" as const,
    }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page-type detection heuristics
// ---------------------------------------------------------------------------

const PAGE_TYPE_PATTERNS: Array<{ pattern: RegExp; type: PageType }> = [
  { pattern: /\/(login|signin|sign-in|log-in)\b/i, type: "auth" },
  { pattern: /\/(signup|register|sign-up|join|create-account)\b/i, type: "auth" },
  { pattern: /\/(dashboard|overview|home)\b/i, type: "dashboard" },
  { pattern: /\/(admin|manage)\b/i, type: "admin" },
  { pattern: /\/(settings|preferences|account)\b/i, type: "settings" },
  { pattern: /\/(profile|user)\b/i, type: "profile" },
  { pattern: /\/(search|find|results)\b/i, type: "search" },
  { pattern: /\/(checkout|cart|payment|billing)\b/i, type: "checkout" },
  { pattern: /\/(contact|support|help)\b/i, type: "contact" },
  { pattern: /\/(blog|articles?|posts?|news)\b/i, type: "blog" },
  { pattern: /\/(docs?|documentation|guide|api)\b/i, type: "docs" },
  { pattern: /\/(pricing|plans?|subscribe)\b/i, type: "pricing" },
  { pattern: /\/(products?|items?|catalog)\b/i, type: "list" },
  { pattern: /\/(product|item)\/[\w-]+/i, type: "detail" },
  { pattern: /\/(error|404|500|not-found)\b/i, type: "error" },
];

export function detectPageType(url: string, snapshot: string): PageType {
  // URL-based detection
  for (const { pattern, type } of PAGE_TYPE_PATTERNS) {
    if (pattern.test(url)) return type;
  }

  // Snapshot-based detection
  const lower = snapshot.toLowerCase();
  if (lower.includes('input[type="password"]') || lower.includes("password")) {
    if (lower.includes("confirm") || lower.includes("register") || lower.includes("sign up"))
      return "auth";
    if (lower.includes("login") || lower.includes("sign in")) return "auth";
  }
  if (lower.includes('[role="search"]') || lower.includes("search")) return "search";
  if (lower.includes("dashboard") || lower.includes("overview")) return "dashboard";

  // Root page is usually a landing page
  try {
    const path = new URL(url).pathname;
    if (path === "/" || path === "") return "landing";
  } catch {
    /* intentionally empty */
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Flow detection
// ---------------------------------------------------------------------------

function detectFlows(steps: TestStep[], snapshot: string): TestFlow[] {
  const flows: TestFlow[] = [];
  const lower = snapshot.toLowerCase();

  // Auth flow detection
  const authSteps = steps.filter(
    (s) =>
      s.description.toLowerCase().includes("login") ||
      s.description.toLowerCase().includes("signup") ||
      s.description.toLowerCase().includes("sign") ||
      s.description.toLowerCase().includes("password") ||
      s.description.toLowerCase().includes("email") ||
      s.action === "fill",
  );
  if (authSteps.length >= 2) {
    flows.push({
      name: "Authentication",
      description: "Login/signup flow",
      steps: authSteps.map((s) => s.id),
      type: "auth",
    });
  }

  // Navigation flow
  const navSteps = steps.filter(
    (s) =>
      s.action === "click" &&
      (s.description.toLowerCase().includes("nav") ||
        s.description.toLowerCase().includes("menu") ||
        s.description.toLowerCase().includes("link")),
  );
  if (navSteps.length >= 2) {
    flows.push({
      name: "Navigation",
      description: "Menu and link navigation",
      steps: navSteps.map((s) => s.id),
      type: "navigation",
    });
  }

  // Form flow
  const formSteps = steps.filter(
    (s) =>
      s.action === "fill" ||
      s.action === "select" ||
      s.action === "check" ||
      (s.action === "click" && s.description.toLowerCase().includes("submit")),
  );
  if (formSteps.length >= 2) {
    flows.push({
      name: "Form Interaction",
      description: "Form filling and submission",
      steps: formSteps.map((s) => s.id),
      type: "form",
    });
  }

  // Content verification flow
  const contentSteps = steps.filter(
    (s) => s.action === "assert" || s.action === "screenshot" || s.action === "scroll",
  );
  if (contentSteps.length >= 2) {
    flows.push({
      name: "Content Verification",
      description: "Page content and visual checks",
      steps: contentSteps.map((s) => s.id),
      type: "content",
    });
  }

  // Search flow
  if (lower.includes("search")) {
    const searchSteps = steps.filter((s) => s.description.toLowerCase().includes("search"));
    if (searchSteps.length >= 1) {
      flows.push({
        name: "Search",
        description: "Search functionality testing",
        steps: searchSteps.map((s) => s.id),
        type: "search",
      });
    }
  }

  return flows;
}

// Re-export generateTestData from form-filler (single source of truth)
export { generateTestData } from "./form-filler.js";

// ---------------------------------------------------------------------------
// Form-aware step generation
// ---------------------------------------------------------------------------

function generateFormSteps(snapshot: string, startId: number, testData: TestDataSet): TestStep[] {
  const steps: TestStep[] = [];
  let id = startId;

  // Detect form fields from snapshot
  const lines = snapshot.split("\n");
  const inputLines = lines.filter(
    (l) => l.includes("textbox") || l.includes("input") || l.includes("combobox"),
  );
  const passwordLines = lines.filter(
    (l) => l.includes("password") || l.includes('type="password"'),
  );
  const buttonLines = lines.filter((l) => l.includes("button") || l.includes("submit"));

  // Detect login form
  const hasPassword = passwordLines.length > 0;
  const hasEmailInput = inputLines.some(
    (l) => l.toLowerCase().includes("email") || l.toLowerCase().includes("username"),
  );

  if (hasEmailInput && hasPassword) {
    // Login form detected
    const emailLabel = inputLines.find(
      (l) => l.toLowerCase().includes("email") || l.toLowerCase().includes("username"),
    );
    const emailName = emailLabel?.match(/"([^"]+)"/)?.[1] ?? "Email";

    steps.push({
      id: id++,
      action: "fill",
      description: `Enter email address in ${emailName} field`,
      target: emailName,
      value: testData.email,
      status: "pending",
      flow: "auth",
      priority: 1,
    });

    steps.push({
      id: id++,
      action: "fill",
      description: "Enter password",
      target: "Password",
      value: testData.password,
      status: "pending",
      flow: "auth",
      priority: 1,
    });

    // Look for submit button
    const submitBtn = buttonLines.find(
      (l) =>
        l.toLowerCase().includes("log in") ||
        l.toLowerCase().includes("login") ||
        l.toLowerCase().includes("sign in") ||
        l.toLowerCase().includes("submit"),
    );
    const submitName = submitBtn?.match(/"([^"]+)"/)?.[1] ?? "Submit";

    steps.push({
      id: id++,
      action: "click",
      description: `Click ${submitName} button`,
      target: submitName,
      assertion: "Form submitted successfully or shows validation message",
      status: "pending",
      flow: "auth",
      priority: 1,
    });
  }

  // Detect signup form (more fields than login)
  if (hasEmailInput && hasPassword && inputLines.length > 3) {
    const nameInput = inputLines.find(
      (l) => l.toLowerCase().includes("name") && !l.toLowerCase().includes("username"),
    );
    if (nameInput) {
      const label = nameInput.match(/"([^"]+)"/)?.[1] ?? "Name";
      steps.push({
        id: id++,
        action: "fill",
        description: `Enter name in ${label} field`,
        target: label,
        value: testData.name.full,
        status: "pending",
        flow: "auth",
        priority: 1,
      });
    }
  }

  // Detect search form
  const searchLine = lines.find(
    (l) => l.toLowerCase().includes("search") && (l.includes("textbox") || l.includes("input")),
  );
  if (searchLine) {
    const searchLabel = searchLine.match(/"([^"]+)"/)?.[1] ?? "Search";
    steps.push({
      id: id++,
      action: "fill",
      description: "Enter search query",
      target: searchLabel,
      value: "test",
      status: "pending",
      flow: "search",
      priority: 2,
    });
    steps.push({
      id: id++,
      action: "press",
      description: "Submit search",
      value: "Enter",
      assertion: "Search results appear",
      status: "pending",
      flow: "search",
      priority: 2,
    });
  }

  // Detect contact/general forms
  const textareaLine = lines.find(
    (l) => l.includes("textarea") || l.toLowerCase().includes("message"),
  );
  if (textareaLine && !hasPassword) {
    const stepId = id++; // eslint-disable-line no-useless-assignment
    steps.push({
      id: stepId,
      action: "fill",
      description: "Fill contact form message",
      target: "Message",
      value: "This is an automated test message from Inspect.",
      status: "pending",
      flow: "form",
      priority: 3,
    });
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Main planner
// ---------------------------------------------------------------------------

export async function planTests(
  url: string,
  snapshot: string,
  pageTitle: string,
  llm: LLMCall,
  onProgress: ProgressCallback,
  spaRoutes: string[] = [],
): Promise<TestPlan> {
  onProgress("info", "Planning test steps...");

  const pageType = detectPageType(url, snapshot);
  onProgress("info", `Detected page type: ${pageType}`);

  // Generate test data for form filling
  const testData = generateTestData();

  // Extract interactive elements for LLM context
  const elements = snapshot
    .split("\n")
    .filter((l) => l.includes("[e"))
    .slice(0, 40)
    .join("\n");

  // Build a smarter prompt based on page type
  const typeInstructions: Record<string, string> = {
    auth: "This is an auth page. Focus on testing login/signup forms, password validation, OAuth buttons, and error handling.",
    dashboard:
      "This is a dashboard. Test navigation items, data displays, interactive widgets, and logout functionality.",
    landing:
      "This is a landing page. Test navigation, CTAs, content sections, forms (newsletter/contact), and links.",
    search:
      "This is a search page. Test search input, result display, filters, sorting, and pagination.",
    checkout:
      "This is a checkout page. Test payment form, cart display, address input, and validation.",
    form: "This page has forms. Test form filling, validation, submission, and error messages.",
    list: "This is a list/catalog page. Test pagination, filtering, sorting, and item selection.",
    detail: "This is a detail page. Test content display, images, related items, and actions.",
    settings:
      "This is a settings page. Test form fields, save/cancel, toggles, and confirmation dialogs.",
    profile: "This is a profile page. Test editable fields, avatar upload, and save functionality.",
    blog: "This is a blog/content page. Test article display, navigation, comments, and sharing.",
    docs: "This is a documentation page. Test navigation, search, code blocks, and table of contents.",
    pricing:
      "This is a pricing page. Test plan comparison, CTA buttons, and toggle (monthly/annual).",
    contact: "This is a contact page. Test contact form, email/phone display, and map embed.",
    admin: "This is an admin page. Test CRUD operations, user management, and access controls.",
    error:
      "This is an error page. Test error message display, navigation links, and retry actions.",
    unknown: "Analyze the page carefully and test all visible interactive elements.",
  };

  const typeHint = typeInstructions[pageType] ?? typeInstructions.unknown;

  const prompt = `You are a test planning AI. Given this web page, return a comprehensive test plan as a JSON array.

URL: ${url}
Title: ${pageTitle}
Page Type: ${pageType}
Context: ${typeHint}

Interactive elements on the page:
${elements}

Return a JSON array with 10-20 test steps. Each step is an object:
- id: number (sequential)
- action: one of "click", "fill", "select", "assert", "screenshot", "scroll", "navigate", "hover", "press", "tab", "check", "upload", "wait"
- description: what this step does
- target: element text/label to interact with
- value: text to type (for "fill"), key to press (for "press"), or URL (for "navigate")
- assertion: what to verify after this action
- flow: which flow this belongs to ("auth", "navigation", "form", "content", "search", "checkout")
- priority: 1=critical, 2=high, 3=medium, 4=low

Cover these areas:
1. Page load verification and content assertions
2. All navigation links and menu items
3. Form interactions (fill, submit, validate errors)
4. Interactive elements (buttons, dropdowns, modals, tabs)
5. Scroll behavior and lazy loading
6. Keyboard accessibility (tab navigation)
7. Visual verification (screenshots at key points)

${
  pageType === "auth"
    ? `
Use this test data for forms:
- Email: ${testData.email}
- Password: ${testData.password}
- Name: ${testData.name.full}
`
    : ""
}
${
  spaRoutes.length > 0
    ? `
SPA Routes discovered (test navigation to these):
${spaRoutes
  .filter((r) => !r.includes(":") && !r.includes("["))
  .slice(0, 8)
  .map((r) => `- ${r}`)
  .join("\n")}
Include "navigate" steps to visit the most important routes above and verify they load correctly.
`
    : ""
}
IMPORTANT: Return ONLY a JSON array. No markdown, no explanation. Start with [ end with ].`;

  const response = await llm([{ role: "user", content: prompt }]);

  // Parse LLM response with robust extraction
  let steps: TestStep[] | null = tryParseSteps(response);

  // Retry once with a corrective prompt if first attempt failed
  if (!steps) {
    onProgress("warn", "AI response was not valid JSON, retrying with corrective prompt...");
    try {
      const retryPrompt = `Your previous response was not valid JSON. Return ONLY a raw JSON array of test step objects. No markdown, no code fences, no explanation. Start with [ end with ].

Fix this response into valid JSON:
${response.slice(0, 1500)}`;

      const retryResponse = await llm([{ role: "user", content: retryPrompt }]);
      steps = tryParseSteps(retryResponse);
    } catch {
      // Retry failed — fall through to fallback
    }
  }

  if (!steps) {
    onProgress("warn", "AI planner failed after retry, building plan from page analysis");
    steps = buildFallbackPlan(url, snapshot, pageType, testData, spaRoutes);
  }

  // Inject form-aware steps if the planner missed them
  const hasFormSteps = steps.some((s) => s.action === "fill");
  if (!hasFormSteps) {
    const formSteps = generateFormSteps(snapshot, steps.length + 1, testData);
    if (formSteps.length > 0) {
      steps.push(...formSteps);
    }
  }

  // Ensure we always have screenshots
  const hasScreenshots = steps.some((s) => s.action === "screenshot");
  if (!hasScreenshots) {
    steps.unshift({
      id: 0,
      action: "screenshot",
      description: "Capture initial page state",
      status: "pending",
      priority: 4,
    });
    steps.push({
      id: steps.length + 1,
      action: "screenshot",
      description: "Capture final page state",
      status: "pending",
      priority: 4,
    });
    // Renumber
    steps.forEach((s, i) => {
      s.id = i + 1;
    });
  }

  // Detect flows
  const flows = detectFlows(steps, snapshot);

  onProgress("info", `Plan created: ${steps.length} steps across ${flows.length} flows`);

  return {
    url,
    title: pageTitle,
    steps,
    createdAt: Date.now(),
    pageType,
    flows,
    estimatedDuration: steps.length * 3000,
    testData,
  };
}

// ---------------------------------------------------------------------------
// Fallback plan when LLM fails
// ---------------------------------------------------------------------------

function buildFallbackPlan(
  url: string,
  snapshot: string,
  pageType: PageType,
  testData: TestDataSet,
  spaRoutes: string[] = [],
): TestStep[] {
  const steps: TestStep[] = [];
  let id = 1;

  // Always: page load verification
  steps.push({
    id: id++,
    action: "screenshot",
    description: "Capture initial page state",
    status: "pending",
    priority: 4,
  });
  steps.push({
    id: id++,
    action: "assert",
    description: "Verify page loads with correct title",
    assertion: "Page has a title and content",
    status: "pending",
    priority: 1,
  });

  // Always: accessibility basics
  steps.push({
    id: id++,
    action: "assert",
    description: "Check all images have alt text",
    assertion: "All images have alt text attributes",
    status: "pending",
    priority: 2,
  });
  steps.push({
    id: id++,
    action: "assert",
    description: "Check heading hierarchy",
    assertion: "Page has proper heading hierarchy (H1 followed by H2, etc.)",
    status: "pending",
    priority: 3,
  });

  // ----- Interactive elements from snapshot -----
  // Extract ALL clickable elements (buttons, links) from the snapshot
  const snapshotLines = snapshot.split("\n");

  // Button clicks — click these FIRST (primary interactions on the page)
  const buttonLines = snapshotLines.filter((l) => l.includes("button") && l.includes('"'));
  for (const line of buttonLines.slice(0, 5)) {
    const nameMatch = line.match(/"([^"]+)"/);
    if (nameMatch && !nameMatch[1].toLowerCase().includes("close")) {
      steps.push({
        id: id++,
        action: "click",
        description: `Click "${nameMatch[1]}" button`,
        target: nameMatch[1],
        assertion: "Button responds to click and UI updates",
        status: "pending",
        priority: 2,
      });
      // Screenshot after important button clicks to capture state changes
      steps.push({
        id: id++,
        action: "screenshot",
        description: `Capture state after clicking "${nameMatch[1]}"`,
        status: "pending",
        priority: 4,
      });
    }
  }

  // Navigation links
  const linkLines = snapshotLines.filter((l) => l.includes("link") && l.includes('"'));
  for (const line of linkLines.slice(0, 5)) {
    const nameMatch = line.match(/"([^"]+)"/);
    if (nameMatch) {
      steps.push({
        id: id++,
        action: "click",
        description: `Click "${nameMatch[1]}" link`,
        target: nameMatch[1],
        assertion: `Navigation works for ${nameMatch[1]}`,
        status: "pending",
        flow: "navigation",
        priority: 2,
      });
    }
  }

  // Form steps based on page type
  const formSteps = generateFormSteps(snapshot, id, testData);
  for (const s of formSteps) {
    s.id = id++;
    steps.push(s);
  }

  // ----- SPA route navigation -----
  if (spaRoutes.length > 0) {
    // Filter out parametric routes and the current URL, take top routes
    const routesToTest = spaRoutes
      .filter((r) => {
        if (r === url) return false;
        // Skip parametric patterns like /users/:id or /blog/[slug]
        if (r.includes(":") || r.includes("[")) return false;
        // Skip asset/static paths
        try {
          const path = new URL(r).pathname;
          if (/\.(js|css|png|jpg|svg|ico|woff|json)$/i.test(path)) return false;
        } catch {
          /* intentionally empty */
        }
        return true;
      })
      .slice(0, 6);

    if (routesToTest.length > 0) {
      for (const route of routesToTest) {
        let label: string;
        try {
          label = new URL(route).pathname || route;
        } catch {
          label = route;
        }
        steps.push({
          id: id++,
          action: "navigate",
          description: `Navigate to SPA route: ${label}`,
          target: route,
          value: route,
          assertion: "Page loads with content and no JavaScript errors",
          status: "pending",
          flow: "navigation",
          priority: 2,
        });
        steps.push({
          id: id++,
          action: "screenshot",
          description: `Capture ${label}`,
          status: "pending",
          priority: 4,
        });
      }
    }
  }

  // Scroll and screenshot
  steps.push({
    id: id++,
    action: "scroll",
    description: "Scroll to bottom of page",
    status: "pending",
    priority: 3,
  });
  steps.push({
    id: id++,
    action: "screenshot",
    description: "Capture scrolled page state",
    status: "pending",
    priority: 4,
  });

  // Keyboard navigation
  steps.push({
    id: id++,
    action: "tab",
    description: "Test keyboard navigation (Tab through elements)",
    assertion: "Focus moves through interactive elements in logical order",
    status: "pending",
    priority: 3,
  });

  // Meta verification
  steps.push({
    id: id++,
    action: "assert",
    description: "Verify meta tags present",
    assertion: "Page has viewport and description meta tags",
    status: "pending",
    priority: 3,
  });

  // Console errors
  steps.push({
    id: id++,
    action: "assert",
    description: "Check for JavaScript errors",
    assertion: "No JavaScript errors in console",
    status: "pending",
    priority: 2,
  });

  // Final screenshot
  const finalId = id++; // eslint-disable-line no-useless-assignment
  steps.push({
    id: finalId,
    action: "screenshot",
    description: "Capture final page state",
    status: "pending",
    priority: 4,
  });

  return steps;
}
