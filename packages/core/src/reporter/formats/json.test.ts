import { describe, it, expect } from "vitest";
import { JSONReporter } from "./json.js";
import type { SuiteResult } from "./markdown.js";

function makeSuite(): SuiteResult {
  return {
    name: "JSON Suite",
    startedAt: 1700000000000,
    finishedAt: 1700000003000,
    tests: [
      {
        name: "Fast test",
        status: "passed",
        duration: 500,
        startedAt: 1700000000000,
        finishedAt: 1700000000500,
        steps: [{ index: 1, action: "click", status: "passed", duration: 500 }],
        screenshots: [],
      },
      {
        name: "Slow test",
        status: "passed",
        duration: 2000,
        startedAt: 1700000000500,
        finishedAt: 1700000002500,
        steps: [
          { index: 1, action: "navigate", status: "passed", duration: 1000 },
          { index: 2, action: "fill", status: "passed", duration: 1000, thought: "Filling form" },
        ],
        screenshots: [{ name: "result", path: "/tmp/result.png", timestamp: 1700000002000 }],
      },
    ],
    environment: { browser: "chromium" },
  };
}

describe("JSONReporter", () => {
  describe("generate", () => {
    it("produces valid JSON", () => {
      const reporter = new JSONReporter();
      const output = reporter.generate(makeSuite());
      const parsed = JSON.parse(output);
      expect(parsed.version).toBe("1.0.0");
    });

    it("produces compact JSON when pretty=false", () => {
      const reporter = new JSONReporter({ pretty: false });
      const output = reporter.generate(makeSuite());
      expect(output).not.toContain("\n");
    });
  });

  describe("buildReport", () => {
    it("calculates correct summary stats", () => {
      const reporter = new JSONReporter();
      const report = reporter.buildReport(makeSuite());
      expect(report.summary.total).toBe(2);
      expect(report.summary.passed).toBe(2);
      expect(report.summary.failed).toBe(0);
      expect(report.summary.passRate).toBe(100);
      expect(report.summary.totalSteps).toBe(3);
    });

    it("identifies slowest and fastest tests", () => {
      const reporter = new JSONReporter();
      const report = reporter.buildReport(makeSuite());
      expect(report.timing.slowestTest?.name).toBe("Slow test");
      expect(report.timing.fastestTest?.name).toBe("Fast test");
    });

    it("calculates average test duration", () => {
      const reporter = new JSONReporter();
      const report = reporter.buildReport(makeSuite());
      expect(report.timing.averageTestDuration).toBe(1250);
    });

    it("includes environment data", () => {
      const reporter = new JSONReporter();
      const report = reporter.buildReport(makeSuite());
      expect(report.environment.browser).toBe("chromium");
    });

    it("converts test results correctly", () => {
      const reporter = new JSONReporter();
      const report = reporter.buildReport(makeSuite());
      expect(report.tests).toHaveLength(2);
      expect(report.tests[0].name).toBe("Fast test");
      expect(report.tests[1].steps).toHaveLength(2);
    });

    it("includes thoughts when enabled", () => {
      const reporter = new JSONReporter({ includeThoughts: true });
      const report = reporter.buildReport(makeSuite());
      expect(report.tests[1].steps[1].thought).toBe("Filling form");
    });

    it("excludes thoughts when disabled", () => {
      const reporter = new JSONReporter({ includeThoughts: false });
      const report = reporter.buildReport(makeSuite());
      expect(report.tests[1].steps[1].thought).toBeUndefined();
    });
  });

  describe("generateSummary", () => {
    it("produces a summary with status", () => {
      const reporter = new JSONReporter();
      const summary = JSON.parse(reporter.generateSummary(makeSuite()));
      expect(summary.status).toBe("passed");
      expect(summary.total).toBe(2);
    });
  });
});
