// ──────────────────────────────────────────────────────────────────────────────
// @inspect/reporter - JSON Reporter
// ──────────────────────────────────────────────────────────────────────────────

import type { SuiteResult, TestResult } from "./markdown.js";

/** JSON report structure */
export interface JSONReport {
  /** Report format version */
  version: string;
  /** Report generation metadata */
  metadata: {
    generatedAt: string;
    generator: string;
    generatorVersion: string;
  };
  /** Summary statistics */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
    duration: number;
    totalSteps: number;
  };
  /** Environment info */
  environment: SuiteResult["environment"];
  /** All test results */
  tests: JSONTestResult[];
  /** Timing breakdown */
  timing: {
    startedAt: string;
    finishedAt: string;
    totalDuration: number;
    averageTestDuration: number;
    slowestTest: { name: string; duration: number } | null;
    fastestTest: { name: string; duration: number } | null;
  };
}

/** Test result in the JSON format */
export interface JSONTestResult {
  name: string;
  status: TestResult["status"];
  duration: number;
  startedAt: string;
  finishedAt: string;
  steps: Array<{
    index: number;
    action: string;
    target?: string;
    value?: string;
    status: string;
    duration: number;
    assertion?: string;
    error?: string;
    thought?: string;
  }>;
  error?: {
    message: string;
    stack?: string;
    screenshot?: string;
  };
  screenshots: Array<{
    name: string;
    path: string;
    timestamp: string;
    stepIndex?: number;
  }>;
  consoleErrors?: string[];
  networkFailures?: string[];
  tags?: string[];
}

/** JSON reporter options */
export interface JSONReporterOptions {
  /** Whether to pretty-print the JSON */
  pretty?: boolean;
  /** Indentation level (default: 2) */
  indent?: number;
  /** Whether to include raw screenshots data */
  includeScreenshotData?: boolean;
  /** Whether to include agent thoughts */
  includeThoughts?: boolean;
}

/**
 * Generates a structured JSON report from test results.
 *
 * Produces a machine-readable format suitable for:
 * - CI/CD pipeline integration
 * - Dashboard data ingestion
 * - Comparison between test runs
 * - Programmatic analysis
 */
export class JSONReporter {
  private options: JSONReporterOptions;

  constructor(options?: JSONReporterOptions) {
    this.options = {
      pretty: true,
      indent: 2,
      includeScreenshotData: false,
      includeThoughts: true,
      ...options,
    };
  }

  /**
   * Generate a JSON report string.
   */
  generate(results: SuiteResult): string {
    const report = this.buildReport(results);

    if (this.options.pretty) {
      return JSON.stringify(report, null, this.options.indent);
    }

    return JSON.stringify(report);
  }

  /**
   * Build the report data structure (useful if you need the object, not string).
   */
  buildReport(results: SuiteResult): JSONReport {
    const stats = this.getStats(results);
    const tests = results.tests.map((t) => this.convertTest(t));

    const durations = results.tests.map((t) => ({ name: t.name, duration: t.duration }));
    durations.sort((a, b) => b.duration - a.duration);

    return {
      version: "1.0.0",
      metadata: {
        generatedAt: new Date().toISOString(),
        generator: "@inspect/reporter",
        generatorVersion: "0.1.0",
      },
      summary: stats,
      environment: results.environment,
      tests,
      timing: {
        startedAt: new Date(results.startedAt).toISOString(),
        finishedAt: new Date(results.finishedAt).toISOString(),
        totalDuration: results.finishedAt - results.startedAt,
        averageTestDuration:
          results.tests.length > 0
            ? Math.round(results.tests.reduce((s, t) => s + t.duration, 0) / results.tests.length)
            : 0,
        slowestTest: durations[0] ?? null,
        fastestTest: durations[durations.length - 1] ?? null,
      },
    };
  }

  /**
   * Generate a minimal summary JSON (for quick checks).
   */
  generateSummary(results: SuiteResult): string {
    const stats = this.getStats(results);
    const failedTests = results.tests
      .filter((t) => t.status === "failed" || t.status === "error")
      .map((t) => ({
        name: t.name,
        error: t.error?.message,
      }));

    const summary = {
      status: stats.failed > 0 ? "failed" : "passed",
      ...stats,
      failedTests,
      duration: results.finishedAt - results.startedAt,
    };

    return JSON.stringify(summary, null, this.options.pretty ? 2 : undefined);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private convertTest(test: TestResult): JSONTestResult {
    return {
      name: test.name,
      status: test.status,
      duration: test.duration,
      startedAt: new Date(test.startedAt).toISOString(),
      finishedAt: new Date(test.finishedAt).toISOString(),
      steps: test.steps.map((step) => ({
        index: step.index,
        action: step.action,
        target: step.target,
        value: step.value,
        status: step.status,
        duration: step.duration,
        assertion: step.assertion,
        error: step.error,
        thought: this.options.includeThoughts ? step.thought : undefined,
      })),
      error: test.error
        ? {
            message: test.error.message,
            stack: test.error.stack,
            screenshot: test.error.screenshot,
          }
        : undefined,
      screenshots: test.screenshots.map((ss) => ({
        name: ss.name,
        path: ss.path,
        timestamp: new Date(ss.timestamp).toISOString(),
        stepIndex: ss.stepIndex,
      })),
      consoleErrors: test.consoleErrors,
      networkFailures: test.networkFailures,
      tags: test.tags,
    };
  }

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

    return { total, passed, failed, skipped, passRate, duration, totalSteps };
  }
}
