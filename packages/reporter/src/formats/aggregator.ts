// ============================================================================
// @inspect/reporter - Report Aggregator
//
// Combines multiple test run results into a single summary report.
// Useful for merging parallel runs, cross-browser results, or multi-device
// test suites into one unified view.
// ============================================================================

export interface AggregatedRun {
  id: string;
  name: string;
  device: string;
  browser: string;
  agent: string;
  status: "pass" | "fail" | "error" | "timeout";
  duration: number;
  tokenCount: number;
  steps: AggregatedStep[];
  error?: string;
  timestamp: string;
}

export interface AggregatedStep {
  index: number;
  description: string;
  status: "pass" | "fail" | "skipped";
  duration: number;
  error?: string;
}

export interface AggregatedReport {
  /** Report title */
  title: string;
  /** When the report was generated */
  generatedAt: string;
  /** All included runs */
  runs: AggregatedRun[];
  /** Summary counts */
  summary: {
    totalRuns: number;
    passed: number;
    failed: number;
    errors: number;
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    totalDuration: number;
    totalTokens: number;
    avgDuration: number;
  };
  /** Unique devices tested */
  devices: string[];
  /** Unique browsers tested */
  browsers: string[];
  /** Unique agents used */
  agents: string[];
  /** Steps that failed across multiple runs */
  commonFailures: Array<{
    description: string;
    failedInRuns: string[];
    errors: string[];
  }>;
}

/**
 * ReportAggregator combines multiple test runs into a unified report.
 */
export class ReportAggregator {
  private runs: AggregatedRun[] = [];

  /**
   * Add a run to the aggregation.
   */
  addRun(run: AggregatedRun): void {
    this.runs.push(run);
  }

  /**
   * Add multiple runs.
   */
  addRuns(runs: AggregatedRun[]): void {
    this.runs.push(...runs);
  }

  /**
   * Generate the aggregated report.
   */
  aggregate(title?: string): AggregatedReport {
    const passed = this.runs.filter((r) => r.status === "pass").length;
    const failed = this.runs.filter((r) => r.status === "fail").length;
    const errors = this.runs.filter((r) => r.status === "error" || r.status === "timeout").length;

    const allSteps = this.runs.flatMap((r) => r.steps);
    const passedSteps = allSteps.filter((s) => s.status === "pass").length;
    const failedSteps = allSteps.filter((s) => s.status === "fail").length;

    const totalDuration = this.runs.reduce((sum, r) => sum + r.duration, 0);
    const totalTokens = this.runs.reduce((sum, r) => sum + r.tokenCount, 0);

    const devices = [...new Set(this.runs.map((r) => r.device))];
    const browsers = [...new Set(this.runs.map((r) => r.browser))];
    const agents = [...new Set(this.runs.map((r) => r.agent))];

    return {
      title: title ?? `Test Report (${this.runs.length} runs)`,
      generatedAt: new Date().toISOString(),
      runs: this.runs,
      summary: {
        totalRuns: this.runs.length,
        passed,
        failed,
        errors,
        totalSteps: allSteps.length,
        passedSteps,
        failedSteps,
        totalDuration,
        totalTokens,
        avgDuration: this.runs.length > 0 ? Math.round(totalDuration / this.runs.length) : 0,
      },
      devices,
      browsers,
      agents,
      commonFailures: this.findCommonFailures(),
    };
  }

  /**
   * Export as markdown.
   */
  toMarkdown(report?: AggregatedReport): string {
    const r = report ?? this.aggregate();
    const lines: string[] = [];

    const icon = r.summary.failed > 0 ? "\u274C" : "\u2705";

    lines.push(`# ${icon} ${r.title}`);
    lines.push("");
    lines.push(`*Generated: ${r.generatedAt}*`);
    lines.push("");

    // Summary table
    lines.push("## Summary");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("| --- | --- |");
    lines.push(`| Runs | ${r.summary.totalRuns} |`);
    lines.push(`| Passed | ${r.summary.passed} |`);
    lines.push(`| Failed | ${r.summary.failed} |`);
    lines.push(`| Steps | ${r.summary.passedSteps}/${r.summary.totalSteps} |`);
    lines.push(`| Duration | ${this.fmtMs(r.summary.totalDuration)} |`);
    lines.push(`| Tokens | ${r.summary.totalTokens.toLocaleString()} |`);
    lines.push(`| Devices | ${r.devices.join(", ")} |`);
    lines.push(`| Browsers | ${r.browsers.join(", ")} |`);
    lines.push("");

    // Run details
    lines.push("## Runs");
    lines.push("");
    lines.push("| Run | Device | Browser | Status | Duration | Steps |");
    lines.push("| --- | --- | --- | --- | --- | --- |");

    for (const run of r.runs) {
      const statusIcon = run.status === "pass" ? "\u2705" : "\u274C";
      const stepsOk = run.steps.filter((s) => s.status === "pass").length;
      lines.push(
        `| ${run.name} | ${run.device} | ${run.browser} | ${statusIcon} ${run.status} | ${this.fmtMs(run.duration)} | ${stepsOk}/${run.steps.length} |`,
      );
    }

    // Common failures
    if (r.commonFailures.length > 0) {
      lines.push("");
      lines.push("## Common Failures");
      lines.push("");
      for (const cf of r.commonFailures) {
        lines.push(`### ${cf.description}`);
        lines.push(`Failed in: ${cf.failedInRuns.join(", ")}`);
        for (const err of cf.errors.slice(0, 3)) {
          lines.push(`- ${err}`);
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  /**
   * Export as JSON.
   */
  toJSON(report?: AggregatedReport): string {
    return JSON.stringify(report ?? this.aggregate(), null, 2);
  }

  /**
   * Reset the aggregator.
   */
  reset(): void {
    this.runs = [];
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private findCommonFailures(): AggregatedReport["commonFailures"] {
    const failureMap = new Map<string, { runs: string[]; errors: string[] }>();

    for (const run of this.runs) {
      for (const step of run.steps) {
        if (step.status === "fail") {
          const existing = failureMap.get(step.description);
          if (existing) {
            existing.runs.push(run.name);
            if (step.error && !existing.errors.includes(step.error)) {
              existing.errors.push(step.error);
            }
          } else {
            failureMap.set(step.description, {
              runs: [run.name],
              errors: step.error ? [step.error] : [],
            });
          }
        }
      }
    }

    // Only include failures that appear in 2+ runs
    return Array.from(failureMap.entries())
      .filter(([_, v]) => v.runs.length >= 2)
      .map(([desc, v]) => ({
        description: desc,
        failedInRuns: v.runs,
        errors: v.errors,
      }));
  }

  private fmtMs(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    return `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
  }
}
