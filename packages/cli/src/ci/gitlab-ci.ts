/**
 * GitLab CI Integration
 *
 * Native integration with GitLab CI/CD pipelines.
 * Provides merge request discussions, job artifacts, and CI visualization.
 */

import { EventEmitter } from "events";

export interface GitLabCIConfig {
  /** Enable merge request discussions */
  mrDiscussions: boolean;
  /** Enable job artifacts */
  artifacts: boolean;
  /** Enable CI visualization */
  ciVisualization: boolean;
  /** Enable code quality reports */
  codeQuality: boolean;
  /** Code quality threshold */
  qualityThreshold: number;
  /** Test report format */
  testReportFormat: "junit" | "json";
  /** Artifact expiration days */
  artifactExpiration: number;
}

export interface GitLabTestReport {
  total_count: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  error_count: number;
  test_suites: GitLabTestSuite[];
}

export interface GitLabTestSuite {
  name: string;
  total_time: number;
  total_count: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  error_count: number;
  test_cases: GitLabTestCase[];
}

export interface GitLabTestCase {
  name: string;
  classname: string;
  file?: string;
  execution_time: number;
  status: "success" | "failed" | "skipped" | "error";
  system_output?: string;
  stack_trace?: string;
  attachment?: string;
}

export interface GitLabCodeQualityReport {
  check_name: string;
  description: string;
  fingerprint: string;
  severity: "blocker" | "critical" | "major" | "minor" | "info";
  location: {
    path: string;
    lines: { begin: number; end: number };
  };
}

export interface GitLabArtifact {
  name: string;
  paths: string[];
  expire_in?: string;
  when?: "always" | "on_success" | "on_failure";
}

export const DEFAULT_GITLAB_CI_CONFIG: GitLabCIConfig = {
  mrDiscussions: true,
  artifacts: true,
  ciVisualization: true,
  codeQuality: true,
  qualityThreshold: 80,
  testReportFormat: "junit",
  artifactExpiration: 30,
};

/**
 * GitLab CI Integration
 */
export class GitLabCIIntegration extends EventEmitter {
  private config: GitLabCIConfig;
  private testCases: GitLabTestCase[] = [];

  constructor(config: Partial<GitLabCIConfig> = {}) {
    super();
    this.config = { ...DEFAULT_GITLAB_CI_CONFIG, ...config };
  }

  /**
   * Check if running in GitLab CI
   */
  static isRunningInGitLabCI(): boolean {
    return !!process.env.GITLAB_CI;
  }

  /**
   * Add test result
   */
  addTestCase(testCase: Omit<GitLabTestCase, "status"> & { status: string }): void {
    this.testCases.push({
      ...testCase,
      status: testCase.status as GitLabTestCase["status"],
    });
  }

  /**
   * Generate GitLab test report
   */
  generateTestReport(): GitLabTestReport {
    const suites = this.groupBySuite(this.testCases);

    return {
      total_count: this.testCases.length,
      success_count: this.testCases.filter((t) => t.status === "success").length,
      failed_count: this.testCases.filter((t) => t.status === "failed").length,
      skipped_count: this.testCases.filter((t) => t.status === "skipped").length,
      error_count: this.testCases.filter((t) => t.status === "error").length,
      test_suites: suites,
    };
  }

  /**
   * Group test cases by suite
   */
  private groupBySuite(cases: GitLabTestCase[]): GitLabTestSuite[] {
    const groups = new Map<string, GitLabTestCase[]>();

    for (const tc of cases) {
      const suiteName = tc.classname || "default";
      if (!groups.has(suiteName)) {
        groups.set(suiteName, []);
      }
      groups.get(suiteName)!.push(tc);
    }

    return Array.from(groups.entries()).map(([name, cases]) => ({
      name,
      total_time: cases.reduce((sum, c) => sum + c.execution_time, 0),
      total_count: cases.length,
      success_count: cases.filter((c) => c.status === "success").length,
      failed_count: cases.filter((c) => c.status === "failed").length,
      skipped_count: cases.filter((c) => c.status === "skipped").length,
      error_count: cases.filter((c) => c.status === "error").length,
      test_cases: cases,
    }));
  }

  /**
   * Generate code quality report
   */
  generateCodeQualityReport(issues: Array<{
    file: string;
    line: number;
    message: string;
    severity: string;
  }}>): GitLabCodeQualityReport[] {
    return issues.map((issue) => ({
      check_name: "inspect-test",
      description: issue.message,
      fingerprint: `${issue.file}:${issue.line}:${issue.message}`,
      severity: this.mapSeverity(issue.severity),
      location: {
        path: issue.file,
        lines: { begin: issue.line, end: issue.line },
      },
    }));
  }

  /**
   * Map severity to GitLab format
   */
  private mapSeverity(severity: string): GitLabCodeQualityReport["severity"] {
    const mapping: Record<string, GitLabCodeQualityReport["severity"]> = {
      critical: "blocker",
      error: "critical",
      warning: "major",
      info: "minor",
      debug: "info",
    };
    return mapping[severity] || "info";
  }

  /**
   * Generate artifact configuration
   */
  generateArtifacts(paths: string[]): GitLabArtifact {
    return {
      name: "test-results",
      paths,
      expire_in: `${this.config.artifactExpiration} days`,
      when: "always",
    };
  }

  /**
   * Write environment file
   */
  writeEnvironmentFile(summary: { total: number; failed: number; passed: number }): void {
    const envPath = process.env.CI_ENVIRONMENT_FILE;
    if (!envPath) return;

    const envVars = [
      `TEST_TOTAL=${summary.total}`,
      `TEST_FAILED=${summary.failed}`,
      `TEST_PASSED=${summary.passed}`,
    ];

    this.emit("env:written", { path: envPath, vars: envVars });
  }

  /**
   * Get merge request IID
   */
  getMergeRequestIID(): number | null {
    const iid = process.env.CI_MERGE_REQUEST_IID;
    return iid ? parseInt(iid, 10) : null;
  }

  /**
   * Get project ID
   */
  getProjectId(): string | null {
    return process.env.CI_PROJECT_ID || null;
  }
}

export function createGitLabCIIntegration(config?: Partial<GitLabCIConfig>): GitLabCIIntegration {
  return new GitLabCIIntegration(config);
}
