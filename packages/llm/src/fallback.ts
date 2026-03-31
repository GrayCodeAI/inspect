// ============================================================================
// @inspect/agent - LLM Fallback Manager
//
// Wraps an LLM call with automatic fallback to a secondary provider
// when the primary fails (429 rate limit, timeout, 500 error).
// Inspired by Browser Use's fallback LLM switching.
// ============================================================================

export interface FallbackConfig {
  /** Errors that trigger fallback (regex patterns) */
  retryablePatterns?: string[];
  /** Cooldown before retrying primary (ms). Default: 60000 */
  cooldownMs?: number;
  /** Max consecutive failures before permanent switch. Default: 3 */
  maxFailures?: number;
}

export type LLMCallFn = (messages: Array<{ role: string; content: string }>) => Promise<string>;

const DEFAULT_RETRYABLE = [
  "429",
  "rate.?limit",
  "too many requests",
  "timeout",
  "timed out",
  "500",
  "502",
  "503",
  "504",
  "ECONNREFUSED",
  "ENOTFOUND",
  "fetch failed",
];

/**
 * FallbackManager wraps LLM calls with automatic provider switching.
 *
 * Usage:
 * ```ts
 * const fallback = new FallbackManager(primaryLLM, secondaryLLM);
 * const response = await fallback.call(messages);
 * // If primary fails with 429/timeout → auto-switches to secondary
 * // After cooldown → tries primary again
 * ```
 */
export class FallbackManager {
  private primary: LLMCallFn;
  private fallback: LLMCallFn | null;
  private config: Required<FallbackConfig>;

  private usingFallback = false;
  private primaryFailures = 0;
  private lastPrimaryFailure = 0;
  private retryablePatterns: RegExp[];

  constructor(primary: LLMCallFn, fallback?: LLMCallFn, config: FallbackConfig = {}) {
    this.primary = primary;
    this.fallback = fallback ?? null;
    this.config = {
      retryablePatterns: config.retryablePatterns ?? DEFAULT_RETRYABLE,
      cooldownMs: config.cooldownMs ?? 60_000,
      maxFailures: config.maxFailures ?? 3,
    };
    this.retryablePatterns = this.config.retryablePatterns.map((p) => new RegExp(p, "i"));
  }

  /**
   * Call the LLM with automatic fallback.
   */
  async call(messages: Array<{ role: string; content: string }>): Promise<string> {
    // Check if we should try primary again after cooldown
    if (this.usingFallback && this.primaryFailures < this.config.maxFailures) {
      if (Date.now() - this.lastPrimaryFailure >= this.config.cooldownMs) {
        this.usingFallback = false;
      }
    }

    const activeLLM = this.usingFallback && this.fallback ? this.fallback : this.primary;

    try {
      const response = await activeLLM(messages);
      // Success — reset failure count if we're back on primary
      if (!this.usingFallback) {
        this.primaryFailures = 0;
      }
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Check if retryable
      if (this.isRetryable(message) && this.fallback && !this.usingFallback) {
        this.primaryFailures++;
        this.lastPrimaryFailure = Date.now();
        this.usingFallback = true;

        // Try fallback
        return this.fallback(messages);
      }

      // Not retryable or no fallback — rethrow
      throw err;
    }
  }

  /**
   * Get current provider status.
   */
  getStatus(): {
    usingFallback: boolean;
    primaryFailures: number;
    hasFallback: boolean;
    permanentlyFailed: boolean;
  } {
    return {
      usingFallback: this.usingFallback,
      primaryFailures: this.primaryFailures,
      hasFallback: this.fallback !== null,
      permanentlyFailed: this.primaryFailures >= this.config.maxFailures,
    };
  }

  /**
   * Force switch to fallback.
   */
  switchToFallback(): void {
    if (this.fallback) {
      this.usingFallback = true;
    }
  }

  /**
   * Force switch back to primary.
   */
  switchToPrimary(): void {
    this.usingFallback = false;
    this.primaryFailures = 0;
  }

  private isRetryable(error: string): boolean {
    return this.retryablePatterns.some((p) => p.test(error));
  }
}
