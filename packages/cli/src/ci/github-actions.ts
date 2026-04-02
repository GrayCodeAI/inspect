/**
 * GitHub Actions Integration
 *
 * Native integration with GitHub Actions workflows.
 * Provides annotations, checks, and summary reports.
 */

import { EventEmitter } from "events";

export interface GitHubActionsConfig {
  /** Enable annotations */
  annotations: boolean;
  /** Enable job summary */
  jobSummary: boolean;
  /** Enable PR comments */
  prComments: boolean;
  /** Enable check runs */
  checkRuns: boolean;
  /** Check name */
  checkName: string;
  /** Fail threshold */
  failThreshold: number;
  /** Warning threshold */
  warningThreshold: number;
  /** Artifact upload */
  uploadArtifacts: boolean;
  /** Artifact retention days */
  artifactRetention: number;
}

export interface GitHubAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  start_column?: number;
  end_column?: number;
  annotation_level: "notice" | "warning" | "failure";
  message: string;
  title?: string;
  raw_details?: string;
}

export interface GitHubCheckRun {
  name: string;
  head_sha: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | "action_required";
  output: {
    title: string;
    summary: string;
    text?: string;
    annotations?: GitHubAnnotation[];
  };
}

export interface TestResultForGitHub {
  name: string;
  file: string;
  line?: number;
  status: "passed" | "failed" | "skipped" | "flaky";
  duration: number;
  error?: {
    message: string;
    stack?: string;
    expected?: string;
    actual?: string;
  };
  screenshot?: string;
  trace?: string;
}

export interface GitHubSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  duration: number;
  coverage?: {
    percentage: number;
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
}

export const DEFAULT_GITHUB_ACTIONS_CONFIG: GitHubActionsConfig = {
  annotations: true,
  jobSummary: true,
  prComments: false,
  checkRuns: true,
  checkName: "Inspect Tests",
  failThreshold: 0,
  warningThreshold: 80,
  uploadArtifacts: true,
  artifactRetention: 30,
};

/**
 * GitHub Actions Integration
 *
 * Integrates test results with GitHub Actions features.
 */
export class GitHubActionsIntegration extends EventEmitter {
  private config: GitHubActionsConfig;
  private annotations: GitHubAnnotation[] = [];
  private results: TestResultForGitHub[] = [];
  private checkRunId?: string;

  constructor(config: Partial<GitHubActionsConfig> = {}) {
    super();
    this.config = { ...DEFAULT_GITHUB_ACTIONS_CONFIG, ...config };
  }

  /**
   * Check if running in GitHub Actions
   */
  static isRunningInGitHubActions(): boolean {
    return !!process.env.GITHUB_ACTIONS;
  }

  /**
   * Add test result
   */
  addResult(result: TestResultForGitHub): void {
    this.results.push(result);

    if (this.config.annotations) {
      const annotation = this.createAnnotation(result);
      if (annotation) {
        this.annotations.push(annotation);
      }
    }
  }

  /**
   * Create GitHub annotation from test result
   */
  private createAnnotation(result: TestResultForGitHub): GitHubAnnotation | null {
    if (result.status !== "failed") return null;

    return {
      path: result.file,
      start_line: result.line || 1,
      end_line: result.line || 1,
      annotation_level: "failure",
      message: result.error?.message || "Test failed",
      title: result.name,
      raw_details: result.error?.stack,
    };
  }

  /**
   * Start check run
   */
  async startCheckRun(): Promise<void> {
    if (!this.config.checkRuns || !GitHubActionsIntegration.isRunningInGitHubActions()) {
      return;
    }

    const checkRun: Partial<GitHubCheckRun> = {
      name: this.config.checkName,
      status: "in_progress",
      output: {
        title: "Running Inspect Tests",
        summary: "Test execution in progress...",
      },
    };

    // In real implementation, would call GitHub API
    this.checkRunId = `check-${Date.now()}`;

    this.emit("check-run:started", { checkRunId: this.checkRunId });
  }

  /**
   * Complete check run
   */
  async completeCheckRun(summary: GitHubSummary): Promise<void> {
    if (!this.config.checkRuns || !GitHubActionsIntegration.isRunningInGitHubActions()) {
      return;
    }

    const failed = summary.failed > 0;
    const conclusion = failed ? "failure" : "success";

    const checkRun: Partial<GitHubCheckRun> = {
      name: this.config.checkName,
      status: "completed",
      conclusion,
      output: {
        title: failed ? "Tests Failed" : "Tests Passed",
        summary: this.generateSummaryMarkdown(summary),
        text: this.generateDetailedReport(summary),
        annotations: this.annotations.slice(0, 50), // GitHub limits annotations
      },
    };

    // In real implementation, would call GitHub API
    this.emit("check-run:completed", { checkRunId: this.checkRunId, conclusion });

    // Write annotations to stdout for GitHub to pick up
    this.writeWorkflowCommands();
  }

  /**
   * Generate summary markdown
   */
  private generateSummaryMarkdown(summary: GitHubSummary): string {
    const lines: string[] = [
      "## Test Results",
      "",
      `| Status | Count |`,
      `|--------|-------|`,
      `| Total | ${summary.total} |`,
      `| Passed | ${summary.passed} ✅ |`,
      `| Failed | ${summary.failed} ❌ |`,
      `| Skipped | ${summary.skipped} ⏭️ |`,
      `| Flaky | ${summary.flaky} 🔄 |`,
      `| **Duration** | **${(summary.duration / 1000).toFixed(2)}s** |`,
      "",
    ];

    if (summary.coverage) {
      const cov = summary.coverage;
      lines.push(
        "## Coverage",
        "",
        `| Type | Percentage |`,
        `|------|------------|`,
        `| Statements | ${cov.statements}% |`,
        `| Branches | ${cov.branches}% |`,
        `| Functions | ${cov.functions}% |`,
        `| Lines | ${cov.lines}% |`,
        `| **Overall** | **${cov.percentage}%** |`,
        ""
      );
    }

    return lines.join("\n");
  }

  /**
   * Generate detailed report
   */
  private generateDetailedReport(summary: GitHubSummary): string {
    const lines: string[] = ["# Detailed Test Report", ""];

    if (this.results.length > 0) {
      lines.push("## Failed Tests", "");

      for (const result of this.results.filter((r) => r.status === "failed")) {
        lines.push(
          `### ${result.name}`,
          "",
          `- **File:** ${result.file}${result.line ? `:${result.line}` : ""}`,
          `- **Duration:** ${(result.duration / 1000).toFixed(2)}s`,
          "",
          "**Error:**",
          "```",
          result.error?.message || "Unknown error",
          "```",
          ""
        );

        if (result.error?.expected !== undefined) {
          lines.push(
            "**Expected:**",
            "```",
            result.error.expected,
            "```",
            "",
            "**Actual:**",
            "```",
            result.error.actual,
            "```",
            ""
          );
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Write workflow commands for GitHub Actions
   */
  private writeWorkflowCommands(): void {
    if (!GitHubActionsIntegration.isRunningInGitHubActions()) return;

    for (const annotation of this.annotations.slice(0, 10)) {
      const level = annotation.annotation_level;
      const file = annotation.path;
      const line = annotation.start_line;
      const message = annotation.message;

      // GitHub Actions workflow command format
      console.log(`::${level} file=${file},line=${line}::${message}`);
    }

    // Set output
    const failed = this.results.filter((r) => r.status === "failed").length;
    console.log(`::set-output name=failed::${failed}`);
    console.log(`::set-output name=total::${this.results.length}`);
  }

  /**
   * Write job summary
   */
  async writeJobSummary(summary: GitHubSummary): Promise<void> {
    if (!this.config.jobSummary || !GitHubActionsIntegration.isRunningInGitHubActions()) {
      return;
    }

    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) return;

    const markdown = this.generateSummaryMarkdown(summary);

    // In real implementation, would append to $GITHUB_STEP_SUMMARY
    this.emit("summary:written", { path: summaryPath, content: markdown });
  }

  /**
   * Post PR comment
   */
  async postPRComment(summary: GitHubSummary): Promise<void> {
    if (!this.config.prComments || !GitHubActionsIntegration.isRunningInGitHubActions()) {
      return;
    }

    const prNumber = this.getPRNumber();
    if (!prNumber) return;

    const body = this.generateSummaryMarkdown(summary);

    // In real implementation, would call GitHub API
    this.emit("pr:comment", { prNumber, body });
  }

  /**
   * Get PR number from environment
   */
  private getPRNumber(): number | null {
    const ref = process.env.GITHUB_REF;
    if (!ref) return null;

    const match = ref.match(/refs\/pull\/(\d+)\/merge/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Upload artifacts
   */
  async uploadArtifacts(artifacts: Array<{ name: string; path: string }>): Promise<void> {
    if (!this.config.uploadArtifacts || !GitHubActionsIntegration.isRunningInGitHubActions()) {
      return;
    }

    for (const artifact of artifacts) {
      // In real implementation, would use @actions/artifact
      this.emit("artifact:upload", artifact);
    }
  }

  /**
   * Generate final summary
   */
  generateFinalSummary(): GitHubSummary {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.status === "passed").length;
    const failed = this.results.filter((r) => r.status === "failed").length;
    const skipped = this.results.filter((r) => r.status === "skipped").length;
    const flaky = this.results.filter((r) => r.status === "flaky").length;

    const duration = this.results.reduce((sum, r) => sum + r.duration, 0);

    return {
      total,
      passed,
      failed,
      skipped,
      flaky,
      duration,
    };
  }

  /**
   * Set environment variables for subsequent steps
   */
  setOutputs(summary: GitHubSummary): void {
    if (!GitHubActionsIntegration.isRunningInGitHubActions()) return;

    // GitHub Actions output syntax
    const outputs = [
      `TEST_TOTAL=${summary.total}`,
      `TEST_PASSED=${summary.passed}`,
      `TEST_FAILED=${summary.failed}`,
      `TEST_SKIPPED=${summary.skipped}`,
      `TEST_FLAKEY=${summary.flaky}`,
      `TEST_DURATION=${summary.duration}`,
    ];

    for (const output of outputs) {
      console.log(`::set-output name=${output.split("=")[0]}::${output.split("=")[1]}`);
    }
  }

  /**
   * Get annotations
   */
  getAnnotations(): GitHubAnnotation[] {
    return [...this.annotations];
  }

  /**
   * Clear results
   */
  clear(): void {
    this.results = [];
    this.annotations = [];
  }
}

/**
 * Convenience function
 */
export function createGitHubActionsIntegration(
  config?: Partial<GitHubActionsConfig>
): GitHubActionsIntegration {
  return new GitHubActionsIntegration(config);
}
