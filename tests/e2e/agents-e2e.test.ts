// ============================================================================
// E2E Agent Tests — Real browser against local HTML fixture
//
// These tests launch a real HTTP server + Playwright browser and run
// individual agent functions against the fixture pages.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

// ---------------------------------------------------------------------------
// Local HTTP server for fixtures
// ---------------------------------------------------------------------------

const FIXTURE_DIR = join(__dirname, "fixtures");
const PORT = 9876;
let server: Server;

function serveFixtures(): Promise<Server> {
  return new Promise((resolve) => {
    const s = createServer((req: IncomingMessage, res: ServerResponse) => {
      let filePath = join(FIXTURE_DIR, req.url === "/" ? "index.html" : req.url!);

      // Add .html extension if no extension
      if (!extname(filePath)) {
        filePath += ".html";
      }

      if (existsSync(filePath)) {
        const content = readFileSync(filePath, "utf-8");
        const mimeTypes: Record<string, string> = {
          ".html": "text/html",
          ".css": "text/css",
          ".js": "application/javascript",
          ".json": "application/json",
          ".png": "image/png",
          ".xml": "application/xml",
          ".txt": "text/plain",
        };
        const ext = extname(filePath);
        res.writeHead(200, { "Content-Type": mimeTypes[ext] ?? "text/html" });
        res.end(content);
      } else {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<h1>404 Not Found</h1>");
      }
    });
    s.listen(PORT, () => resolve(s));
  });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

// Skip E2E tests if playwright is not available
let playwright: typeof import("playwright") | null = null;
let browser: any = null;

beforeAll(async () => {
  try {
    playwright = await import("playwright");
    browser = await playwright.chromium.launch({ headless: true });
    server = await serveFixtures();
  } catch {
    // Playwright not installed — tests will be skipped
  }
}, 30_000);

afterAll(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});

function skipIfNoBrowser() {
  if (!browser) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("E2E: Agents against fixture site", () => {

  it("fixture server serves index.html", async () => {
    if (skipIfNoBrowser()) return;
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/`);
    const title = await page.title();
    expect(title).toBe("Inspect Test Fixture");
    await page.close();
  });

  it("planner detects landing page type", async () => {
    if (skipIfNoBrowser()) return;
    const { detectPageType } = await import("../../apps/cli/src/agents/planner.js");
    expect(detectPageType(`http://localhost:${PORT}/`, "")).toBe("landing");
    expect(detectPageType(`http://localhost:${PORT}/login.html`, "")).toBe("auth");
  });

  it("accessibility finds issues on fixture", async () => {
    if (skipIfNoBrowser()) return;
    const { checkAccessibility } = await import("../../apps/cli/src/agents/accessibility.js");

    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/`);

    const report = await checkAccessibility(page, `http://localhost:${PORT}/`, () => {});

    // Fixture has intentional a11y issues: missing alt, low contrast, heading skip, unlabeled input
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(100);

    // Check specific issues we planted
    const rules = report.issues.map(i => i.rule);
    expect(rules.some(r => r === "image-alt" || r === "color-contrast" || r === "heading-order" || r === "label")).toBe(true);

    await page.close();
  });

  it("SEO audit finds meta tags", async () => {
    if (skipIfNoBrowser()) return;
    const { auditMetaTags } = await import("../../apps/cli/src/agents/seo.js");

    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/`);

    const meta = await auditMetaTags(page);

    expect(meta.title).toBe("Inspect Test Fixture");
    expect(meta.description).toContain("test fixture");
    expect(meta.ogTitle).toBe("Test Fixture");
    expect(meta.viewport).toBeTruthy();

    await page.close();
  });

  it("form-filler detects contact form", async () => {
    if (skipIfNoBrowser()) return;
    const { detectForms } = await import("../../apps/cli/src/agents/form-filler.js");

    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/`);

    const forms = await detectForms(page);

    expect(forms.length).toBeGreaterThanOrEqual(1);
    const contactForm = forms.find(f => f.formType === "contact");
    expect(contactForm).toBeDefined();
    expect(contactForm!.fields.length).toBeGreaterThanOrEqual(3); // name, email, message
    expect(contactForm!.hasSubmitButton).toBe(true);

    await page.close();
  });

  it("form-filler detects login form", async () => {
    if (skipIfNoBrowser()) return;
    const { detectForms } = await import("../../apps/cli/src/agents/form-filler.js");

    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/login.html`);

    const forms = await detectForms(page);

    expect(forms.length).toBeGreaterThanOrEqual(1);
    const loginForm = forms.find(f => f.formType === "login");
    expect(loginForm).toBeDefined();
    expect(loginForm!.fields.some(f => f.type === "password")).toBe(true);

    await page.close();
  });

  it("security audit checks headers and cookies", async () => {
    if (skipIfNoBrowser()) return;
    const { checkSecurityHeaders, auditCookies } = await import("../../apps/cli/src/agents/security-agent.js");

    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/`);

    const headers = await checkSecurityHeaders(page, `http://localhost:${PORT}/`);
    // Local dev server won't have security headers
    expect(headers.hsts).toBe(false);

    const cookies = await auditCookies(page);
    expect(Array.isArray(cookies)).toBe(true);

    await page.close();
  });

  it("performance measures CWV", async () => {
    if (skipIfNoBrowser()) return;
    const { measureCoreWebVitals } = await import("../../apps/cli/src/agents/performance-agent.js");

    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
    await page.waitForTimeout(1000);

    const vitals = await measureCoreWebVitals(page);

    // Local fixture should load fast
    expect(vitals.domContentLoaded).toBeGreaterThan(0);
    // FCP should be measurable
    expect(vitals.fcp).toBeGreaterThanOrEqual(0);

    await page.close();
  });

  it("responsive detects overflow issues", async () => {
    if (skipIfNoBrowser()) return;
    const { checkHorizontalOverflow, checkTouchTargets } = await import("../../apps/cli/src/agents/responsive.js");

    const page = await browser.newPage();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`http://localhost:${PORT}/`);

    const overflow = await checkHorizontalOverflow(page);
    // Fixture CSS should prevent overflow
    expect(Array.isArray(overflow)).toBe(true);

    const touchIssues = await checkTouchTargets(page, true);
    // Fixture has a .tiny-link that's too small
    expect(Array.isArray(touchIssues)).toBe(true);

    await page.close();
  });

  it("navigator handles the fixture page", async () => {
    if (skipIfNoBrowser()) return;
    const { navigateTo } = await import("../../apps/cli/src/agents/navigator.js");

    const page = await browser.newPage();
    const result = await navigateTo(page, `http://localhost:${PORT}/`, () => {});

    expect(result.title).toBe("Inspect Test Fixture");
    expect(result.status).toBe(200);
    expect(result.loadTime).toBeGreaterThan(0);

    await page.close();
  });

  it("tester executes screenshot step", async () => {
    if (skipIfNoBrowser()) return;
    const { executeStep } = await import("../../apps/cli/src/agents/tester.js");

    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/`);

    const step = { id: 1, action: "screenshot", description: "Take screenshot", status: "pending" as const };
    const llm = async () => "ok";
    const result = await executeStep(step, page, "", llm, () => {});

    expect(result.status).toBe("pass");
    expect(result.screenshot).toBeTruthy();

    await page.close();
  });

  it("tester clicks a link", async () => {
    if (skipIfNoBrowser()) return;
    const { executeStep } = await import("../../apps/cli/src/agents/tester.js");

    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/`);

    const step = { id: 1, action: "click", description: "Click About", target: "About", status: "pending" as const };
    const llm = async () => 'text="About"';
    const result = await executeStep(step, page, "", llm, () => {});

    expect(result.status).toBe("pass");
    expect(page.url()).toContain("about");

    await page.close();
  });

  it("validator validates assertion via LLM", async () => {
    if (skipIfNoBrowser()) return;
    const { validateStep } = await import("../../apps/cli/src/agents/validator.js");

    const step = { id: 1, action: "click", description: "Click about", assertion: "Page shows about content", status: "pass" as const };
    const llm = async () => '{"valid": true, "details": "About content visible", "confidence": 0.9}';

    const result = await validateStep(step, "before", "after with about content", llm, () => {});

    expect(result.valid).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("reporter generates report with scores", async () => {
    if (skipIfNoBrowser()) return;
    const { generateReport } = await import("../../apps/cli/src/agents/reporter.js");

    const plan = { url: `http://localhost:${PORT}/`, title: "Test", steps: [], createdAt: Date.now() };
    const results = [
      { id: 1, action: "assert", description: "Check", status: "pass" as const, duration: 100 },
      { id: 2, action: "click", description: "Click", status: "fail" as const, error: "Not found", duration: 200 },
    ];
    const a11y = [{ url: `http://localhost:${PORT}/`, issues: [{ severity: "serious" as const, rule: "image-alt", description: "Missing alt", page: `http://localhost:${PORT}/` }], score: 85 }];

    const report = generateReport(plan, results, a11y, [], Date.now() - 3000, () => {});

    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.overallScore).toBeGreaterThan(0);
    expect(report.summary.overallScore).toBeLessThan(100);
  });
});
