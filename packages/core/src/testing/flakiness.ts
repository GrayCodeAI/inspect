// ──────────────────────────────────────────────────────────────────────────────
// @inspect/core - Flakiness Detection
// ──────────────────────────────────────────────────────────────────────────────

/** Test execution record */
export interface TestExecution {
  testId: string;
  testName: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  retry: number;
  timestamp: number;
  browser?: string;
  device?: string;
  url?: string;
}

/** Flakiness score for a test */
export interface FlakinessScore {
  testId: string;
  testName: string;
  score: number; // 0-100 (0 = stable, 100 = completely flaky)
  confidence: number; // 0-1 (how confident we are in the score)
  passRate: number; // 0-1
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  avgDurationMs: number;
  durationVariance: number;
  failurePatterns: string[];
  recommendation: "stable" | "flaky" | "broken" | "needs-investigation";
  history: Array<{ timestamp: number; passed: boolean }>;
}

/** Flakiness report */
export interface FlakinessReport {
  totalTests: number;
  stableTests: number;
  flakyTests: number;
  brokenTests: number;
  needsInvestigation: number;
  scores: FlakinessScore[];
  topFlaky: FlakinessScore[];
  generatedAt: number;
}

/**
 * Flakiness Detection Engine.
 * Analyzes test execution history to detect flaky tests and provide
 * confidence scoring and recommendations.
 *
 * Usage:
 * ```ts
 * const detector = new FlakinessDetector();
 * detector.record({ testId: "t1", testName: "login", passed: true, ... });
 * detector.record({ testId: "t1", testName: "login", passed: false, ... });
 * const score = detector.getScore("t1");
 * ```
 */
export class FlakinessDetector {
  private history: Map<string, TestExecution[]> = new Map();
  private minRunsForDetection: number;

  constructor(options?: { minRuns?: number }) {
    this.minRunsForDetection = options?.minRuns ?? 3;
  }

  /**
   * Record a test execution.
   */
  record(execution: TestExecution): void {
    const existing = this.history.get(execution.testId) ?? [];
    existing.push(execution);
    this.history.set(execution.testId, existing);
  }

  /**
   * Record multiple executions at once.
   */
  recordBatch(executions: TestExecution[]): void {
    for (const exec of executions) {
      this.record(exec);
    }
  }

  /**
   * Get flakiness score for a specific test.
   */
  getScore(testId: string): FlakinessScore | null {
    const executions = this.history.get(testId);
    if (!executions || executions.length < this.minRunsForDetection) {
      return null;
    }

    return this.calculateScore(testId, executions);
  }

  /**
   * Get scores for all tests.
   */
  getAllScores(): FlakinessScore[] {
    const scores: FlakinessScore[] = [];
    for (const [testId, executions] of this.history) {
      if (executions.length >= this.minRunsForDetection) {
        scores.push(this.calculateScore(testId, executions));
      }
    }
    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Generate a full flakiness report.
   */
  getReport(): FlakinessReport {
    const scores = this.getAllScores();

    const stable = scores.filter((s) => s.recommendation === "stable");
    const flaky = scores.filter((s) => s.recommendation === "flaky");
    const broken = scores.filter((s) => s.recommendation === "broken");
    const needsInvestigation = scores.filter((s) => s.recommendation === "needs-investigation");

    return {
      totalTests: scores.length,
      stableTests: stable.length,
      flakyTests: flaky.length,
      brokenTests: broken.length,
      needsInvestigation: needsInvestigation.length,
      scores,
      topFlaky: flaky.slice(0, 10),
      generatedAt: Date.now(),
    };
  }

  /**
   * Get tests that should be retried (flaky but not broken).
   */
  getRetryableTests(): FlakinessScore[] {
    return this.getAllScores().filter(
      (s) => s.recommendation === "flaky" || s.recommendation === "needs-investigation",
    );
  }

  /**
   * Check if a test is flaky.
   */
  isFlaky(testId: string): boolean {
    const score = this.getScore(testId);
    return score !== null && score.recommendation === "flaky";
  }

  /**
   * Get confidence that the next run will pass.
   */
  getPassConfidence(testId: string): number {
    const score = this.getScore(testId);
    return score ? score.passRate : 0.5;
  }

  /**
   * Clear history for a test.
   */
  clear(testId?: string): void {
    if (testId) {
      this.history.delete(testId);
    } else {
      this.history.clear();
    }
  }

  /**
   * Export history as JSON.
   */
  export(): string {
    const data: Record<string, TestExecution[]> = {};
    for (const [id, execs] of this.history) {
      data[id] = execs;
    }
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import history from JSON.
   */
  import(json: string): void {
    const data = JSON.parse(json) as Record<string, TestExecution[]>;
    for (const [id, execs] of Object.entries(data)) {
      this.history.set(id, execs);
    }
  }

  private calculateScore(testId: string, executions: TestExecution[]): FlakinessScore {
    const passed = executions.filter((e) => e.passed);
    const failed = executions.filter((e) => !e.passed);
    const totalRuns = executions.length;
    const passRate = passed.length / totalRuns;

    // Calculate duration variance
    const durations = executions.map((e) => e.durationMs);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance =
      durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;

    // Detect failure patterns
    const failurePatterns = this.detectFailurePatterns(failed);

    // Calculate flakiness score (0-100)
    // - Pass rate between 0.2 and 0.8 indicates flakiness
    // - High duration variance also indicates flakiness
    // - Alternating pass/fail is the strongest signal
    let score = 0;

    // Pass rate factor (highest flakiness at ~50% pass rate)
    const passRateFlakiness = 1 - Math.abs(passRate - 0.5) * 2;
    score += passRateFlakiness * 50;

    // Alternation factor
    let alternations = 0;
    for (let i = 1; i < executions.length; i++) {
      if (executions[i].passed !== executions[i - 1].passed) alternations++;
    }
    const alternationRate = alternations / (totalRuns - 1);
    score += alternationRate * 30;

    // Duration variance factor (normalized)
    const normalizedVariance = Math.min(1, variance / (avgDuration * avgDuration));
    score += normalizedVariance * 20;

    score = Math.round(Math.min(100, score));

    // Confidence increases with more data points
    const confidence = Math.min(1, totalRuns / 20);

    // Determine recommendation
    let recommendation: FlakinessScore["recommendation"];
    if (passRate >= 0.9) {
      recommendation = "stable";
    } else if (passRate <= 0.1) {
      recommendation = "broken";
    } else if (score >= 40 && alternationRate >= 0.3) {
      recommendation = "flaky";
    } else {
      recommendation = "needs-investigation";
    }

    const testName = executions[0]?.testName ?? testId;

    return {
      testId,
      testName,
      score,
      confidence,
      passRate,
      totalRuns,
      passedRuns: passed.length,
      failedRuns: failed.length,
      avgDurationMs: Math.round(avgDuration),
      durationVariance: Math.round(variance),
      failurePatterns,
      recommendation,
      history: executions.map((e) => ({ timestamp: e.timestamp, passed: e.passed })),
    };
  }

  private detectFailurePatterns(failed: TestExecution[]): string[] {
    const patterns: string[] = [];
    const errors = failed.map((e) => e.error ?? "").filter(Boolean);

    // Check for timeout errors
    if (errors.some((e) => e.toLowerCase().includes("timeout"))) {
      patterns.push("timeout");
    }

    // Check for selector errors
    if (
      errors.some(
        (e) => e.toLowerCase().includes("selector") || e.toLowerCase().includes("element"),
      )
    ) {
      patterns.push("selector-mismatch");
    }

    // Check for network errors
    if (
      errors.some((e) => e.toLowerCase().includes("network") || e.toLowerCase().includes("fetch"))
    ) {
      patterns.push("network-error");
    }

    // Check for race conditions
    if (
      errors.some((e) => e.toLowerCase().includes("race") || e.toLowerCase().includes("timing"))
    ) {
      patterns.push("race-condition");
    }

    // Check for memory issues
    if (
      errors.some((e) => e.toLowerCase().includes("memory") || e.toLowerCase().includes("heap"))
    ) {
      patterns.push("memory-issue");
    }

    return patterns;
  }
}
