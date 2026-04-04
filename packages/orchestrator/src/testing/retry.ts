// ============================================================================
// @inspect/core - Configurable Retry Policies
//
// Retry strategies for test steps and full test runs.
// Supports: fixed delay, exponential backoff, linear backoff, immediate.
// ============================================================================

export type RetryStrategy = "immediate" | "fixed" | "linear" | "exponential";

export interface RetryPolicy {
  /** Maximum number of retry attempts. Default: 2 */
  maxRetries?: number;
  /** Retry strategy. Default: "exponential" */
  strategy?: RetryStrategy;
  /** Base delay in ms (for fixed/linear/exponential). Default: 1000 */
  baseDelayMs?: number;
  /** Maximum delay in ms (caps exponential growth). Default: 30000 */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff. Default: 2 */
  multiplier?: number;
  /** Only retry on specific error patterns (regex strings) */
  retryOn?: string[];
  /** Never retry on specific error patterns */
  noRetryOn?: string[];
  /** Jitter: add random variance to delay (0-1). Default: 0.1 */
  jitter?: number;
}

export interface RetryAttempt {
  attempt: number;
  delayMs: number;
  error: string;
  timestamp: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  attempts: RetryAttempt[];
  totalAttempts: number;
  totalDelayMs: number;
}

const DEFAULT_POLICY: Required<RetryPolicy> = {
  maxRetries: 2,
  strategy: "exponential",
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  multiplier: 2,
  retryOn: [],
  noRetryOn: [],
  jitter: 0.1,
};

/**
 * RetryExecutor runs an async function with configurable retry logic.
 *
 * Usage:
 * ```ts
 * const executor = new RetryExecutor({ maxRetries: 3, strategy: "exponential" });
 * const result = await executor.execute(async () => {
 *   return await someFlakeyOperation();
 * });
 * ```
 */
export class RetryExecutor {
  private policy: Required<RetryPolicy>;

  constructor(policy: RetryPolicy = {}) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  /**
   * Execute a function with retry logic.
   */
  async execute<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
    const attempts: RetryAttempt[] = [];
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.policy.maxRetries; attempt++) {
      try {
        const result = await fn();
        return {
          success: true,
          result,
          attempts,
          totalAttempts: attempt + 1,
          totalDelayMs: attempts.reduce((sum, a) => sum + a.delayMs, 0),
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);

        // Check if we should retry this error
        if (!this.shouldRetry(lastError)) {
          break;
        }

        // Don't delay after the last attempt
        if (attempt < this.policy.maxRetries) {
          const delayMs = this.calculateDelay(attempt);
          attempts.push({
            attempt: attempt + 1,
            delayMs,
            error: lastError,
            timestamp: Date.now(),
          });

          await this.delay(delayMs);
        }
      }
    }

    return {
      success: false,
      error: lastError,
      attempts,
      totalAttempts: attempts.length + 1,
      totalDelayMs: attempts.reduce((sum, a) => sum + a.delayMs, 0),
    };
  }

  /**
   * Calculate delay for a given attempt number.
   */
  calculateDelay(attempt: number): number {
    let delay: number;

    switch (this.policy.strategy) {
      case "immediate":
        delay = 0;
        break;
      case "fixed":
        delay = this.policy.baseDelayMs;
        break;
      case "linear":
        delay = this.policy.baseDelayMs * (attempt + 1);
        break;
      case "exponential":
        delay = this.policy.baseDelayMs * Math.pow(this.policy.multiplier, attempt);
        break;
    }

    // Apply jitter
    if (this.policy.jitter > 0) {
      const jitterRange = delay * this.policy.jitter;
      delay += (Math.random() * 2 - 1) * jitterRange;
    }

    // Cap at maxDelay
    return Math.min(Math.max(0, Math.round(delay)), this.policy.maxDelayMs);
  }

  /**
   * Check whether an error should trigger a retry.
   */
  shouldRetry(error: string): boolean {
    // Check noRetryOn first (takes precedence)
    if (this.policy.noRetryOn.length > 0) {
      for (const pattern of this.policy.noRetryOn) {
        if (new RegExp(pattern, "i").test(error)) {
          return false;
        }
      }
    }

    // If retryOn is specified, only retry matching errors
    if (this.policy.retryOn.length > 0) {
      return this.policy.retryOn.some((pattern) => new RegExp(pattern, "i").test(error));
    }

    // Default: retry all errors
    return true;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ── Presets ────────────────────────────────────────────────────────────────

export const RETRY_PRESETS: Record<string, RetryPolicy> = {
  /** No retries */
  none: { maxRetries: 0 },
  /** Quick retry: 1 attempt with short delay */
  quick: { maxRetries: 1, strategy: "fixed", baseDelayMs: 500 },
  /** Standard: 2 retries with exponential backoff */
  standard: { maxRetries: 2, strategy: "exponential", baseDelayMs: 1000 },
  /** Aggressive: 3 retries with longer delays */
  aggressive: { maxRetries: 3, strategy: "exponential", baseDelayMs: 2000, multiplier: 2 },
  /** Patient: 5 retries with linear delays (for flaky network) */
  patient: { maxRetries: 5, strategy: "linear", baseDelayMs: 3000 },
  /** CI: optimized for CI — fewer retries, no jitter */
  ci: { maxRetries: 2, strategy: "fixed", baseDelayMs: 2000, jitter: 0 },
};
