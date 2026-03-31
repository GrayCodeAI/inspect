import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubActionsReporter } from "./github-actions.js";
import type { ActionsTestSuite} from "./github-actions.js";

describe("GitHubActionsReporter", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    delete process.env.GITHUB_STEP_SUMMARY;
    delete process.env.GITHUB_OUTPUT;
  });

  function makeSuite(overrides: Partial<ActionsTestSuite> = {}): ActionsTestSuite {
    return {
      results: [
        { name: "Login test", device: "desktop-chrome", status: "pass", duration: 5000, steps: [{ description: "Navigate", status: "pass", duration: 1000 }] },
        { name: "Search test", device: "desktop-chrome", status: "fail", duration: 8000, steps: [{ description: "Type query", status: "pass" }, { description: "Submit", status: "fail", error: "Timeout" }], error: "Search timed out" },
      ],
      duration: 13000,
      agent: "claude",
      ...overrides,
    };
  }

  it("outputs test results to console", () => {
    const reporter = new GitHubActionsReporter({ stepSummary: false, groupOutput: false });
    reporter.report(makeSuite());

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("1/2 passed");
    expect(output).toContain("1 failed");
    expect(output).toContain("claude");
  });

  it("emits ::error annotations for failures", () => {
    const reporter = new GitHubActionsReporter({ stepSummary: false, groupOutput: false });
    reporter.report(makeSuite());

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("::error");
    expect(output).toContain("Search timed out");
  });

  it("emits ::warning for failing steps", () => {
    const reporter = new GitHubActionsReporter({ stepSummary: false, groupOutput: false });
    reporter.report(makeSuite());

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("::warning");
    expect(output).toContain("Timeout");
  });

  it("wraps output in group when enabled", () => {
    const reporter = new GitHubActionsReporter({ stepSummary: false, groupOutput: true });
    reporter.report(makeSuite());

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("::group::");
    expect(output).toContain("::endgroup::");
  });

  it("skips annotations when disabled", () => {
    const reporter = new GitHubActionsReporter({ stepSummary: false, annotations: false, groupOutput: false });
    reporter.report(makeSuite());

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).not.toContain("::error");
  });

  it("handles all-pass suite", () => {
    const reporter = new GitHubActionsReporter({ stepSummary: false, groupOutput: false });
    reporter.report(makeSuite({
      results: [
        { name: "Test A", device: "chrome", status: "pass", duration: 1000, steps: [] },
        { name: "Test B", device: "chrome", status: "pass", duration: 2000, steps: [] },
      ],
    }));

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("2/2 passed");
    expect(output).toContain("0 failed");
    expect(output).not.toContain("::error");
  });

  it("annotate method formats correctly", () => {
    const reporter = new GitHubActionsReporter({ stepSummary: false });
    reporter.annotate("error", "Something broke", { title: "My Test", file: "test.ts", line: 42 });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("::error file=test.ts,line=42,title=My Test::Something broke");
  });

  it("uses custom title", () => {
    const reporter = new GitHubActionsReporter({ stepSummary: false, title: "My Custom Title", groupOutput: true });
    reporter.report(makeSuite());

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("My Custom Title");
  });
});
