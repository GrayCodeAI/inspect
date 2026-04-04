// ============================================================================
// @inspect/core - Test Prioritization Engine
//
// Ranks tests by urgency using: flakiness scores, git change recency,
// failure history, and test duration. Enables "test the riskiest first."
// ============================================================================

export interface TestEntry {
  id: string;
  name: string;
  /** Flakiness score (0-100, higher = more flaky) */
  flakinessScore?: number;
  /** Pass rate (0-1) */
  passRate?: number;
  /** Last run duration in ms */
  lastDurationMs?: number;
  /** Total historical runs */
  totalRuns?: number;
  /** Timestamp of last failure */
  lastFailedAt?: number;
  /** File paths this test covers */
  coveredFiles?: string[];
  /** Tags/categories */
  tags?: string[];
}

export interface PrioritizationInput {
  tests: TestEntry[];
  /** Files changed in current branch (from git diff) */
  changedFiles?: string[];
  /** Maximum number of tests to return. Default: all */
  limit?: number;
  /** Weight configuration for scoring */
  weights?: PrioritizationWeights;
}

export interface PrioritizationWeights {
  /** Weight for flakiness score. Default: 0.25 */
  flakiness?: number;
  /** Weight for failure recency. Default: 0.25 */
  failureRecency?: number;
  /** Weight for code change overlap. Default: 0.3 */
  changeOverlap?: number;
  /** Weight for execution speed (shorter = better for fast feedback). Default: 0.1 */
  speed?: number;
  /** Weight for low pass rate. Default: 0.1 */
  reliability?: number;
}

export interface PrioritizedTest {
  test: TestEntry;
  /** Composite priority score (0-100, higher = run first) */
  score: number;
  /** Breakdown of score components */
  factors: {
    flakiness: number;
    failureRecency: number;
    changeOverlap: number;
    speed: number;
    reliability: number;
  };
  /** Reason this test was ranked high */
  reason: string;
}

export interface PrioritizationResult {
  /** Tests in priority order (highest first) */
  ranked: PrioritizedTest[];
  /** Tests that are safe to skip (very stable, no code changes) */
  skippable: TestEntry[];
  /** Summary stats */
  stats: {
    total: number;
    ranked: number;
    skippable: number;
    estimatedDurationMs: number;
  };
}

const DEFAULT_WEIGHTS: Required<PrioritizationWeights> = {
  flakiness: 0.25,
  failureRecency: 0.25,
  changeOverlap: 0.3,
  speed: 0.1,
  reliability: 0.1,
};

/**
 * TestPrioritizer ranks tests by risk and relevance.
 *
 * Use cases:
 * - **CI optimization**: run the most impactful tests first for fast feedback
 * - **PR testing**: prioritize tests covering changed files
 * - **Flaky test triage**: surface problematic tests for investigation
 */
export class TestPrioritizer {
  /**
   * Prioritize tests based on risk factors.
   */
  prioritize(input: PrioritizationInput): PrioritizationResult {
    const weights: Required<PrioritizationWeights> = {
      ...DEFAULT_WEIGHTS,
      ...input.weights,
    };

    const now = Date.now();
    const changedSet = new Set(input.changedFiles ?? []);

    const scored: PrioritizedTest[] = input.tests.map((test) => {
      const factors = {
        flakiness: this.scoreFlakinessComponent(test),
        failureRecency: this.scoreFailureRecency(test, now),
        changeOverlap: this.scoreChangeOverlap(test, changedSet),
        speed: this.scoreSpeed(test),
        reliability: this.scoreReliability(test),
      };

      const score = Math.round(
        factors.flakiness * weights.flakiness * 100 +
          factors.failureRecency * weights.failureRecency * 100 +
          factors.changeOverlap * weights.changeOverlap * 100 +
          factors.speed * weights.speed * 100 +
          factors.reliability * weights.reliability * 100,
      );

      const reason = this.buildReason(factors, weights, changedSet.size > 0);

      return { test, score: Math.min(100, score), factors, reason };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Identify skippable tests (very low priority)
    const threshold = 10;
    const skippable = scored.filter((s) => s.score <= threshold).map((s) => s.test);

    const ranked = input.limit ? scored.slice(0, input.limit) : scored;
    const estimatedDurationMs = ranked.reduce(
      (sum, r) => sum + (r.test.lastDurationMs ?? 10_000),
      0,
    );

    return {
      ranked,
      skippable,
      stats: {
        total: input.tests.length,
        ranked: ranked.length,
        skippable: skippable.length,
        estimatedDurationMs,
      },
    };
  }

  // ── Scoring components (0-1 each) ─────────────────────────────────────

  private scoreFlakinessComponent(test: TestEntry): number {
    if (test.flakinessScore === undefined) return 0;
    return test.flakinessScore / 100;
  }

  private scoreFailureRecency(test: TestEntry, now: number): number {
    if (!test.lastFailedAt) return 0;
    const ageMs = now - test.lastFailedAt;
    const ageHours = ageMs / (1000 * 60 * 60);

    // Recent failures score higher (exponential decay)
    if (ageHours < 1) return 1.0;
    if (ageHours < 24) return 0.8;
    if (ageHours < 72) return 0.5;
    if (ageHours < 168) return 0.3;
    return 0.1;
  }

  private scoreChangeOverlap(test: TestEntry, changedFiles: Set<string>): number {
    if (changedFiles.size === 0 || !test.coveredFiles?.length) return 0;

    let overlap = 0;
    for (const file of test.coveredFiles) {
      if (changedFiles.has(file)) overlap++;
      // Also check parent directory matches
      const dir = file.replace(/\/[^/]+$/, "");
      for (const changed of changedFiles) {
        if (changed.startsWith(dir)) {
          overlap += 0.5;
          break;
        }
      }
    }

    return Math.min(1, overlap / Math.max(1, test.coveredFiles.length));
  }

  private scoreSpeed(test: TestEntry): number {
    if (!test.lastDurationMs) return 0.5;
    // Faster tests get higher scores (prefer running quick tests first)
    if (test.lastDurationMs < 5000) return 1.0;
    if (test.lastDurationMs < 15000) return 0.7;
    if (test.lastDurationMs < 30000) return 0.4;
    return 0.2;
  }

  private scoreReliability(test: TestEntry): number {
    if (test.passRate === undefined) return 0;
    // Low pass rate → high priority (need investigation)
    return 1 - test.passRate;
  }

  private buildReason(
    factors: PrioritizedTest["factors"],
    weights: Required<PrioritizationWeights>,
    hasChanges: boolean,
  ): string {
    const reasons: string[] = [];

    if (factors.changeOverlap > 0.5 && hasChanges) {
      reasons.push("covers changed files");
    }
    if (factors.flakiness > 0.5) {
      reasons.push("historically flaky");
    }
    if (factors.failureRecency > 0.5) {
      reasons.push("recently failed");
    }
    if (factors.reliability > 0.5) {
      reasons.push("low pass rate");
    }
    if (factors.speed > 0.7) {
      reasons.push("fast execution");
    }

    return reasons.length > 0 ? reasons.join(", ") : "baseline priority";
  }
}
