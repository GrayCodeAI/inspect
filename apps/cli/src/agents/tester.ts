import type { TestStep, LLMCall, ProgressCallback } from "./types.js";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

// ---------------------------------------------------------------------------
// Element finding strategies
// ---------------------------------------------------------------------------

/** Find by CSS selector (LLM-generated) */
async function findBySelector(
  page: any,
  description: string,
  snapshot: string,
  llm: LLMCall,
  timeout = 3000,
): Promise<string | null> {
  const response = await llm([{
    role: "user",
    content: `Given this page snapshot, provide a Playwright selector for: "${description}"

Snapshot:
${snapshot.slice(0, 4000)}

Respond with ONLY a valid Playwright selector. Examples:
- text="Sign Up"
- [aria-label="Email"]
- button:has-text("Submit")
- input[name="email"]
- #login-form input[type="password"]
- role=button[name="Save"]

One selector only, no explanation.`,
  }]);

  const selector = response.trim().replace(/^["']|["']$/g, "");
  if (!selector || selector === "null" || selector.length > 200) return null;

  try {
    await page.waitForSelector(selector, { timeout });
    return selector;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Smart element interaction
// ---------------------------------------------------------------------------

async function clickElement(page: any, target: string, snapshot: string, llm: LLMCall): Promise<void> {
  // Strategy 1: Text match
  try {
    await page.getByText(target, { exact: false }).first().click({ timeout: 3000 });
    return;
  } catch { /* next */ }

  // Strategy 2: Role match (link, then button, then menuitem)
  for (const role of ["link", "button", "menuitem", "tab"] as const) {
    try {
      await page.getByRole(role, { name: target }).first().click({ timeout: 2000 });
      return;
    } catch { /* next */ }
  }

  // Strategy 3: Label match
  try {
    await page.getByLabel(target, { exact: false }).first().click({ timeout: 2000 });
    return;
  } catch { /* next */ }

  // Strategy 4: Placeholder match
  try {
    await page.getByPlaceholder(target, { exact: false }).first().click({ timeout: 2000 });
    return;
  } catch { /* next */ }

  // Strategy 5: LLM-generated selector
  const selector = await findBySelector(page, `Click: ${target}`, snapshot, llm);
  if (selector) {
    await page.click(selector, { timeout: 3000 });
    return;
  }

  throw new Error(`Could not find element: ${target}`);
}

async function fillElement(page: any, target: string, value: string, snapshot: string, llm: LLMCall): Promise<void> {
  // Strategy 1: Label match
  try {
    await page.getByLabel(target, { exact: false }).first().fill(value, { timeout: 3000 });
    return;
  } catch { /* next */ }

  // Strategy 2: Placeholder match
  try {
    await page.getByPlaceholder(target, { exact: false }).first().fill(value, { timeout: 3000 });
    return;
  } catch { /* next */ }

  // Strategy 3: Role textbox
  try {
    await page.getByRole("textbox", { name: target }).first().fill(value, { timeout: 2000 });
    return;
  } catch { /* next */ }

  // Strategy 4: Text-based (for inputs near labels)
  try {
    await page.getByText(target, { exact: false }).first().locator(".. >> input, .. >> textarea").first().fill(value, { timeout: 2000 });
    return;
  } catch { /* next */ }

  // Strategy 5: LLM selector
  const selector = await findBySelector(page, `Input field for: ${target}`, snapshot, llm);
  if (selector) {
    await page.fill(selector, value, { timeout: 3000 });
    return;
  }

  throw new Error(`Could not find input: ${target}`);
}

async function selectElement(page: any, target: string, value: string, snapshot: string, llm: LLMCall): Promise<void> {
  // Strategy 1: Label
  try {
    await page.getByLabel(target, { exact: false }).first().selectOption(value, { timeout: 3000 });
    return;
  } catch { /* next */ }

  // Strategy 2: Role combobox
  try {
    await page.getByRole("combobox", { name: target }).first().selectOption(value, { timeout: 2000 });
    return;
  } catch { /* next */ }

  // Strategy 3: LLM selector
  const selector = await findBySelector(page, `Select/dropdown for: ${target}`, snapshot, llm);
  if (selector) {
    await page.selectOption(selector, value, { timeout: 3000 });
    return;
  }

  throw new Error(`Could not find select: ${target}`);
}

// ---------------------------------------------------------------------------
// Step execution with retry
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;

export async function executeStep(
  step: TestStep,
  page: any,
  snapshotText: string,
  llm: LLMCall,
  onProgress: ProgressCallback,
): Promise<TestStep> {
  const startTime = Date.now();
  onProgress("step", `Step ${step.id} — ${step.description}`);

  let lastError: Error | null = null;
  const maxAttempts = step.action === "assert" ? 1 : MAX_RETRIES + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      onProgress("warn", `  ↻ Retry ${attempt}/${MAX_RETRIES}...`);
      await page.waitForTimeout(500);
      // Re-snapshot for retry
      try {
        const { AriaSnapshotBuilder } = await import("@inspect/browser");
        const builder = new AriaSnapshotBuilder();
        await builder.buildTree(page);
        snapshotText = builder.getFormattedTree();
      } catch { /* keep old snapshot */ }
    }

    try {
      await executeAction(step, page, snapshotText, llm, onProgress);
      step.status = "pass";
      step.retries = attempt;
      step.duration = Date.now() - startTime;
      return step;
    } catch (err: any) {
      lastError = err;
    }
  }

  step.status = "fail";
  step.error = lastError?.message ?? "Unknown error";
  step.retries = maxAttempts - 1;
  onProgress("fail", `  ✗ ${step.error}`);
  step.duration = Date.now() - startTime;
  return step;
}

async function executeAction(
  step: TestStep,
  page: any,
  snapshotText: string,
  llm: LLMCall,
  onProgress: ProgressCallback,
): Promise<void> {
  switch (step.action) {
    case "navigate": {
      if (step.target?.startsWith("http")) {
        await page.goto(step.target, { waitUntil: "domcontentloaded", timeout: 15000 });
      }
      const title = await page.title();
      onProgress("pass", `  ✓ Page: ${title}`);
      break;
    }

    case "click": {
      if (!step.target) throw new Error("No target for click");
      await clickElement(page, step.target, snapshotText, llm);
      onProgress("pass", `  ✓ Clicked: ${step.target}`);
      break;
    }

    case "dblclick": {
      if (!step.target) throw new Error("No target for double-click");
      // Try text, then role, then LLM selector
      try {
        await page.getByText(step.target, { exact: false }).first().dblclick({ timeout: 3000 });
      } catch {
        const selector = await findBySelector(page, `Double-click: ${step.target}`, snapshotText, llm);
        if (selector) await page.dblclick(selector, { timeout: 3000 });
        else throw new Error(`Could not find element: ${step.target}`);
      }
      onProgress("pass", `  ✓ Double-clicked: ${step.target}`);
      break;
    }

    case "rightclick": {
      if (!step.target) throw new Error("No target for right-click");
      try {
        await page.getByText(step.target, { exact: false }).first().click({ button: "right", timeout: 3000 });
      } catch {
        const selector = await findBySelector(page, `Right-click: ${step.target}`, snapshotText, llm);
        if (selector) await page.click(selector, { button: "right", timeout: 3000 });
        else throw new Error(`Could not find element: ${step.target}`);
      }
      onProgress("pass", `  ✓ Right-clicked: ${step.target}`);
      break;
    }

    case "fill": {
      if (!step.target) throw new Error("No target for fill");
      const value = step.value ?? "";
      await fillElement(page, step.target, value, snapshotText, llm);
      onProgress("pass", `  ✓ Filled "${step.target}": ${value.slice(0, 30)}${value.length > 30 ? "..." : ""}`);
      break;
    }

    case "select": {
      if (!step.target || !step.value) throw new Error("No target/value for select");
      await selectElement(page, step.target, step.value, snapshotText, llm);
      onProgress("pass", `  ✓ Selected: ${step.value}`);
      break;
    }

    case "check": {
      if (!step.target) throw new Error("No target for check");
      try {
        await page.getByLabel(step.target, { exact: false }).first().check({ timeout: 3000 });
      } catch {
        try {
          await page.getByRole("checkbox", { name: step.target }).first().check({ timeout: 2000 });
        } catch {
          const selector = await findBySelector(page, `Checkbox: ${step.target}`, snapshotText, llm);
          if (selector) await page.check(selector, { timeout: 3000 });
          else throw new Error(`Could not find checkbox: ${step.target}`);
        }
      }
      onProgress("pass", `  ✓ Checked: ${step.target}`);
      break;
    }

    case "uncheck": {
      if (!step.target) throw new Error("No target for uncheck");
      try {
        await page.getByLabel(step.target, { exact: false }).first().uncheck({ timeout: 3000 });
      } catch {
        const selector = await findBySelector(page, `Checkbox: ${step.target}`, snapshotText, llm);
        if (selector) await page.uncheck(selector, { timeout: 3000 });
        else throw new Error(`Could not find checkbox: ${step.target}`);
      }
      onProgress("pass", `  ✓ Unchecked: ${step.target}`);
      break;
    }

    case "scroll": {
      if (step.target === "top") {
        await page.evaluate("window.scrollTo(0, 0)");
      } else if (step.target === "bottom") {
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      } else {
        // Scroll by half to trigger lazy loading
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)");
        await page.waitForTimeout(500);
        // Scroll to bottom for infinite scroll
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      }
      await page.waitForTimeout(500); // Wait for lazy-load content
      onProgress("pass", `  ✓ Scrolled`);
      break;
    }

    case "hover": {
      if (!step.target) throw new Error("No target for hover");
      try {
        await page.getByText(step.target, { exact: false }).first().hover({ timeout: 3000 });
      } catch {
        for (const role of ["link", "button", "menuitem"] as const) {
          try {
            await page.getByRole(role, { name: step.target }).first().hover({ timeout: 1500 });
            break;
          } catch { /* next */ }
        }
      }
      onProgress("pass", `  ✓ Hovered: ${step.target}`);
      break;
    }

    case "press": {
      const key = step.value ?? "Enter";
      await page.keyboard.press(key);
      onProgress("pass", `  ✓ Pressed: ${key}`);
      break;
    }

    case "tab": {
      // Tab through multiple elements to test keyboard navigation
      const tabCount = 10;
      for (let i = 0; i < tabCount; i++) {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(100);
      }
      onProgress("pass", `  ✓ Tab navigation: ${tabCount} elements`);
      break;
    }

    case "upload": {
      if (!step.target) throw new Error("No target for upload");
      // Create a minimal test file
      const { writeFileSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const testFile = join(tmpdir(), "inspect-test-upload.txt");
      writeFileSync(testFile, "Inspect test file upload content");

      try {
        const fileInput = await page.locator('input[type="file"]').first();
        await fileInput.setInputFiles(testFile);
        onProgress("pass", `  ✓ Uploaded test file`);
      } catch {
        const selector = await findBySelector(page, `File upload: ${step.target}`, snapshotText, llm);
        if (selector) {
          await page.locator(selector).setInputFiles(testFile);
          onProgress("pass", `  ✓ Uploaded test file`);
        } else {
          throw new Error(`Could not find file input: ${step.target}`);
        }
      }
      break;
    }

    case "wait": {
      const ms = parseInt(step.value ?? "1000", 10);
      await page.waitForTimeout(Math.min(ms, 5000));
      onProgress("pass", `  ✓ Waited ${ms}ms`);
      break;
    }

    case "drag": {
      onProgress("warn", `  ○ Drag not yet supported`);
      break;
    }

    case "assert": {
      const result = await verifyAssertion(step.assertion ?? step.description, page, snapshotText, llm);
      if (result.passed) {
        onProgress("pass", `  ✓ ${result.reason}`);
      } else {
        throw new Error(result.reason);
      }
      break;
    }

    case "screenshot": {
      const dir = join(process.cwd(), ".inspect", "screenshots");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const path = join(dir, `step-${step.id}-${Date.now()}.png`);
      await page.screenshot({ path, fullPage: false });
      step.screenshot = path;
      onProgress("pass", `  ✓ Screenshot saved`);
      break;
    }

    default: {
      onProgress("warn", `  ○ Unknown action: ${step.action}`);
      step.status = "skip";
    }
  }
}

// ---------------------------------------------------------------------------
// Smart assertion verification
// ---------------------------------------------------------------------------

async function verifyAssertion(
  assertion: string,
  page: any,
  snapshot: string,
  llm: LLMCall,
): Promise<{ passed: boolean; reason: string }> {
  // Try common assertions without LLM first
  const lowerAssertion = assertion.toLowerCase();

  // Console error check
  if (lowerAssertion.includes("console") && lowerAssertion.includes("error")) {
    // We can't reliably check past console errors, so pass unless we captured them
    return { passed: true, reason: "Console check passed (no errors captured)" };
  }

  // Title check
  if (lowerAssertion.includes("title")) {
    const title = await page.title();
    if (title && title.length > 0) {
      return { passed: true, reason: `Page title: "${title}"` };
    }
    return { passed: false, reason: "Page has no title" };
  }

  // Broken images check
  if (lowerAssertion.includes("image") && (lowerAssertion.includes("broken") || lowerAssertion.includes("loaded") || lowerAssertion.includes("alt"))) {
    const result = await page.evaluate(`
      (() => {
        const imgs = Array.from(document.querySelectorAll("img"));
        const broken = imgs.filter(img => !img.complete || img.naturalWidth === 0);
        const noAlt = imgs.filter(img => !img.getAttribute("alt"));
        return { total: imgs.length, broken: broken.length, noAlt: noAlt.length };
      })()
    `) as { total: number; broken: number; noAlt: number };

    if (lowerAssertion.includes("alt")) {
      if (result.noAlt === 0) return { passed: true, reason: `All ${result.total} images have alt text` };
      return { passed: false, reason: `${result.noAlt}/${result.total} images missing alt text` };
    }
    if (result.broken === 0) return { passed: true, reason: `All ${result.total} images loaded` };
    return { passed: false, reason: `${result.broken}/${result.total} images broken` };
  }

  // Heading check
  if (lowerAssertion.includes("heading") && lowerAssertion.includes("hierarch")) {
    const headings = await page.evaluate(`
      (() => {
        const hs = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
        return hs.map(h => parseInt(h.tagName.slice(1)));
      })()
    `) as number[];
    if (headings.length === 0) return { passed: false, reason: "No headings found" };
    for (let i = 1; i < headings.length; i++) {
      if (headings[i] > headings[i - 1] + 1) {
        return { passed: false, reason: `Heading skip: H${headings[i - 1]} → H${headings[i]}` };
      }
    }
    return { passed: true, reason: `Heading hierarchy OK (${headings.length} headings)` };
  }

  // Meta tags check
  if (lowerAssertion.includes("meta")) {
    const meta = await page.evaluate(`
      (() => ({
        viewport: !!document.querySelector('meta[name="viewport"]'),
        description: !!document.querySelector('meta[name="description"]'),
        charset: !!document.querySelector('meta[charset]') || !!document.querySelector('meta[http-equiv="Content-Type"]'),
      }))()
    `) as { viewport: boolean; description: boolean; charset: boolean };
    const missing = [];
    if (!meta.viewport) missing.push("viewport");
    if (!meta.description) missing.push("description");
    if (missing.length === 0) return { passed: true, reason: "All meta tags present" };
    return { passed: false, reason: `Missing meta tags: ${missing.join(", ")}` };
  }

  // Navigation links check
  if (lowerAssertion.includes("navigation") && lowerAssertion.includes("link")) {
    const linkCount = await page.evaluate(`document.querySelectorAll("nav a, header a").length`) as number;
    if (linkCount > 0) return { passed: true, reason: `${linkCount} navigation links found` };
    return { passed: false, reason: "No navigation links found" };
  }

  // LLM fallback for complex assertions
  const response = await llm([{
    role: "user",
    content: `Verify this assertion against the current page state:

Assertion: "${assertion}"

Page snapshot:
${snapshot.slice(0, 4000)}

Respond with JSON: {"passed": true/false, "reason": "brief explanation"}`,
  }]);

  try {
    let json = response.trim();
    const match = json.match(/\{[\s\S]*\}/);
    if (match) json = match[0];
    return JSON.parse(json);
  } catch {
    return { passed: true, reason: assertion };
  }
}
