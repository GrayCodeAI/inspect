// ──────────────────────────────────────────────────────────────────────────────
// @inspect/reporter - Markdown Reporter
// ──────────────────────────────────────────────────────────────────────────────

/** Test result data structure */
export interface TestResult {
  /** Test name/instruction */
  name: string;
  /** Overall pass/fail status */
  status: "passed" | "failed" | "skipped" | "error";
  /** Duration in ms */
  duration: number;
  /** Individual steps taken */
  steps: TestStep[];
  /** Error details if failed */
  error?: {
    message: string;
    stack?: string;
    screenshot?: string;
  };
  /** Screenshots captured during the test */
  screenshots: Screenshot[];
  /** Console errors collected */
  consoleErrors?: string[];
  /** Network failures */
  networkFailures?: string[];
  /** Tags/labels */
  tags?: string[];
  /** Started at */
  startedAt: number;
  /** Finished at */
  finishedAt: number;
}

export interface TestStep {
  /** Step number */
  index: number;
  /** Action type */
  action: string;
  /** Target element description */
  target?: string;
  /** Value used */
  value?: string;
  /** Step status */
  status: "passed" | "failed" | "skipped";
  /** Duration in ms */
  duration: number;
  /** Assertion result */
  assertion?: string;
  /** Error if step failed */
  error?: string;
  /** Agent's reasoning */
  thought?: string;
}

export interface Screenshot {
  /** Screenshot name */
  name: string;
  /** File path */
  path: string;
  /** Base64 data (for inline embedding) */
  data?: string;
  /** When taken */
  timestamp: number;
  /** Step index when taken */
  stepIndex?: number;
}

/** Suite-level results */
export interface SuiteResult {
  /** Suite name */
  name: string;
  /** When the suite ran */
  startedAt: number;
  finishedAt: number;
  /** All test results */
  tests: TestResult[];
  /** Environment info */
  environment: {
    browser?: string;
    url?: string;
    model?: string;
    provider?: string;
    os?: string;
    nodeVersion?: string;
  };
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Generates a Markdown report from test results.
 *
 * Includes summary statistics, per-test details with steps,
 * error information, and screenshot references.
 */
export class MarkdownReporter {
  /**
   * Generate a full Markdown report.
   */
  generate(results: SuiteResult): string {
    const lines: string[] = [];

    lines.push(this.generateHeader(results));
    lines.push(this.generateSummary(results));
    lines.push(this.generateEnvironment(results));

    // Failed tests first
    const failed = results.tests.filter((t) => t.status === "failed" || t.status === "error");
    if (failed.length > 0) {
      lines.push("\n## Failed Tests\n");
      for (const test of failed) {
        lines.push(this.generateTestDetail(test));
      }
    }

    // Passed tests
    const passed = results.tests.filter((t) => t.status === "passed");
    if (passed.length > 0) {
      lines.push("\n## Passed Tests\n");
      for (const test of passed) {
        lines.push(this.generateTestDetail(test));
      }
    }

    // Skipped tests
    const skipped = results.tests.filter((t) => t.status === "skipped");
    if (skipped.length > 0) {
      lines.push("\n## Skipped Tests\n");
      for (const test of skipped) {
        lines.push(`- ${test.name}`);
      }
    }

    lines.push(this.generateFooter(results));

    return lines.join("\n");
  }

  /**
   * Generate a compact summary suitable for embedding.
   */
  generateCompact(results: SuiteResult): string {
    const stats = this.getStats(results);
    const lines: string[] = [];

    const statusIcon = stats.failed > 0 ? "FAIL" : "PASS";
    lines.push(`**${statusIcon}** | ${stats.passed}/${stats.total} passed | ${this.formatDuration(stats.totalDuration)}`);

    if (stats.failed > 0) {
      lines.push("\nFailed:");
      const failed = results.tests.filter((t) => t.status === "failed" || t.status === "error");
      for (const test of failed) {
        lines.push(`- ${test.name}: ${test.error?.message ?? "Unknown error"}`);
      }
    }

    return lines.join("\n");
  }

  // ── Section generators ─────────────────────────────────────────────────

  private generateHeader(results: SuiteResult): string {
    const date = new Date(results.startedAt).toISOString().split("T")[0];
    return `# Inspect Test Report\n\n**Suite:** ${results.name}\n**Date:** ${date}\n`;
  }

  private generateSummary(results: SuiteResult): string {
    const stats = this.getStats(results);
    const lines: string[] = [];

    lines.push("## Summary\n");
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Tests | ${stats.total} |`);
    lines.push(`| Passed | ${stats.passed} |`);
    lines.push(`| Failed | ${stats.failed} |`);
    lines.push(`| Skipped | ${stats.skipped} |`);
    lines.push(`| Pass Rate | ${stats.passRate}% |`);
    lines.push(`| Duration | ${this.formatDuration(stats.totalDuration)} |`);
    lines.push(`| Total Steps | ${stats.totalSteps} |`);

    return lines.join("\n");
  }

  private generateEnvironment(results: SuiteResult): string {
    const env = results.environment;
    const lines = ["\n## Environment\n"];

    if (env.browser) lines.push(`- **Browser:** ${env.browser}`);
    if (env.url) lines.push(`- **URL:** ${env.url}`);
    if (env.model) lines.push(`- **Model:** ${env.model}`);
    if (env.provider) lines.push(`- **Provider:** ${env.provider}`);
    if (env.os) lines.push(`- **OS:** ${env.os}`);
    if (env.nodeVersion) lines.push(`- **Node.js:** ${env.nodeVersion}`);

    return lines.join("\n");
  }

  private generateTestDetail(test: TestResult): string {
    const lines: string[] = [];
    const icon = test.status === "passed" ? "[PASS]" : test.status === "failed" ? "[FAIL]" : "[SKIP]";
    const duration = this.formatDuration(test.duration);

    lines.push(`### ${icon} ${test.name}`);
    lines.push(`*Duration: ${duration} | Steps: ${test.steps.length}*\n`);

    if (test.tags?.length) {
      lines.push(`Tags: ${test.tags.map((t) => `\`${t}\``).join(", ")}\n`);
    }

    // Error details
    if (test.error) {
      lines.push("**Error:**");
      lines.push("```");
      lines.push(test.error.message);
      if (test.error.stack) {
        lines.push(test.error.stack);
      }
      lines.push("```\n");

      if (test.error.screenshot) {
        lines.push(`**Error Screenshot:** [View](${test.error.screenshot})\n`);
      }
    }

    // Steps
    if (test.steps.length > 0) {
      lines.push("<details>");
      lines.push(`<summary>Steps (${test.steps.length})</summary>\n`);
      lines.push("| # | Action | Target | Status | Duration |");
      lines.push("|---|--------|--------|--------|----------|");

      for (const step of test.steps) {
        const stepIcon = step.status === "passed" ? "OK" : step.status === "failed" ? "ERR" : "SKIP";
        const target = step.target ? truncate(step.target, 30) : "-";
        const dur = `${step.duration}ms`;
        lines.push(`| ${step.index} | ${step.action} | ${target} | ${stepIcon} | ${dur} |`);

        if (step.error) {
          lines.push(`| | **Error:** ${truncate(step.error, 60)} | | | |`);
        }
      }

      lines.push("</details>\n");
    }

    // Console errors
    if (test.consoleErrors?.length) {
      lines.push("<details>");
      lines.push(`<summary>Console Errors (${test.consoleErrors.length})</summary>\n`);
      lines.push("```");
      for (const error of test.consoleErrors.slice(0, 10)) {
        lines.push(error);
      }
      lines.push("```");
      lines.push("</details>\n");
    }

    // Screenshots
    if (test.screenshots.length > 0) {
      lines.push("<details>");
      lines.push(`<summary>Screenshots (${test.screenshots.length})</summary>\n`);
      for (const ss of test.screenshots) {
        lines.push(`- [${ss.name}](${ss.path})${ss.stepIndex !== undefined ? ` (step ${ss.stepIndex})` : ""}`);
      }
      lines.push("</details>\n");
    }

    return lines.join("\n");
  }

  private generateFooter(results: SuiteResult): string {
    const duration = this.formatDuration(results.finishedAt - results.startedAt);
    return `\n---\n*Generated by Inspect | Total duration: ${duration}*`;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private getStats(results: SuiteResult) {
    const total = results.tests.length;
    const passed = results.tests.filter((t) => t.status === "passed").length;
    const failed = results.tests.filter((t) => t.status === "failed" || t.status === "error").length;
    const skipped = results.tests.filter((t) => t.status === "skipped").length;
    const totalSteps = results.tests.reduce((sum, t) => sum + t.steps.length, 0);
    const totalDuration = results.finishedAt - results.startedAt;
    const passRate = total > 0 ? Math.round((passed / (total - skipped)) * 100) : 0;

    return { total, passed, failed, skipped, totalSteps, totalDuration, passRate };
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = ((ms % 60_000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + "..." : str;
}
