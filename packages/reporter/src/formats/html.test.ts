import { describe, it, expect } from "vitest";
import { HTMLReporter } from "./html.js";
import type { SuiteResult } from "./markdown.js";

function createSuiteResult(overrides?: Partial<SuiteResult>): SuiteResult {
  return {
    name: "Test Suite",
    startedAt: 1700000000000,
    finishedAt: 1700000005000,
    tests: [
      {
        name: "Login test",
        status: "passed",
        duration: 2000,
        steps: [
          { index: 1, action: "click", target: "Login button", status: "passed", duration: 100 },
          {
            index: 2,
            action: "fill",
            target: "Email input",
            value: "user@test.com",
            status: "passed",
            duration: 50,
          },
        ],
        screenshots: [],
        startedAt: 1700000000000,
        finishedAt: 1700000002000,
      },
      {
        name: "Checkout test",
        status: "failed",
        duration: 3000,
        steps: [
          { index: 1, action: "click", target: "Add to cart", status: "passed", duration: 100 },
          {
            index: 2,
            action: "click",
            target: "Checkout",
            status: "failed",
            duration: 50,
            error: "Button not found",
          },
        ],
        error: { message: "Checkout button not found on page" },
        screenshots: [],
        startedAt: 1700000002000,
        finishedAt: 1700000005000,
      },
    ],
    environment: { browser: "chromium", url: "https://example.com" },
    ...overrides,
  };
}

describe("HTMLReporter", () => {
  it("generates a complete HTML document", () => {
    const reporter = new HTMLReporter();
    const html = reporter.generate(createSuiteResult());

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("</html>");
  });

  it("includes the suite name in the title", () => {
    const reporter = new HTMLReporter();
    const html = reporter.generate(createSuiteResult());

    expect(html).toContain("Inspect Report - Test Suite");
  });

  it("allows custom title", () => {
    const reporter = new HTMLReporter({ title: "My Custom Report" });
    const html = reporter.generate(createSuiteResult());

    expect(html).toContain("My Custom Report");
  });

  it("shows correct pass/fail counts", () => {
    const reporter = new HTMLReporter();
    const html = reporter.generate(createSuiteResult());

    // 2 total tests
    expect(html).toContain(">2</div>");
    // 1 passed
    expect(html).toContain('<div class="card card-pass">');
    // 1 failed
    expect(html).toContain('<div class="card card-fail">');
  });

  it("shows FAILED status when any test fails", () => {
    const reporter = new HTMLReporter();
    const html = reporter.generate(createSuiteResult());

    expect(html).toContain("FAILED");
    expect(html).toContain('class="overall-status fail"');
  });

  it("shows PASSED status when all tests pass", () => {
    const reporter = new HTMLReporter();
    const suite = createSuiteResult({
      tests: [
        {
          name: "Simple test",
          status: "passed",
          duration: 1000,
          steps: [],
          screenshots: [],
          startedAt: 0,
          finishedAt: 1000,
        },
      ],
    });
    const html = reporter.generate(suite);

    expect(html).toContain("PASSED");
    expect(html).toContain('class="overall-status pass"');
  });

  it("escapes HTML in test names to prevent XSS", () => {
    const reporter = new HTMLReporter();
    const suite = createSuiteResult({
      tests: [
        {
          name: '<script>alert("xss")</script>',
          status: "passed",
          duration: 100,
          steps: [],
          screenshots: [],
          startedAt: 0,
          finishedAt: 100,
        },
      ],
    });
    const html = reporter.generate(suite);

    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in error messages", () => {
    const reporter = new HTMLReporter();
    const suite = createSuiteResult({
      tests: [
        {
          name: "Failing test",
          status: "failed",
          duration: 100,
          steps: [],
          screenshots: [],
          error: { message: "<img src=x onerror=alert(1)>" },
          startedAt: 0,
          finishedAt: 100,
        },
      ],
    });
    const html = reporter.generate(suite);

    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("renders step details in table", () => {
    const reporter = new HTMLReporter();
    const html = reporter.generate(createSuiteResult());

    expect(html).toContain("steps-table");
    expect(html).toContain("<code>click</code>");
    expect(html).toContain("<code>fill</code>");
    expect(html).toContain("Login button");
  });

  it("renders step errors", () => {
    const reporter = new HTMLReporter();
    const html = reporter.generate(createSuiteResult());

    expect(html).toContain("Button not found");
  });

  it("renders inline screenshots with sanitized base64", () => {
    const reporter = new HTMLReporter({ embedScreenshots: true });
    const suite = createSuiteResult({
      tests: [
        {
          name: "Screenshot test",
          status: "passed",
          duration: 100,
          steps: [],
          screenshots: [
            { name: "Final state", path: "", data: "iVBORw0KGgoAAAA=", timestamp: Date.now() },
          ],
          startedAt: 0,
          finishedAt: 100,
        },
      ],
    });
    const html = reporter.generate(suite);

    expect(html).toContain("data:image/png;base64,iVBORw0KGgoAAAA=");
    expect(html).toContain("Final state");
  });

  it("sanitizes screenshot base64 data", () => {
    const reporter = new HTMLReporter();
    const suite = createSuiteResult({
      tests: [
        {
          name: "Bad data test",
          status: "passed",
          duration: 100,
          steps: [],
          screenshots: [
            {
              name: "test",
              path: "",
              data: 'abc"><script>alert(1)</script>',
              timestamp: Date.now(),
            },
          ],
          startedAt: 0,
          finishedAt: 100,
        },
      ],
    });
    const html = reporter.generate(suite);

    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("escapes screenshot file paths", () => {
    const reporter = new HTMLReporter();
    const suite = createSuiteResult({
      tests: [
        {
          name: "Path test",
          status: "passed",
          duration: 100,
          steps: [],
          screenshots: [{ name: "test", path: '"><script>xss</script>', timestamp: Date.now() }],
          startedAt: 0,
          finishedAt: 100,
        },
      ],
    });
    const html = reporter.generate(suite);

    expect(html).not.toContain('"><script>xss</script>');
    expect(html).toContain("&quot;&gt;&lt;script&gt;xss&lt;/script&gt;");
  });

  it("renders console errors section", () => {
    const reporter = new HTMLReporter();
    const suite = createSuiteResult({
      tests: [
        {
          name: "Console test",
          status: "failed",
          duration: 100,
          steps: [],
          screenshots: [],
          consoleErrors: ["TypeError: null is not an object", "NetworkError: fetch failed"],
          startedAt: 0,
          finishedAt: 100,
        },
      ],
    });
    const html = reporter.generate(suite);

    expect(html).toContain("Console Errors (2)");
    expect(html).toContain("TypeError: null is not an object");
  });

  it("includes interactive JavaScript when enabled", () => {
    const reporter = new HTMLReporter({ interactive: true });
    const html = reporter.generate(createSuiteResult());

    expect(html).toContain("toggleTest");
    expect(html).toContain("openLightbox");
    expect(html).toContain("filter-btn");
  });

  it("excludes JavaScript when interactive is disabled", () => {
    const reporter = new HTMLReporter({ interactive: false });
    const html = reporter.generate(createSuiteResult());

    expect(html).not.toContain("<script>");
  });

  it("injects custom CSS", () => {
    const reporter = new HTMLReporter({ customCSS: ".custom { color: red; }" });
    const html = reporter.generate(createSuiteResult());

    expect(html).toContain(".custom { color: red; }");
  });

  it("sorts failed tests before passed tests", () => {
    const reporter = new HTMLReporter();
    const html = reporter.generate(createSuiteResult());

    const failedPos = html.indexOf("Checkout test");
    const passedPos = html.indexOf("Login test");
    expect(failedPos).toBeLessThan(passedPos);
  });

  it("formats durations correctly", () => {
    const reporter = new HTMLReporter();
    const html = reporter.generate(createSuiteResult());

    // 5000ms total = 5.0s
    expect(html).toContain("5.0s");
  });
});
