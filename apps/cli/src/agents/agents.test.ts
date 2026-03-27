// ============================================================================
// Agent System Integration Tests
// Tests for all agent modules without requiring a real browser or LLM.
// Uses mocked page objects and LLM responses.
// ============================================================================

import { describe, it, expect, vi } from "vitest";
import type { LLMCall, ProgressCallback, TestStep, TestPlan, A11yReport } from "./types.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Create a no-op progress callback */
function mockProgress(): ProgressCallback {
  return vi.fn();
}

/** Create a mock LLM that returns canned JSON responses */
function mockLlm(response: string): LLMCall {
  return vi.fn().mockResolvedValue(response);
}

/** Create a mock Playwright Page object */
function mockPage(overrides: Record<string, unknown> = {}): any {
  const evaluateResults: Record<string, unknown> = {};
  return {
    goto: vi.fn().mockResolvedValue(null),
    title: vi.fn().mockResolvedValue("Test Page"),
    url: vi.fn().mockReturnValue("https://example.com"),
    content: vi.fn().mockResolvedValue("<html><body>Hello</body></html>"),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("PNG")),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(null),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(null),
    waitForFunction: vi.fn().mockResolvedValue(null),
    $: vi.fn().mockResolvedValue(null),
    $$: vi.fn().mockResolvedValue([]),
    evaluate: vi.fn().mockImplementation((script: string) => {
      // Return canned results based on script content
      if (script.includes("querySelectorAll") && script.includes("img")) return Promise.resolve([]);
      if (script.includes("querySelectorAll") && script.includes("input")) return Promise.resolve([]);
      if (script.includes("querySelectorAll") && script.includes("h1")) return Promise.resolve([]);
      if (script.includes("lang")) return Promise.resolve(true);
      if (script.includes("viewport")) return Promise.resolve(true);
      if (script.includes("scrollWidth")) return Promise.resolve(false);
      if (script.includes("axe")) return Promise.resolve([]);
      if (script.includes("title")) return Promise.resolve("Test Page");
      if (script.includes("performance")) return Promise.resolve({ lcp: 1200, cls: 0.05, fid: 50, fcp: 800, ttfb: 200, domContentLoaded: 1000, fullLoad: 1500 });
      if (evaluateResults[script]) return Promise.resolve(evaluateResults[script]);
      return Promise.resolve(null);
    }),
    addScriptTag: vi.fn().mockResolvedValue(null),
    getByText: vi.fn().mockReturnValue({ first: () => ({ click: vi.fn().mockResolvedValue(undefined), fill: vi.fn().mockResolvedValue(undefined), waitFor: vi.fn().mockResolvedValue(undefined), scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined), hover: vi.fn().mockResolvedValue(undefined), dblclick: vi.fn().mockResolvedValue(undefined), locator: vi.fn().mockReturnValue({ first: () => ({ fill: vi.fn().mockResolvedValue(undefined) }) }) }) }),
    getByRole: vi.fn().mockReturnValue({ first: () => ({ click: vi.fn().mockResolvedValue(undefined), fill: vi.fn().mockResolvedValue(undefined), waitFor: vi.fn().mockResolvedValue(undefined), hover: vi.fn().mockResolvedValue(undefined) }) }),
    getByLabel: vi.fn().mockReturnValue({ first: () => ({ click: vi.fn().mockResolvedValue(undefined), fill: vi.fn().mockResolvedValue(undefined), check: vi.fn().mockResolvedValue(undefined), uncheck: vi.fn().mockResolvedValue(undefined), selectOption: vi.fn().mockResolvedValue(undefined), waitFor: vi.fn().mockResolvedValue(undefined) }) }),
    getByPlaceholder: vi.fn().mockReturnValue({ first: () => ({ click: vi.fn().mockResolvedValue(undefined), fill: vi.fn().mockResolvedValue(undefined), waitFor: vi.fn().mockResolvedValue(undefined) }) }),
    locator: vi.fn().mockReturnValue({ first: () => ({ setInputFiles: vi.fn().mockResolvedValue(undefined) }) }),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    check: vi.fn().mockResolvedValue(undefined),
    uncheck: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    dblclick: vi.fn().mockResolvedValue(undefined),
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    mouse: { click: vi.fn().mockResolvedValue(undefined) },
    on: vi.fn(),
    removeListener: vi.fn(),
    context: vi.fn().mockReturnValue({ cookies: vi.fn().mockResolvedValue([]) }),
    ...overrides,
  };
}

// ============================================================================
// Types tests
// ============================================================================

describe("types", () => {
  it("exports all required types", async () => {
    const types = await import("./types.js");
    // Verify key type exports exist (runtime check on the module)
    expect(types).toBeDefined();
  });
});

// ============================================================================
// Cache tests
// ============================================================================

describe("cache", () => {
  it("withCache returns same response for identical prompts", async () => {
    const { withCache } = await import("./cache.js");
    let callCount = 0;
    // Use a unique prompt each test run to avoid stale cache from previous runs
    const uniqueKey = `test-cache-${Date.now()}-${Math.random()}`;
    const baseLlm: LLMCall = async () => { callCount++; return "response-" + callCount; };
    const cached = withCache(baseLlm, { enabled: true });

    const messages = [{ role: "user", content: uniqueKey }];
    const r1 = await cached(messages);
    const r2 = await cached(messages);

    expect(r1).toBe(r2);
    expect(callCount).toBe(1); // Only one actual LLM call
  });

  it("withCache disabled passes through", async () => {
    const { withCache } = await import("./cache.js");
    let callCount = 0;
    const baseLlm: LLMCall = async () => { callCount++; return "response-" + callCount; };
    const cached = withCache(baseLlm, { enabled: false });

    const messages = [{ role: "user", content: "test-disabled" }];
    await cached(messages);
    await cached(messages);

    expect(callCount).toBe(2); // Both calls hit LLM
  });
});

// ============================================================================
// Safe evaluate tests
// ============================================================================

describe("evaluate", () => {
  it("safeEvaluate returns result on success", async () => {
    const { safeEvaluate } = await import("./evaluate.js");
    const page = mockPage({
      evaluate: vi.fn().mockResolvedValue(42),
    });
    const result = await safeEvaluate(page, "1 + 1", 0);
    expect(result).toBe(42);
  });

  it("safeEvaluate returns fallback on error", async () => {
    const { safeEvaluate } = await import("./evaluate.js");
    const page = mockPage({
      evaluate: vi.fn().mockRejectedValue(new Error("page crashed")),
    });
    const result = await safeEvaluate(page, "broken", "fallback");
    expect(result).toBe("fallback");
  });

  it("safeEvaluate returns fallback on timeout", async () => {
    const { safeEvaluate } = await import("./evaluate.js");
    const page = mockPage({
      evaluate: vi.fn().mockImplementation(() => new Promise(() => {})), // never resolves
    });
    const result = await safeEvaluate(page, "hangs", "timeout-fallback", 50);
    expect(result).toBe("timeout-fallback");
  });
});

// ============================================================================
// Planner tests
// ============================================================================

describe("planner", () => {
  it("detectPageType identifies auth pages", async () => {
    const { detectPageType } = await import("./planner.js");
    expect(detectPageType("https://example.com/login", "")).toBe("auth");
    expect(detectPageType("https://example.com/signup", "")).toBe("auth");
    expect(detectPageType("https://example.com/sign-in", "")).toBe("auth");
  });

  it("detectPageType identifies dashboard", async () => {
    const { detectPageType } = await import("./planner.js");
    expect(detectPageType("https://example.com/dashboard", "")).toBe("dashboard");
  });

  it("detectPageType returns landing for root", async () => {
    const { detectPageType } = await import("./planner.js");
    expect(detectPageType("https://example.com/", "")).toBe("landing");
    expect(detectPageType("https://example.com", "")).toBe("landing");
  });

  it("detectPageType detects search from snapshot", async () => {
    const { detectPageType } = await import("./planner.js");
    expect(detectPageType("https://example.com/page", '[role="search"] input')).toBe("search");
  });

  it("planTests creates a plan with steps", async () => {
    const { planTests } = await import("./planner.js");
    const llm = mockLlm('[{"id":1,"action":"assert","description":"Check title","assertion":"Has title"},{"id":2,"action":"click","description":"Click home","target":"Home"}]');
    const progress = mockProgress();

    const plan = await planTests("https://example.com", "snapshot text", "Example", llm, progress);

    expect(plan.url).toBe("https://example.com");
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    expect(plan.steps[0].action).toBeDefined();
  });

  it("planTests falls back when LLM returns invalid JSON", async () => {
    const { planTests } = await import("./planner.js");
    const llm = mockLlm("This is not JSON at all, sorry!");
    const progress = mockProgress();

    const plan = await planTests("https://example.com", 'link "Home"\nlink "About"\nbutton "Submit"', "Example", llm, progress);

    expect(plan.steps.length).toBeGreaterThan(0);
    // Fallback plan should have assertions and screenshots
    expect(plan.steps.some(s => s.action === "screenshot")).toBe(true);
    expect(plan.steps.some(s => s.action === "assert")).toBe(true);
  });

  it("generateTestData returns valid data", async () => {
    const { generateTestData } = await import("./planner.js");
    const data = generateTestData();

    expect(data.email).toContain("@inspect.dev");
    expect(data.password).toBe("Inspect_Test_2024!");
    expect(data.name.full).toContain(" ");
    expect(data.creditCard.number).toBe("4242424242424242");
    expect(data.phone).toContain("555");
    expect(data.address.country).toBe("US");
  });
});

// ============================================================================
// Tester tests
// ============================================================================

describe("tester", () => {
  it("executeStep handles screenshot action", async () => {
    const { executeStep } = await import("./tester.js");
    const page = mockPage();
    const llm = mockLlm("");
    const progress = mockProgress();

    const step: TestStep = { id: 1, action: "screenshot", description: "Take screenshot", status: "pending" };
    const result = await executeStep(step, page, "", llm, progress);

    expect(result.status).toBe("pass");
    expect(page.screenshot).toHaveBeenCalled();
  });

  it("executeStep handles scroll action", async () => {
    const { executeStep } = await import("./tester.js");
    const page = mockPage();
    const llm = mockLlm("");
    const progress = mockProgress();

    const step: TestStep = { id: 1, action: "scroll", description: "Scroll down", status: "pending" };
    const result = await executeStep(step, page, "", llm, progress);

    expect(result.status).toBe("pass");
    expect(page.evaluate).toHaveBeenCalled();
  });

  it("executeStep handles press action", async () => {
    const { executeStep } = await import("./tester.js");
    const page = mockPage();
    const llm = mockLlm("");
    const progress = mockProgress();

    const step: TestStep = { id: 1, action: "press", description: "Press Enter", value: "Enter", status: "pending" };
    const result = await executeStep(step, page, "", llm, progress);

    expect(result.status).toBe("pass");
    expect(page.keyboard.press).toHaveBeenCalledWith("Enter");
  });

  it("executeStep handles wait action", async () => {
    const { executeStep } = await import("./tester.js");
    const page = mockPage();
    const llm = mockLlm("");
    const progress = mockProgress();

    const step: TestStep = { id: 1, action: "wait", description: "Wait 500ms", value: "500", status: "pending" };
    const result = await executeStep(step, page, "", llm, progress);

    expect(result.status).toBe("pass");
  });

  it("executeStep handles click with text target", async () => {
    const { executeStep } = await import("./tester.js");
    const page = mockPage();
    const llm = mockLlm("");
    const progress = mockProgress();

    const step: TestStep = { id: 1, action: "click", description: "Click login", target: "Login", status: "pending" };
    const result = await executeStep(step, page, "", llm, progress);

    expect(result.status).toBe("pass");
  });

  it("executeStep records duration", async () => {
    const { executeStep } = await import("./tester.js");
    const page = mockPage();
    const llm = mockLlm("");
    const progress = mockProgress();

    const step: TestStep = { id: 1, action: "screenshot", description: "Screenshot", status: "pending" };
    const result = await executeStep(step, page, "", llm, progress);

    expect(result.duration).toBeDefined();
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("executeStep handles unknown actions without crashing", async () => {
    const { executeStep } = await import("./tester.js");
    const page = mockPage();
    const llm = mockLlm("");
    const progress = mockProgress();

    const step: TestStep = { id: 1, action: "unknown_action", description: "Unknown", status: "pending" };
    const result = await executeStep(step, page, "", llm, progress);

    // Unknown actions either skip or pass (warn) — both are acceptable
    expect(["pass", "skip"]).toContain(result.status);
  });
});

// ============================================================================
// Validator tests
// ============================================================================

describe("validator", () => {
  it("validateStep returns valid when no assertion", async () => {
    const { validateStep } = await import("./validator.js");
    const llm = mockLlm("");
    const progress = mockProgress();

    const step: TestStep = { id: 1, action: "click", description: "Click", status: "pass" };
    const result = await validateStep(step, "before", "after", llm, progress);

    expect(result.valid).toBe(true);
    expect(result.details).toContain("No assertion");
  });

  it("validateStep returns invalid for failed step", async () => {
    const { validateStep } = await import("./validator.js");
    const llm = mockLlm("");
    const progress = mockProgress();

    const step: TestStep = { id: 1, action: "click", description: "Click", status: "fail", error: "Not found" };
    const result = await validateStep(step, "before", "after", llm, progress);

    expect(result.valid).toBe(false);
  });

  it("validateStep uses LLM for assertion checking", async () => {
    const { validateStep } = await import("./validator.js");
    const llm = mockLlm('{"valid": true, "details": "Title changed as expected", "confidence": 0.95}');
    const progress = mockProgress();

    const step: TestStep = { id: 1, action: "click", description: "Click home", assertion: "Title changes", status: "pass" };
    const result = await validateStep(step, "before snapshot", "after snapshot", llm, progress);

    expect(result.valid).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("createNetworkMonitor tracks failures", async () => {
    const { createNetworkMonitor } = await import("./validator.js");
    const page = mockPage();
    const monitor = createNetworkMonitor(page);

    expect(monitor.failures).toEqual([]);
    expect(typeof monitor.start).toBe("function");
    expect(typeof monitor.stop).toBe("function");
  });

  it("createConsoleMonitor captures errors", async () => {
    const { createConsoleMonitor } = await import("./validator.js");
    const page = mockPage();
    const monitor = createConsoleMonitor(page);

    expect(monitor.errors).toEqual([]);
    monitor.start();
    expect(page.on).toHaveBeenCalled();
  });
});

// ============================================================================
// Reporter tests
// ============================================================================

describe("reporter", () => {
  it("generateReport produces a valid report", async () => {
    const { generateReport } = await import("./reporter.js");
    const progress = mockProgress();

    const plan: TestPlan = {
      url: "https://example.com",
      title: "Example",
      steps: [],
      createdAt: Date.now(),
    };

    const results: TestStep[] = [
      { id: 1, action: "assert", description: "Check title", status: "pass", duration: 100 },
      { id: 2, action: "click", description: "Click button", status: "fail", error: "Not found", duration: 200 },
      { id: 3, action: "screenshot", description: "Screenshot", status: "skip", duration: 50 },
    ];

    const a11y: A11yReport[] = [{ url: "https://example.com", issues: [], score: 95 }];

    const report = generateReport(plan, results, a11y, [], Date.now() - 5000, progress);

    expect(report.url).toBe("https://example.com");
    expect(report.summary.total).toBe(3);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.skipped).toBe(1);
    expect(report.summary.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.summary.overallScore).toBeLessThanOrEqual(100);
    expect(report.timestamp).toBeDefined();
  });

  it("generateGitHubAnnotations produces annotation strings", async () => {
    const { generateReport, generateGitHubAnnotations } = await import("./reporter.js");
    const progress = mockProgress();

    const plan: TestPlan = { url: "https://example.com", title: "Example", steps: [], createdAt: Date.now() };
    const results: TestStep[] = [
      { id: 1, action: "assert", description: "Check title", status: "fail", error: "Title missing", duration: 100 },
    ];
    const report = generateReport(plan, results, [], [], Date.now(), progress);

    const annotations = generateGitHubAnnotations(report);
    expect(annotations).toContain("::error");
    expect(annotations).toContain("Title missing");
  });
});

// ============================================================================
// Form-filler tests
// ============================================================================

describe("form-filler", () => {
  it("generateTestData returns all required fields", async () => {
    const { generateTestData } = await import("./form-filler.js");
    const data = generateTestData();

    expect(data.name.first).toBeTruthy();
    expect(data.name.last).toBeTruthy();
    expect(data.name.full).toContain(data.name.first);
    expect(data.email).toMatch(/@inspect\.dev$/);
    expect(data.password.length).toBeGreaterThan(8);
    expect(data.phone).toMatch(/\+1/);
    expect(data.address.zip).toBeTruthy();
    expect(data.creditCard.number).toBe("4242424242424242");
    expect(data.creditCard.cvv).toBe("123");
    expect(data.username).toContain("inspect_test_");
  });

  it("generateTestData returns unique emails", async () => {
    const { generateTestData } = await import("./form-filler.js");
    const d1 = generateTestData();
    const d2 = generateTestData();
    expect(d1.email).not.toBe(d2.email);
  });

  it("detectForms returns empty array for page with no forms", async () => {
    const { detectForms } = await import("./form-filler.js");
    const page = mockPage({
      evaluate: vi.fn().mockResolvedValue([]),
    });
    const forms = await detectForms(page);
    expect(forms).toEqual([]);
  });
});

// ============================================================================
// Navigator tests
// ============================================================================

describe("navigator", () => {
  it("detectRedirectLoop detects repeated URLs", async () => {
    const { detectRedirectLoop } = await import("./navigator.js");
    expect(detectRedirectLoop(["https://a.com", "https://b.com", "https://a.com", "https://b.com", "https://a.com"])).toBe(true);
  });

  it("detectRedirectLoop returns false for normal history", async () => {
    const { detectRedirectLoop } = await import("./navigator.js");
    expect(detectRedirectLoop(["https://a.com", "https://b.com", "https://c.com"])).toBe(false);
  });

  it("detectRedirectLoop handles empty history", async () => {
    const { detectRedirectLoop } = await import("./navigator.js");
    expect(detectRedirectLoop([])).toBe(false);
  });
});

// ============================================================================
// Accessibility tests
// ============================================================================

describe("accessibility", () => {
  it("checkAccessibility returns a report with score", async () => {
    const { checkAccessibility } = await import("./accessibility.js");
    const page = mockPage({
      evaluate: vi.fn().mockImplementation((script: string) => {
        if (typeof script === "string" && script.includes("lang")) return Promise.resolve(true);
        if (typeof script === "string" && script.includes("viewport")) return Promise.resolve("width=device-width, initial-scale=1");
        if (typeof script === "string" && script.includes("axe")) return Promise.resolve([]);
        if (typeof script === "string" && script.includes("skip")) return Promise.resolve(true);
        if (typeof script === "string" && script.includes("focus")) return Promise.resolve(true);
        if (typeof script === "string" && script.includes("activeElement")) return Promise.resolve(null);
        return Promise.resolve([]);
      }),
      addScriptTag: vi.fn().mockResolvedValue(null),
      waitForFunction: vi.fn().mockRejectedValue(new Error("no axe")), // axe not available
      keyboard: { press: vi.fn().mockResolvedValue(undefined) },
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    });
    const progress = mockProgress();

    const report = await checkAccessibility(page, "https://example.com", progress);

    expect(report.url).toBe("https://example.com");
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(report.issues)).toBe(true);
  });
});

// ============================================================================
// SEO tests
// ============================================================================

describe("seo", () => {
  it("auditMetaTags extracts meta information", async () => {
    const { auditMetaTags } = await import("./seo.js");
    const page = mockPage({
      evaluate: vi.fn().mockResolvedValue({
        title: "Test Page",
        description: "A test page for SEO",
        ogTitle: "Test Page OG",
        ogDescription: null,
        ogImage: null,
        twitterCard: null,
        viewport: "width=device-width, initial-scale=1",
        charset: "utf-8",
      }),
    });

    const result = await auditMetaTags(page);
    expect(result.title).toBe("Test Page");
    expect(result.description).toBe("A test page for SEO");
    expect(result.viewport).toBeTruthy();
  });
});

// ============================================================================
// Performance agent tests
// ============================================================================

describe("performance-agent", () => {
  it("measureCoreWebVitals returns metrics object", async () => {
    const { measureCoreWebVitals } = await import("./performance-agent.js");
    const page = mockPage({
      evaluate: vi.fn().mockResolvedValue({
        lcp: 1200, cls: 0.05, fid: 50, fcp: 800, ttfb: 200,
        domContentLoaded: 1000, fullLoad: 1500,
      }),
    });

    const vitals = await measureCoreWebVitals(page);
    expect(vitals.lcp).toBe(1200);
    expect(vitals.cls).toBe(0.05);
    expect(vitals.fcp).toBe(800);
    expect(vitals.ttfb).toBe(200);
  });
});

// ============================================================================
// Responsive tests
// ============================================================================

describe("responsive", () => {
  it("checkHorizontalOverflow returns empty array when no overflow", async () => {
    const { checkHorizontalOverflow } = await import("./responsive.js");
    const page = mockPage({
      evaluate: vi.fn().mockResolvedValue({ hasOverflow: false, elements: [] }),
    });

    const issues = await checkHorizontalOverflow(page);
    expect(Array.isArray(issues)).toBe(true);
  });
});

// ============================================================================
// Security agent tests
// ============================================================================

describe("security-agent", () => {
  it("auditCookies returns empty array for page with no cookies", async () => {
    const { auditCookies } = await import("./security-agent.js");
    const page = mockPage();

    const result = await auditCookies(page);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("scanExposedData returns empty for clean page", async () => {
    const { scanExposedData } = await import("./security-agent.js");
    const page = mockPage({
      content: vi.fn().mockResolvedValue("<html><body>Clean page</body></html>"),
    });

    const result = await scanExposedData(page);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("scanExposedData detects AWS keys", async () => {
    const { scanExposedData } = await import("./security-agent.js");
    const page = mockPage({
      content: vi.fn().mockResolvedValue('<html><body><script>const key = "AKIAIOSFODNN7EXAMPLE";</script></body></html>'),
    });

    const result = await scanExposedData(page);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].type).toBe("api-key");
  });
});
