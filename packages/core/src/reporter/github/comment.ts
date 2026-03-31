// ──────────────────────────────────────────────────────────────────────────────
// @inspect/reporter - GitHub PR Comment Formatter
// ──────────────────────────────────────────────────────────────────────────────

import type { SuiteResult, TestResult } from "../formats/markdown.js";

/** Options for formatting GitHub comments */
export interface GitHubCommentOptions {
  /** Maximum comment length (GitHub limit is ~65536) */
  maxLength?: number;
  /** Whether to include step details for failed tests */
  includeFailedSteps?: boolean;
  /** Whether to include screenshots as linked images */
  includeScreenshots?: boolean;
  /** Base URL for screenshot links */
  screenshotBaseUrl?: string;
  /** Whether to include a comparison with previous run */
  comparison?: ComparisonData | null;
  /** Custom header text */
  header?: string;
}

/** Data for comparing with a previous run */
export interface ComparisonData {
  previousPassRate: number;
  previousDuration: number;
  newTests: string[];
  fixedTests: string[];
  regressedTests: string[];
}

/**
 * Formats test results for GitHub PR comments.
 *
 * Produces compact, well-formatted markdown optimized for
 * GitHub's rendering, including collapsible sections and
 * status badges.
 */
export class GitHubCommentFormatter {
  private options: GitHubCommentOptions;

  constructor(options?: GitHubCommentOptions) {
    this.options = {
      maxLength: 60_000,
      includeFailedSteps: true,
      includeScreenshots: true,
      ...options,
    };
  }

  /**
   * Format test results for a PR comment.
   */
  format(results: SuiteResult): string {
    const parts: string[] = [];

    parts.push(this.formatHeader(results));
    parts.push(this.formatSummaryTable(results));

    if (this.options.comparison) {
      parts.push(this.formatComparison(this.options.comparison));
    }

    // Failed test details
    const failed = results.tests.filter((t) => t.status === "failed" || t.status === "error");
    if (failed.length > 0) {
      parts.push(this.formatFailedTests(failed));
    }

    // Pass details (collapsed)
    const passed = results.tests.filter((t) => t.status === "passed");
    if (passed.length > 0) {
      parts.push(this.formatPassedTests(passed));
    }

    parts.push(this.formatFooter(results));

    let result = parts.join("\n\n");

    // Truncate if too long
    const maxLen = this.options.maxLength ?? 60_000;
    if (result.length > maxLen) {
      result =
        result.slice(0, maxLen - 100) +
        "\n\n---\n*Report truncated. See full report in artifacts.*";
    }

    return result;
  }

  /**
   * Format a minimal status line (for use in check run summaries).
   */
  formatStatusLine(results: SuiteResult): string {
    const stats = this.getStats(results);
    const icon = stats.failed > 0 ? ":x:" : ":white_check_mark:";
    return `${icon} **${stats.passed}/${stats.total}** tests passed (${stats.passRate}%) in ${this.formatDuration(stats.duration)}`;
  }

  // ── Section formatters ─────────────────────────────────────────────────

  private formatHeader(results: SuiteResult): string {
    const stats = this.getStats(results);
    const icon = stats.failed > 0 ? ":x:" : ":white_check_mark:";
    const header = this.options.header ?? "## Inspect Test Results";

    return `${header} ${icon}`;
  }

  private formatSummaryTable(results: SuiteResult): string {
    const stats = this.getStats(results);

    return `| Metric | Result |
|--------|--------|
| **Tests** | ${stats.passed} passed, ${stats.failed} failed, ${stats.skipped} skipped (${stats.total} total) |
| **Pass Rate** | ${stats.passRate}% |
| **Duration** | ${this.formatDuration(stats.duration)} |
| **Steps** | ${stats.totalSteps} |
| **Model** | ${results.environment.model ?? "N/A"} |`;
  }

  private formatComparison(comparison: ComparisonData): string {
    const lines: string[] = ["### Comparison with Previous Run"];

    const passDelta =
      comparison.previousPassRate > 0
        ? `(${comparison.previousPassRate > 0 ? "+" : ""}${comparison.previousPassRate.toFixed(0)}% change)`
        : "";
    lines.push(`Pass rate change: ${passDelta}`);

    if (comparison.fixedTests.length > 0) {
      lines.push(
        `\n:white_check_mark: **Fixed** (${comparison.fixedTests.length}): ${comparison.fixedTests.join(", ")}`,
      );
    }

    if (comparison.regressedTests.length > 0) {
      lines.push(
        `\n:x: **Regressed** (${comparison.regressedTests.length}): ${comparison.regressedTests.join(", ")}`,
      );
    }

    if (comparison.newTests.length > 0) {
      lines.push(
        `\n:new: **New tests** (${comparison.newTests.length}): ${comparison.newTests.join(", ")}`,
      );
    }

    return lines.join("\n");
  }

  private formatFailedTests(tests: TestResult[]): string {
    const lines: string[] = [`### :x: Failed Tests (${tests.length})`];

    for (const test of tests) {
      lines.push(`\n<details>`);
      lines.push(
        `<summary><strong>${escapeMarkdown(test.name)}</strong> - ${test.error?.message ?? "Unknown error"}</summary>\n`,
      );

      if (test.error) {
        lines.push("```");
        lines.push(test.error.message);
        if (test.error.stack) {
          lines.push(test.error.stack.split("\n").slice(0, 5).join("\n"));
        }
        lines.push("```");
      }

      if (this.options.includeFailedSteps && test.steps.length > 0) {
        lines.push("\n**Steps:**");
        for (const step of test.steps) {
          const icon =
            step.status === "passed"
              ? ":white_check_mark:"
              : step.status === "failed"
                ? ":x:"
                : ":yellow_circle:";
          const detail = step.target ? ` on \`${step.target}\`` : "";
          const value = step.value ? ` "${truncate(step.value, 40)}"` : "";
          lines.push(`${step.index}. ${icon} \`${step.action}\`${detail}${value}`);

          if (step.error) {
            lines.push(`   > Error: ${step.error}`);
          }
        }
      }

      if (this.options.includeScreenshots && test.error?.screenshot) {
        const url = this.options.screenshotBaseUrl
          ? `${this.options.screenshotBaseUrl}/${test.error.screenshot}`
          : test.error.screenshot;
        lines.push(`\n![Error Screenshot](${url})`);
      }

      lines.push("</details>");
    }

    return lines.join("\n");
  }

  private formatPassedTests(tests: TestResult[]): string {
    const lines: string[] = [];

    lines.push(`<details>`);
    lines.push(`<summary>:white_check_mark: Passed Tests (${tests.length})</summary>\n`);

    for (const test of tests) {
      const duration = this.formatDuration(test.duration);
      lines.push(`- ${escapeMarkdown(test.name)} (${duration}, ${test.steps.length} steps)`);
    }

    lines.push("</details>");

    return lines.join("\n");
  }

  private formatFooter(results: SuiteResult): string {
    const time = new Date(results.finishedAt).toISOString();
    return `---\n<sub>Generated by [Inspect](https://github.com/inspect) at ${time} | ${results.environment.provider ?? ""}/${results.environment.model ?? ""}</sub>`;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private getStats(results: SuiteResult) {
    const total = results.tests.length;
    const passed = results.tests.filter((t) => t.status === "passed").length;
    const failed = results.tests.filter(
      (t) => t.status === "failed" || t.status === "error",
    ).length;
    const skipped = results.tests.filter((t) => t.status === "skipped").length;
    const totalSteps = results.tests.reduce((sum, t) => sum + t.steps.length, 0);
    const duration = results.finishedAt - results.startedAt;
    const passRate = total > 0 ? Math.round((passed / Math.max(total - skipped, 1)) * 100) : 0;

    return { total, passed, failed, skipped, totalSteps, duration, passRate };
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = ((ms % 60_000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

function escapeMarkdown(str: string): string {
  return str.replace(/([_*[]()~`>#+=|{}.!\\-])/g, "\\$1");
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + "..." : str;
}
