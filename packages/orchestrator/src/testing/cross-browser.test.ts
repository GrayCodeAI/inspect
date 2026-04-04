import { describe, it, expect } from "vitest";
import { CrossBrowserComparator } from "./cross-browser.js";
import type { BrowserRunResult } from "./cross-browser.js";
import type { ExecutionResult } from "../orchestrator/executor.js";

function makeResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    status: "pass",
    steps: [
      { index: 0, description: "Navigate", status: "pass", duration: 500, toolCalls: [] },
      { index: 1, description: "Click button", status: "pass", duration: 300, toolCalls: [] },
    ],
    totalDuration: 800,
    tokenCount: 100,
    agent: "claude",
    device: "desktop",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("CrossBrowserComparator", () => {
  const comparator = new CrossBrowserComparator();

  it("reports consistent when all browsers pass", () => {
    const runs: BrowserRunResult[] = [
      { browser: "chromium", result: makeResult() },
      { browser: "firefox", result: makeResult() },
      { browser: "webkit", result: makeResult() },
    ];

    const diff = comparator.compare(runs);
    expect(diff.consistent).toBe(true);
    expect(diff.passedBrowsers).toHaveLength(3);
    expect(diff.failedBrowsers).toHaveLength(0);
    expect(diff.summary).toContain("passed consistently");
  });

  it("reports consistent when all browsers fail", () => {
    const runs: BrowserRunResult[] = [
      { browser: "chromium", result: makeResult({ status: "fail" }) },
      { browser: "firefox", result: makeResult({ status: "fail" }) },
    ];

    const diff = comparator.compare(runs);
    expect(diff.consistent).toBe(true);
    expect(diff.failedBrowsers).toHaveLength(2);
    expect(diff.summary).toContain("failed consistently");
  });

  it("reports inconsistent when browsers disagree", () => {
    const runs: BrowserRunResult[] = [
      { browser: "chromium", result: makeResult() },
      { browser: "firefox", result: makeResult({ status: "fail" }) },
    ];

    const diff = comparator.compare(runs);
    expect(diff.consistent).toBe(false);
    expect(diff.passedBrowsers).toEqual(["chromium"]);
    expect(diff.failedBrowsers).toEqual(["firefox"]);
    expect(diff.summary).toContain("Inconsistent");
  });

  it("detects step-level inconsistencies", () => {
    const chromiumResult = makeResult();
    const firefoxResult = makeResult({
      steps: [
        { index: 0, description: "Navigate", status: "pass", duration: 500, toolCalls: [] },
        {
          index: 1,
          description: "Click button",
          status: "fail",
          error: "Element not found",
          duration: 300,
          toolCalls: [],
        },
      ],
      status: "fail",
    });

    const runs: BrowserRunResult[] = [
      { browser: "chromium", result: chromiumResult },
      { browser: "firefox", result: firefoxResult },
    ];

    const diff = comparator.compare(runs);
    const inconsistentSteps = diff.stepDiffs.filter((s) => !s.consistent);
    expect(inconsistentSteps.length).toBe(1);
    expect(inconsistentSteps[0].description).toBe("Click button");
  });

  it("compares performance across browsers", () => {
    const runs: BrowserRunResult[] = [
      { browser: "chromium", result: makeResult({ totalDuration: 800 }) },
      { browser: "firefox", result: makeResult({ totalDuration: 1200 }) },
      { browser: "webkit", result: makeResult({ totalDuration: 600 }) },
    ];

    const diff = comparator.compare(runs);
    expect(diff.performance).toHaveLength(3);
    // Sorted by duration
    expect(diff.performance[0].browser).toBe("webkit");
    expect(diff.performance[2].browser).toBe("firefox");
  });

  it("handles empty runs", () => {
    const diff = comparator.compare([]);
    expect(diff.consistent).toBe(true);
    expect(diff.summary).toBe("No runs to compare");
  });

  it("toMarkdown produces valid markdown", () => {
    const runs: BrowserRunResult[] = [
      { browser: "chromium", result: makeResult() },
      { browser: "firefox", result: makeResult({ status: "fail" }) },
    ];

    const diff = comparator.compare(runs);
    const md = comparator.toMarkdown(diff);

    expect(md).toContain("## Cross-Browser");
    expect(md).toContain("| Browser |");
    expect(md).toContain("chromium");
    expect(md).toContain("firefox");
  });
});
