/**
 * CI Mode Implementation
 *
 * Optimized test execution for CI/CD environments.
 * Includes headless operation, parallel execution, reporting, and exit codes.
 */

import { EventEmitter } from "events";

export interface CIModeConfig {
  /** CI environment type */
  ciEnvironment: "github" | "gitlab" | "jenkins" | "circleci" | "travis" | "generic";
  /** Headless browser mode */
  headless: boolean;
  /** Parallel test workers */
  workers: number;
  /** Fail fast on first failure */
  failFast: boolean;
  /** Retry failed tests */
  retries: number;
  /** Timeout per test (ms) */
  testTimeout: number;
  /** Global timeout (ms) */
  globalTimeout: number;
  /** Output format */
  outputFormat: "junit" | "json" | "tap" | "compact";
  /** Artifact directory */
  artifactDir: string;
  /** Enable coverage */
  coverage: boolean;
  /** Coverage threshold */
  coverageThreshold: number;
  /** Quiet mode */
  quiet: boolean;
  /** On test start */
  onTestStart?: (test: TestInfo) => void;
  /** On test complete */
  onTestComplete?: (result: TestResult) => void;
  /** On suite complete */
  onSuiteComplete?: (summary: SuiteSummary) => void;
}

export interface TestInfo {
  id: string;
  name: string;
  file: string;
  line?: number;
  timeout: number;
}

export interface TestResult {
  test: TestInfo;
  status: "passed" | "failed" | "skipped" | "flaky";
  duration: number;
  retries: number;
  error?: {
    message: string;
    stack?: string;
    screenshot?: string;
    trace?: string;
  };
  artifacts: string[];
  stdout: string[];
  stderr: string[];
}

export interface SuiteSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  duration: number;
  startTime: number;
  endTime: number;
  tests: TestResult[];
  coverage?: CoverageReport;
  exitCode: number;
}

export interface CoverageReport {
  statements: { covered: number; total: number; percentage: number };
  branches: { covered: number; total: number; percentage: number };
  functions: { covered: number; total: number; percentage: number };
  lines: { covered: number; total: number; percentage: number };
  thresholdMet: boolean;
}

export interface ParallelWorker {
  id: number;
  status: "idle" | "running" | "error";
  currentTest?: string;
  completedTests: number;
}

export const DEFAULT_CI_CONFIG: CIModeConfig = {
  ciEnvironment: "generic",
  headless: true,
  workers: 4,
  failFast: false,
  retries: 2,
  testTimeout: 60000,
  globalTimeout: 600000,
  outputFormat: "junit",
  artifactDir: "./test-artifacts",
  coverage: false,
  coverageThreshold: 80,
  quiet: true,
};

/**
 * CI Mode Runner
 *
 * Manages test execution optimized for CI/CD pipelines.
 */
export class CIModeRunner extends EventEmitter {
  private config: CIModeConfig;
  private tests: TestInfo[] = [];
  private results: TestResult[] = [];
  private workers: ParallelWorker[] = [];
  private running = false;
  private startTime = 0;
  private failedCount = 0;

  constructor(config: Partial<CIModeConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CI_CONFIG, ...config };

    // Initialize workers
    for (let i = 0; i < this.config.workers; i++) {
      this.workers.push({
        id: i,
        status: "idle",
        completedTests: 0,
      });
    }
  }

  /**
   * Add tests to run
   */
  addTests(tests: TestInfo[]): void {
    this.tests.push(...tests);
  }

  /**
   * Run all tests
   */
  async run(): Promise<SuiteSummary> {
    if (this.running) {
      throw new Error("Already running");
    }

    this.running = true;
    this.startTime = Date.now();
    this.results = [];
    this.failedCount = 0;

    this.emit("suite:start", { testCount: this.tests.length });

    // Check global timeout
    const timeoutHandle = setTimeout(() => {
      this.emit("suite:timeout", { globalTimeout: this.config.globalTimeout });
      this.running = false;
    }, this.config.globalTimeout);

    // Execute tests in parallel
    const testQueue = [...this.tests];
    const promises: Promise<void>[] = [];

    for (const worker of this.workers) {
      promises.push(this.runWorker(worker, testQueue));
    }

    await Promise.all(promises);

    clearTimeout(timeoutHandle);

    this.running = false;

    const summary = this.generateSummary();

    this.emit("suite:complete", summary);
    this.config.onSuiteComplete?.(summary);

    // Write reports
    await this.writeReports(summary);

    return summary;
  }

  /**
   * Run tests on a worker
   */
  private async runWorker(worker: ParallelWorker, queue: TestInfo[]): Promise<void> {
    while (this.running && queue.length > 0) {
      // Check fail fast
      if (this.config.failFast && this.failedCount > 0) {
        return;
      }

      const test = queue.shift();
      if (!test) continue;

      worker.status = "running";
      worker.currentTest = test.id;

      this.emit("test:start", { test, worker: worker.id });
      this.config.onTestStart?.(test);

      const result = await this.executeTest(test, worker);

      this.results.push(result);
      worker.completedTests++;

      if (result.status === "failed") {
        this.failedCount++;
      }

      this.emit("test:complete", { result, worker: worker.id });
      this.config.onTestComplete?.(result);
    }

    worker.status = "idle";
    worker.currentTest = undefined;
  }

  /**
   * Execute a single test with retries
   */
  private async executeTest(test: TestInfo, worker: ParallelWorker): Promise<TestResult> {
    let lastError: Error | undefined;
    let attempt = 0;

    const result: TestResult = {
      test,
      status: "passed",
      duration: 0,
      retries: 0,
      artifacts: [],
      stdout: [],
      stderr: [],
    };

    const startTime = Date.now();

    while (attempt <= this.config.retries) {
      try {
        // Simulate test execution
        await this.runTestFunction(test, worker);

        result.duration = Date.now() - startTime;

        // Check if flaky (passed after retries)
        if (attempt > 0) {
          result.status = "flaky";
          result.retries = attempt;
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        if (attempt <= this.config.retries) {
          // Wait before retry
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    // All retries exhausted
    result.status = "failed";
    result.duration = Date.now() - startTime;
    result.retries = attempt - 1;
    result.error = {
      message: lastError?.message || "Unknown error",
      stack: lastError?.stack,
    };

    // Capture artifacts
    result.artifacts = await this.captureArtifacts(test);

    return result;
  }

  /**
   * Run actual test function (placeholder)
   */
  private async runTestFunction(test: TestInfo, worker: ParallelWorker): Promise<void> {
    // This would integrate with the actual test framework
    // For now, simulate test execution
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Test timeout after ${test.timeout}ms`));
      }, test.timeout);

      // Simulate test
      setTimeout(() => {
        clearTimeout(timeout);
        resolve(undefined);
      }, Math.random() * 1000);
    });
  }

  /**
   * Capture test artifacts
   */
  private async captureArtifacts(test: TestInfo): Promise<string[]> {
    const artifacts: string[] = [];

    // Screenshot
    artifacts.push(`${this.config.artifactDir}/${test.id}-screenshot.png`);

    // Trace
    artifacts.push(`${this.config.artifactDir}/${test.id}-trace.zip`);

    // HAR
    artifacts.push(`${this.config.artifactDir}/${test.id}-har.json`);

    return artifacts;
  }

  /**
   * Generate suite summary
   */
  private generateSummary(): SuiteSummary {
    const endTime = Date.now();
    const duration = endTime - this.startTime;

    const passed = this.results.filter((r) => r.status === "passed").length;
    const failed = this.results.filter((r) => r.status === "failed").length;
    const skipped = this.results.filter((r) => r.status === "skipped").length;
    const flaky = this.results.filter((r) => r.status === "flaky").length;

    // Calculate exit code
    const exitCode = failed > 0 ? 1 : 0;

    return {
      total: this.results.length,
      passed,
      failed,
      skipped,
      flaky,
      duration,
      startTime: this.startTime,
      endTime,
      tests: this.results,
      coverage: this.config.coverage ? this.generateCoverageReport() : undefined,
      exitCode,
    };
  }

  /**
   * Generate coverage report
   */
  private generateCoverageReport(): CoverageReport {
    // Simulated coverage data
    const statements = { covered: 850, total: 1000, percentage: 85 };
    const branches = { covered: 420, total: 500, percentage: 84 };
    const functions = { covered: 180, total: 200, percentage: 90 };
    const lines = { covered: 820, total: 1000, percentage: 82 };

    const avgPercentage =
      (statements.percentage + branches.percentage + functions.percentage + lines.percentage) / 4;

    return {
      statements,
      branches,
      functions,
      lines,
      thresholdMet: avgPercentage >= this.config.coverageThreshold,
    };
  }

  /**
   * Write test reports
   */
  private async writeReports(summary: SuiteSummary): Promise<void> {
    switch (this.config.outputFormat) {
      case "junit":
        await this.writeJUnitReport(summary);
        break;
      case "json":
        await this.writeJSONReport(summary);
        break;
      case "tap":
        await this.writeTAPReport(summary);
        break;
      case "compact":
        this.writeCompactReport(summary);
        break;
    }
  }

  /**
   * Write JUnit XML report
   */
  private async writeJUnitReport(summary: SuiteSummary): Promise<void> {
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<testsuites tests="${summary.total}" failures="${summary.failed}" time="${summary.duration / 1000}">`,
      '  <testsuite name="inspect-tests">',
    ];

    for (const result of summary.tests) {
      lines.push(
        `    <testcase name="${result.test.name}" time="${result.duration / 1000}">`
      );

      if (result.status === "failed" && result.error) {
        lines.push(
          `      <failure message="${result.error.message}">`,
          result.error.stack || "",
          "      </failure>"
        );
      } else if (result.status === "skipped") {
        lines.push("      <skipped/>");
      }

      lines.push("    </testcase>");
    }

    lines.push("  </testsuite>", "</testsuites>");

    // Would write to file in actual implementation
    if (!this.config.quiet) {
      console.log("JUnit report generated");
    }
  }

  /**
   * Write JSON report
   */
  private async writeJSONReport(summary: SuiteSummary): Promise<void> {
    const report = JSON.stringify(summary, null, 2);

    if (!this.config.quiet) {
      console.log("JSON report generated");
    }
  }

  /**
   * Write TAP report
   */
  private async writeTAPReport(summary: SuiteSummary): Promise<void> {
    const lines: string[] = [`TAP version 13`, `1..${summary.total}`];

    let i = 1;
    for (const result of summary.tests) {
      const status = result.status === "passed" || result.status === "flaky" ? "ok" : "not ok";
      lines.push(`${status} ${i} ${result.test.name}`);

      if (result.status === "flaky") {
        lines.push(`  ---`, `  flaky: true`, `  retries: ${result.retries}`, `  ...`);
      }

      i++;
    }

    if (!this.config.quiet) {
      console.log(lines.join("\n"));
    }
  }

  /**
   * Write compact report
   */
  private writeCompactReport(summary: SuiteSummary): void {
    if (this.config.quiet) return;

    const { total, passed, failed, skipped, flaky, duration } = summary;

    console.log(`\n${"=".repeat(50)}`);
    console.log(`Tests: ${total} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped} | Flaky: ${flaky}`);
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`${"=".repeat(50)}\n`);

    if (failed > 0) {
      console.log("Failed tests:");
      for (const result of summary.tests.filter((t) => t.status === "failed")) {
        console.log(`  ✗ ${result.test.name}`);
        if (result.error) {
          console.log(`    ${result.error.message}`);
        }
      }
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    running: boolean;
    totalTests: number;
    completedTests: number;
    failedTests: number;
    activeWorkers: number;
  } {
    return {
      running: this.running,
      totalTests: this.tests.length,
      completedTests: this.results.length,
      failedTests: this.failedCount,
      activeWorkers: this.workers.filter((w) => w.status === "running").length,
    };
  }

  /**
   * Cancel execution
   */
  cancel(): void {
    this.running = false;
    this.emit("suite:cancelled");
  }
}

/**
 * Detect CI environment
 */
export function detectCIEnvironment(): CIModeConfig["ciEnvironment"] {
  if (process.env.GITHUB_ACTIONS) return "github";
  if (process.env.GITLAB_CI) return "gitlab";
  if (process.env.JENKINS_URL) return "jenkins";
  if (process.env.CIRCLECI) return "circleci";
  if (process.env.TRAVIS) return "travis";
  if (process.env.CI) return "generic";
  return "generic";
}

/**
 * Convenience function
 */
export function createCIModeRunner(config?: Partial<CIModeConfig>): CIModeRunner {
  const env = detectCIEnvironment();
  return new CIModeRunner({ ciEnvironment: env, ...config });
}
