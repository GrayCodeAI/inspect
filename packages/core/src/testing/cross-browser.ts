// ============================================================================
// @inspect/core - Cross-Browser Test Comparator
//
// Runs the same test across multiple browsers in parallel via the
// TestScheduler and compares results to detect browser-specific issues.
// ============================================================================

import type { ExecutionResult, StepResult } from "../orchestrator/executor.js";

export interface CrossBrowserConfig {
  browsers: Array<"chromium" | "firefox" | "webkit">;
  /** Run browsers in parallel. Default: true */
  parallel?: boolean;
}

export interface BrowserRunResult {
  browser: string;
  result: ExecutionResult;
}

export interface CrossBrowserDiff {
  /** Steps that differ across browsers */
  stepDiffs: StepDiff[];
  /** Browsers that passed */
  passedBrowsers: string[];
  /** Browsers that failed */
  failedBrowsers: string[];
  /** Overall consistency — true if all browsers agree */
  consistent: boolean;
  /** Performance comparison */
  performance: PerformanceComparison[];
  /** Summary message */
  summary: string;
}

export interface StepDiff {
  stepIndex: number;
  description: string;
  /** Status per browser */
  results: Array<{
    browser: string;
    status: string;
    error?: string;
    duration: number;
  }>;
  /** Whether all browsers agreed on this step */
  consistent: boolean;
}

export interface PerformanceComparison {
  browser: string;
  totalDuration: number;
  tokenCount: number;
  stepDurations: number[];
  avgStepDuration: number;
}

/**
 * CrossBrowserComparator takes execution results from multiple browsers
 * and produces a detailed comparison showing inconsistencies.
 */
export class CrossBrowserComparator {
  /**
   * Compare results from multiple browser runs.
   */
  compare(runs: BrowserRunResult[]): CrossBrowserDiff {
    if (runs.length === 0) {
      return {
        stepDiffs: [],
        passedBrowsers: [],
        failedBrowsers: [],
        consistent: true,
        performance: [],
        summary: "No runs to compare",
      };
    }

    const passedBrowsers = runs
      .filter((r) => r.result.status === "pass")
      .map((r) => r.browser);

    const failedBrowsers = runs
      .filter((r) => r.result.status !== "pass")
      .map((r) => r.browser);

    // Build step-by-step comparison
    const maxSteps = Math.max(...runs.map((r) => r.result.steps.length));
    const stepDiffs: StepDiff[] = [];

    for (let i = 0; i < maxSteps; i++) {
      const results = runs.map((r) => {
        const step = r.result.steps[i];
        return {
          browser: r.browser,
          status: step?.status ?? "missing",
          error: step?.error,
          duration: step?.duration ?? 0,
        };
      });

      const statuses = new Set(results.map((r) => r.status));
      const description = runs.find((r) => r.result.steps[i])?.result.steps[i]?.description ?? `Step ${i + 1}`;

      stepDiffs.push({
        stepIndex: i,
        description,
        results,
        consistent: statuses.size <= 1,
      });
    }

    // Performance comparison
    const performance: PerformanceComparison[] = runs.map((r) => {
      const durations = r.result.steps.map((s) => s.duration);
      return {
        browser: r.browser,
        totalDuration: r.result.totalDuration,
        tokenCount: r.result.tokenCount,
        stepDurations: durations,
        avgStepDuration: durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0,
      };
    });

    const consistent = passedBrowsers.length === runs.length || failedBrowsers.length === runs.length;
    const inconsistentSteps = stepDiffs.filter((d) => !d.consistent);

    let summary: string;
    if (consistent && failedBrowsers.length === 0) {
      summary = `All ${runs.length} browsers passed consistently`;
    } else if (consistent && passedBrowsers.length === 0) {
      summary = `All ${runs.length} browsers failed consistently`;
    } else {
      summary = `Inconsistent: ${passedBrowsers.join(", ")} passed; ${failedBrowsers.join(", ")} failed. ${inconsistentSteps.length} step(s) differ.`;
    }

    // Sort performance by total duration
    performance.sort((a, b) => a.totalDuration - b.totalDuration);

    const fastest = performance[0];
    const slowest = performance[performance.length - 1];
    if (fastest && slowest && fastest.browser !== slowest.browser) {
      const diff = slowest.totalDuration - fastest.totalDuration;
      summary += ` Fastest: ${fastest.browser} (${this.fmtMs(fastest.totalDuration)}), slowest: ${slowest.browser} (${this.fmtMs(slowest.totalDuration)}, +${this.fmtMs(diff)}).`;
    }

    return {
      stepDiffs,
      passedBrowsers,
      failedBrowsers,
      consistent,
      performance,
      summary,
    };
  }

  /**
   * Format comparison as a markdown report.
   */
  toMarkdown(diff: CrossBrowserDiff): string {
    const lines: string[] = [
      "## Cross-Browser Test Comparison",
      "",
      `**Summary:** ${diff.summary}`,
      "",
    ];

    // Status table
    lines.push("### Status");
    lines.push("| Browser | Status | Duration |");
    lines.push("| --- | --- | --- |");
    for (const p of diff.performance) {
      const status = diff.passedBrowsers.includes(p.browser) ? "Pass" : "Fail";
      lines.push(`| ${p.browser} | ${status} | ${this.fmtMs(p.totalDuration)} |`);
    }
    lines.push("");

    // Inconsistent steps
    const inconsistent = diff.stepDiffs.filter((d) => !d.consistent);
    if (inconsistent.length > 0) {
      lines.push("### Inconsistencies");
      lines.push("");
      for (const step of inconsistent) {
        lines.push(`**Step ${step.stepIndex + 1}: ${step.description}**`);
        for (const r of step.results) {
          lines.push(`- ${r.browser}: ${r.status}${r.error ? ` — ${r.error}` : ""} (${this.fmtMs(r.duration)})`);
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  private fmtMs(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
}
