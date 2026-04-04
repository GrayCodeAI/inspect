import { describe, it, expect, beforeEach } from "vitest";
import { ReportAggregator } from "./aggregator.js";
import type { AggregatedRun } from "./aggregator.js";

function makeRun(overrides: Partial<AggregatedRun> = {}): AggregatedRun {
  return {
    id: `run-${Math.random().toString(36).slice(2, 6)}`,
    name: "Login test",
    device: "desktop-chrome",
    browser: "chromium",
    agent: "claude",
    status: "pass",
    duration: 5000,
    tokenCount: 200,
    steps: [
      { index: 0, description: "Navigate", status: "pass", duration: 1000 },
      { index: 1, description: "Click login", status: "pass", duration: 800 },
    ],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("ReportAggregator", () => {
  let aggregator: ReportAggregator;

  beforeEach(() => {
    aggregator = new ReportAggregator();
  });

  it("aggregates basic stats", () => {
    aggregator.addRun(makeRun());
    aggregator.addRun(makeRun({ status: "fail", device: "iphone-15" }));

    const report = aggregator.aggregate("My Report");
    expect(report.title).toBe("My Report");
    expect(report.summary.totalRuns).toBe(2);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(1);
  });

  it("collects unique devices/browsers/agents", () => {
    aggregator.addRuns([
      makeRun({ device: "desktop-chrome", browser: "chromium", agent: "claude" }),
      makeRun({ device: "iphone-15", browser: "webkit", agent: "gpt" }),
      makeRun({ device: "desktop-firefox", browser: "firefox", agent: "claude" }),
    ]);

    const report = aggregator.aggregate();
    expect(report.devices).toHaveLength(3);
    expect(report.browsers).toHaveLength(3);
    expect(report.agents).toHaveLength(2);
  });

  it("counts steps correctly", () => {
    aggregator.addRun(
      makeRun({
        steps: [
          { index: 0, description: "A", status: "pass", duration: 100 },
          { index: 1, description: "B", status: "fail", duration: 200 },
          { index: 2, description: "C", status: "pass", duration: 100 },
        ],
      }),
    );

    const report = aggregator.aggregate();
    expect(report.summary.totalSteps).toBe(3);
    expect(report.summary.passedSteps).toBe(2);
    expect(report.summary.failedSteps).toBe(1);
  });

  it("finds common failures across runs", () => {
    aggregator.addRuns([
      makeRun({
        name: "Run 1",
        status: "fail",
        steps: [
          { index: 0, description: "Navigate", status: "pass", duration: 100 },
          {
            index: 1,
            description: "Click submit",
            status: "fail",
            duration: 200,
            error: "Element not found",
          },
        ],
      }),
      makeRun({
        name: "Run 2",
        status: "fail",
        steps: [
          { index: 0, description: "Navigate", status: "pass", duration: 100 },
          {
            index: 1,
            description: "Click submit",
            status: "fail",
            duration: 200,
            error: "Timeout",
          },
        ],
      }),
    ]);

    const report = aggregator.aggregate();
    expect(report.commonFailures).toHaveLength(1);
    expect(report.commonFailures[0].description).toBe("Click submit");
    expect(report.commonFailures[0].failedInRuns).toHaveLength(2);
    expect(report.commonFailures[0].errors).toHaveLength(2);
  });

  it("does not include single-run failures as common", () => {
    aggregator.addRuns([
      makeRun({
        name: "Run 1",
        steps: [
          { index: 0, description: "Unique step", status: "fail", duration: 100, error: "err" },
        ],
      }),
      makeRun({ name: "Run 2" }),
    ]);

    const report = aggregator.aggregate();
    expect(report.commonFailures).toHaveLength(0);
  });

  it("calculates average duration", () => {
    aggregator.addRuns([makeRun({ duration: 4000 }), makeRun({ duration: 6000 })]);

    const report = aggregator.aggregate();
    expect(report.summary.avgDuration).toBe(5000);
  });

  it("toMarkdown produces valid markdown", () => {
    aggregator.addRun(makeRun());
    aggregator.addRun(makeRun({ status: "fail" }));

    const md = aggregator.toMarkdown();
    expect(md).toContain("# ");
    expect(md).toContain("## Summary");
    expect(md).toContain("## Runs");
    expect(md).toContain("| Run |");
  });

  it("toJSON produces valid JSON", () => {
    aggregator.addRun(makeRun());
    const json = aggregator.toJSON();
    const parsed = JSON.parse(json);
    expect(parsed.summary.totalRuns).toBe(1);
  });

  it("reset clears all runs", () => {
    aggregator.addRun(makeRun());
    aggregator.reset();
    const report = aggregator.aggregate();
    expect(report.summary.totalRuns).toBe(0);
  });

  it("handles empty aggregation", () => {
    const report = aggregator.aggregate();
    expect(report.summary.totalRuns).toBe(0);
    expect(report.summary.avgDuration).toBe(0);
    expect(report.commonFailures).toHaveLength(0);
  });
});
