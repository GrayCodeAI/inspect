// ============================================================================
// @inspect/reporter - GitHub Actions Reporter
//
// Outputs test results as GitHub Actions annotations (::error, ::warning,
// ::notice) and generates a Job Summary (GITHUB_STEP_SUMMARY) markdown table.
// ============================================================================

import { appendFileSync } from "node:fs";

export interface GitHubActionsReporterOptions {
  /** Write to GITHUB_STEP_SUMMARY. Default: true if env var is set */
  stepSummary?: boolean;
  /** Emit ::error/::warning annotations. Default: true */
  annotations?: boolean;
  /** Group output in a foldable group. Default: true */
  groupOutput?: boolean;
  /** Custom title for the summary. Default: "Inspect Test Results" */
  title?: string;
}

export interface ActionsTestSuite {
  results: ActionsTestResult[];
  duration: number;
  agent: string;
  url?: string;
}

export interface ActionsTestResult {
  name: string;
  device: string;
  status: "pass" | "fail" | "error" | "skip";
  duration: number;
  steps: ActionsTestStep[];
  error?: string;
  tokenCount?: number;
}

export interface ActionsTestStep {
  description: string;
  status: "pass" | "fail" | "skip";
  duration?: number;
  error?: string;
}

/**
 * GitHubActionsReporter outputs test results in GitHub Actions format:
 *
 * - `::error` / `::warning` annotations that appear inline on PR diffs
 * - Job summary markdown written to GITHUB_STEP_SUMMARY
 * - Output groups for organized console output
 *
 * Usage:
 * ```ts
 * const reporter = new GitHubActionsReporter();
 * reporter.report(suite);
 * ```
 */
export class GitHubActionsReporter {
  private options: Required<GitHubActionsReporterOptions>;

  constructor(options: GitHubActionsReporterOptions = {}) {
    this.options = {
      stepSummary: options.stepSummary ?? !!process.env.GITHUB_STEP_SUMMARY,
      annotations: options.annotations ?? true,
      groupOutput: options.groupOutput ?? true,
      title: options.title ?? "Inspect Test Results",
    };
  }

  /**
   * Report a full test suite.
   */
  report(suite: ActionsTestSuite): void {
    const passed = suite.results.filter((r) => r.status === "pass").length;
    const failed = suite.results.filter((r) => r.status === "fail" || r.status === "error").length;
    const skipped = suite.results.filter((r) => r.status === "skip").length;
    const total = suite.results.length;

    // Console output
    if (this.options.groupOutput) {
      this.startGroup(this.options.title);
    }

    console.log(`\nTest Results: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped`);
    console.log(`Duration: ${this.fmtMs(suite.duration)} | Agent: ${suite.agent}`);
    if (suite.url) console.log(`URL: ${suite.url}`);
    console.log("");

    // Annotations
    if (this.options.annotations) {
      for (const result of suite.results) {
        this.emitAnnotations(result);
      }
    }

    // Per-test output
    for (const result of suite.results) {
      const icon =
        result.status === "pass" ? "\u2713" : result.status === "fail" ? "\u2717" : "\u25CB";
      console.log(
        `  ${icon} ${result.name} (${result.device}) - ${result.status} [${this.fmtMs(result.duration)}]`,
      );
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
    }

    if (this.options.groupOutput) {
      this.endGroup();
    }

    // Step Summary
    if (this.options.stepSummary) {
      this.writeStepSummary(suite, { passed, failed, skipped, total });
    }
  }

  /**
   * Emit a single GitHub Actions annotation.
   */
  annotate(
    level: "error" | "warning" | "notice",
    message: string,
    params?: { file?: string; line?: number; col?: number; title?: string },
  ): void {
    const parts = [`::${level}`];
    const attrs: string[] = [];

    if (params?.file) attrs.push(`file=${params.file}`);
    if (params?.line) attrs.push(`line=${params.line}`);
    if (params?.col) attrs.push(`col=${params.col}`);
    if (params?.title) attrs.push(`title=${params.title}`);

    if (attrs.length > 0) {
      parts[0] += ` ${attrs.join(",")}`;
    }

    console.log(`${parts[0]}::${message}`);
  }

  /**
   * Set a GitHub Actions output variable.
   */
  setOutput(name: string, value: string): void {
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
      appendFileSync(outputFile, `${name}=${value}\n`);
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private emitAnnotations(result: ActionsTestResult): void {
    if (result.status === "fail" || result.status === "error") {
      this.annotate("error", result.error ?? `Test failed: ${result.name}`, {
        title: `${result.name} (${result.device})`,
      });

      // Annotate individual failing steps
      for (const step of result.steps) {
        if (step.status === "fail" && step.error) {
          this.annotate("warning", step.error, {
            title: `Step: ${step.description}`,
          });
        }
      }
    }
  }

  private writeStepSummary(
    suite: ActionsTestSuite,
    counts: { passed: number; failed: number; skipped: number; total: number },
  ): void {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryFile) return;

    const statusEmoji = counts.failed > 0 ? "\u274C" : "\u2705";
    const lines: string[] = [
      `## ${statusEmoji} ${this.options.title}`,
      "",
      `| Metric | Value |`,
      `| --- | --- |`,
      `| Total | ${counts.total} |`,
      `| Passed | ${counts.passed} |`,
      `| Failed | ${counts.failed} |`,
      `| Skipped | ${counts.skipped} |`,
      `| Duration | ${this.fmtMs(suite.duration)} |`,
      `| Agent | ${suite.agent} |`,
      "",
      "### Results",
      "",
      "| Test | Device | Status | Duration |",
      "| --- | --- | --- | --- |",
    ];

    for (const result of suite.results) {
      const icon =
        result.status === "pass" ? "\u2705" : result.status === "fail" ? "\u274C" : "\u23ED";
      lines.push(
        `| ${result.name} | ${result.device} | ${icon} ${result.status} | ${this.fmtMs(result.duration)} |`,
      );
    }

    // Failed step details
    const failedResults = suite.results.filter((r) => r.status === "fail" || r.status === "error");
    if (failedResults.length > 0) {
      lines.push("", "### Failures", "");
      for (const result of failedResults) {
        lines.push(`<details><summary>${result.name} (${result.device})</summary>`, "");
        if (result.error) lines.push(`**Error:** ${result.error}`, "");
        for (const step of result.steps) {
          const si =
            step.status === "pass" ? "\u2705" : step.status === "fail" ? "\u274C" : "\u23ED";
          lines.push(`- ${si} ${step.description}${step.error ? ` — ${step.error}` : ""}`);
        }
        lines.push("", "</details>", "");
      }
    }

    lines.push(
      "",
      `*Generated by [Inspect](https://github.com/inspect) at ${new Date().toISOString()}*`,
    );

    appendFileSync(summaryFile, lines.join("\n") + "\n");

    // Also set outputs for downstream jobs
    this.setOutput("test-passed", String(counts.passed));
    this.setOutput("test-failed", String(counts.failed));
    this.setOutput("test-total", String(counts.total));
    this.setOutput("test-status", counts.failed > 0 ? "fail" : "pass");
  }

  private startGroup(name: string): void {
    console.log(`::group::${name}`);
  }

  private endGroup(): void {
    console.log("::endgroup::");
  }

  private fmtMs(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    return `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
  }
}
