// ============================================================================
// @inspect/agent - API Rate Limiter
//
// Token-bucket rate limiter for LLM API requests. Queues requests when
// rate limits are exceeded and drains them as capacity becomes available.
// Supports per-provider limits with shared or independent buckets.
// ============================================================================

export interface RateLimitConfig {
  /** Maximum requests per minute. Default: 60 */
  requestsPerMinute?: number;
  /** Maximum tokens per minute (if provider tracks token usage). Default: unlimited */
  tokensPerMinute?: number;
  /** Maximum concurrent requests. Default: 10 */
  maxConcurrent?: number;
  /** Queue timeout in ms — reject if waiting too long. Default: 60000 */
  queueTimeoutMs?: number;
}

interface QueuedRequest {
  resolve: () => void;
  reject: (err: Error) => void;
  enqueuedAt: number;
  estimatedTokens: number;
}

/**
 * RateLimiter implements a token-bucket algorithm for LLM API calls.
 *
 * Usage:
 * ```ts
 * const limiter = new RateLimiter({ requestsPerMinute: 30, maxConcurrent: 5 });
 *
 * // Wrap every API call:
 * await limiter.acquire(estimatedTokens);
 * try {
 *   const result = await provider.chat(messages);
 *   limiter.recordTokens(result.usage.totalTokens);
 * } finally {
 *   limiter.release();
 * }
 * ```
 */
export class RateLimiter {
  private config: Required<RateLimitConfig>;

  // Request rate tracking
  private requestTimestamps: number[] = [];

  // Token rate tracking
  private tokenTimestamps: Array<{ timestamp: number; tokens: number }> = [];

  // Concurrency tracking
  private activeRequests = 0;

  // Request queue
  private queue: QueuedRequest[] = [];

  // Drain timer
  private drainTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitConfig = {}) {
    this.config = {
      requestsPerMinute: config.requestsPerMinute ?? 60,
      tokensPerMinute: config.tokensPerMinute ?? Infinity,
      maxConcurrent: config.maxConcurrent ?? 10,
      queueTimeoutMs: config.queueTimeoutMs ?? 60_000,
    };
  }

  /**
   * Acquire a slot to make a request.
   * Resolves when it's safe to proceed, or rejects if the queue timeout is exceeded.
   *
   * @param estimatedTokens - Estimated token count for this request (for token-based limiting)
   */
  async acquire(estimatedTokens = 0): Promise<void> {
    // Fast path: capacity available
    if (this.canProceed(estimatedTokens)) {
      this.recordRequest();
      this.activeRequests++;
      return;
    }

    // Slow path: queue and wait
    return new Promise<void>((resolve, reject) => {
      const entry: QueuedRequest = {
        resolve: () => {
          this.recordRequest();
          this.activeRequests++;
          resolve();
        },
        reject,
        enqueuedAt: Date.now(),
        estimatedTokens,
      };

      this.queue.push(entry);
      this.startDrainTimer();
    });
  }

  /**
   * Release a concurrency slot after request completes.
   */
  release(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.tryDrain();
  }

  /**
   * Record actual token usage after a response is received.
   */
  recordTokens(tokens: number): void {
    this.tokenTimestamps.push({ timestamp: Date.now(), tokens });
  }

  /**
   * Get current rate limiter status.
   */
  getStatus(): {
    activeRequests: number;
    queueLength: number;
    requestsInWindow: number;
    tokensInWindow: number;
    available: boolean;
  } {
    this.pruneOldEntries();
    return {
      activeRequests: this.activeRequests,
      queueLength: this.queue.length,
      requestsInWindow: this.requestTimestamps.length,
      tokensInWindow: this.getTokensInWindow(),
      available: this.canProceed(0),
    };
  }

  /**
   * Destroy the limiter and reject all queued requests.
   */
  destroy(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }

    for (const entry of this.queue) {
      entry.reject(new Error("Rate limiter destroyed"));
    }
    this.queue = [];
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private canProceed(estimatedTokens: number): boolean {
    this.pruneOldEntries();

    // Check concurrent limit
    if (this.activeRequests >= this.config.maxConcurrent) {
      return false;
    }

    // Check request rate
    if (this.requestTimestamps.length >= this.config.requestsPerMinute) {
      return false;
    }

    // Check token rate
    if (this.config.tokensPerMinute !== Infinity) {
      const currentTokens = this.getTokensInWindow();
      if (currentTokens + estimatedTokens > this.config.tokensPerMinute) {
        return false;
      }
    }

    return true;
  }

  private recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  private getTokensInWindow(): number {
    return this.tokenTimestamps.reduce((sum, t) => sum + t.tokens, 0);
  }

  private pruneOldEntries(): void {
    const oneMinuteAgo = Date.now() - 60_000;
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > oneMinuteAgo);
    this.tokenTimestamps = this.tokenTimestamps.filter((t) => t.timestamp > oneMinuteAgo);
  }

  private tryDrain(): void {
    const now = Date.now();

    while (this.queue.length > 0) {
      const entry = this.queue[0];

      // Check for timeout
      if (now - entry.enqueuedAt > this.config.queueTimeoutMs) {
        this.queue.shift();
        entry.reject(new Error(`Rate limit queue timeout (${this.config.queueTimeoutMs}ms)`));
        continue;
      }

      // Check if we can proceed
      if (this.canProceed(entry.estimatedTokens)) {
        this.queue.shift();
        entry.resolve();
      } else {
        // Can't proceed yet — stop draining
        break;
      }
    }

    // Stop the drain timer if queue is empty
    if (this.queue.length === 0 && this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
  }

  private startDrainTimer(): void {
    if (this.drainTimer) return;

    // Check every 500ms whether queued requests can proceed
    this.drainTimer = setInterval(() => {
      this.tryDrain();
    }, 500);
  }
}

// ── Provider-specific presets ──────────────────────────────────────────────

export const RATE_LIMIT_PRESETS: Record<string, RateLimitConfig> = {
  anthropic: { requestsPerMinute: 50, tokensPerMinute: 80_000, maxConcurrent: 5 },
  openai: { requestsPerMinute: 60, tokensPerMinute: 150_000, maxConcurrent: 10 },
  gemini: { requestsPerMinute: 60, tokensPerMinute: 100_000, maxConcurrent: 10 },
  deepseek: { requestsPerMinute: 30, tokensPerMinute: 60_000, maxConcurrent: 5 },
  ollama: { requestsPerMinute: Infinity, tokensPerMinute: Infinity, maxConcurrent: 2 },
};
