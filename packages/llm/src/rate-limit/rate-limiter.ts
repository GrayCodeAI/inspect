/**
 * Rate Limiter
 *
 * Advanced rate limiting for LLM providers with token bucket,
 * sliding window, and adaptive backoff strategies.
 */

import { EventEmitter } from "events";

export interface RateLimiterConfig {
  /** Requests per minute */
  requestsPerMinute: number;
  /** Tokens per minute */
  tokensPerMinute: number;
  /** Burst size (max concurrent) */
  burstSize: number;
  /** Strategy */
  strategy: "token-bucket" | "sliding-window" | "fixed-window";
  /** Enable adaptive backoff */
  adaptiveBackoff: boolean;
  /** Max backoff time (ms) */
  maxBackoff: number;
  /** On rate limit hit */
  onRateLimit?: (info: RateLimitInfo) => void;
  /** On request allowed */
  onRequestAllowed?: (info: RequestInfo) => void;
}

export interface RateLimitInfo {
  provider: string;
  retryAfter: number;
  limit: number;
  remaining: number;
  resetTime: number;
  strategy: string;
}

export interface RequestInfo {
  provider: string;
  tokens: number;
  timestamp: number;
  waitTime: number;
}

export interface RateLimitState {
  tokens: number;
  lastRefill: number;
  windowRequests: number[];
  currentBackoff: number;
  consecutiveFailures: number;
}

export interface LimiterStats {
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  totalTokens: number;
  averageWaitTime: number;
  currentRate: number;
  burstCapacity: number;
}

export const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  requestsPerMinute: 60,
  tokensPerMinute: 100000,
  burstSize: 10,
  strategy: "token-bucket",
  adaptiveBackoff: true,
  maxBackoff: 60000,
};

/**
 * Rate Limiter for LLM Providers
 *
 * Implements multiple rate limiting strategies with adaptive backoff.
 */
export class RateLimiter extends EventEmitter {
  private config: RateLimiterConfig;
  private state: RateLimitState;
  private requestQueue: Array<{
    resolve: (value: boolean) => void;
    reject: (reason: Error) => void;
    tokens: number;
    startTime: number;
  }> = [];
  private stats = {
    totalRequests: 0,
    allowedRequests: 0,
    deniedRequests: 0,
    totalTokens: 0,
    totalWaitTime: 0,
  };
  private processing = false;

  constructor(
    private provider: string,
    config: Partial<RateLimiterConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_RATE_LIMITER_CONFIG, ...config };
    this.state = {
      tokens: this.config.burstSize,
      lastRefill: Date.now(),
      windowRequests: [],
      currentBackoff: 0,
      consecutiveFailures: 0,
    };
  }

  /**
   * Acquire permission for request
   */
  async acquire(tokens = 1): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        resolve,
        reject,
        tokens,
        startTime: Date.now(),
      });

      this.processQueue();
    });
  }

  /**
   * Try to acquire immediately (non-blocking)
   */
  tryAcquire(tokens = 1): boolean {
    if (this.requestQueue.length > 0) {
      return false;
    }

    return this.checkLimit(tokens);
  }

  /**
   * Process request queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue[0];

      // Calculate wait time if needed
      const waitTime = this.calculateWaitTime(request.tokens);

      if (waitTime > 0) {
        // Check if wait exceeds max backoff
        const elapsed = Date.now() - request.startTime;
        if (elapsed + waitTime > this.config.maxBackoff) {
          request.reject(new Error("Rate limit wait time exceeded maximum backoff"));
          this.requestQueue.shift();
          this.stats.deniedRequests++;
          continue;
        }

        // Wait and retry
        await new Promise((r) => setTimeout(r, waitTime));
      }

      if (this.checkLimit(request.tokens)) {
        this.consumeTokens(request.tokens);
        this.requestQueue.shift();

        const totalWait = Date.now() - request.startTime;
        this.stats.totalWaitTime += totalWait;
        this.stats.allowedRequests++;

        this.config.onRequestAllowed?.({
          provider: this.provider,
          tokens: request.tokens,
          timestamp: Date.now(),
          waitTime: totalWait,
        });

        request.resolve(true);
      } else {
        // Should not happen after wait, but handle it
        break;
      }
    }

    this.processing = false;
  }

  /**
   * Check if request is within limits
   */
  private checkLimit(tokens: number): boolean {
    this.refillTokens();

    switch (this.config.strategy) {
      case "token-bucket":
        return this.state.tokens >= tokens;

      case "sliding-window":
        return this.checkSlidingWindow();

      case "fixed-window":
        return this.checkFixedWindow();

      default:
        return true;
    }
  }

  /**
   * Consume tokens
   */
  private consumeTokens(tokens: number): void {
    this.stats.totalRequests++;
    this.stats.totalTokens += tokens;

    switch (this.config.strategy) {
      case "token-bucket":
        this.state.tokens -= tokens;
        break;

      case "sliding-window":
        this.state.windowRequests.push(Date.now());
        // Clean old requests
        const cutoff = Date.now() - 60000;
        this.state.windowRequests = this.state.windowRequests.filter(
          (t) => t > cutoff
        );
        break;

      case "fixed-window":
        this.state.windowRequests.push(Date.now());
        break;
    }
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refillTokens(): void {
    if (this.config.strategy !== "token-bucket") return;

    const now = Date.now();
    const elapsed = now - this.state.lastRefill;
    const refillRate = this.config.requestsPerMinute / 60000; // per ms
    const tokensToAdd = elapsed * refillRate;

    this.state.tokens = Math.min(
      this.config.burstSize,
      this.state.tokens + tokensToAdd
    );
    this.state.lastRefill = now;
  }

  /**
   * Calculate wait time for request
   */
  private calculateWaitTime(tokens: number): number {
    switch (this.config.strategy) {
      case "token-bucket": {
        const needed = tokens - this.state.tokens;
        if (needed <= 0) return 0;

        const refillRate = this.config.requestsPerMinute / 60000;
        return Math.ceil(needed / refillRate);
      }

      case "sliding-window": {
        if (this.state.windowRequests.length < this.config.requestsPerMinute) {
          return 0;
        }

        // Wait until oldest request slides out of window
        const oldest = this.state.windowRequests[0];
        const resetTime = oldest + 60000;
        return Math.max(0, resetTime - Date.now());
      }

      case "fixed-window": {
        const windowStart = Math.floor(Date.now() / 60000) * 60000;
        const windowEnd = windowStart + 60000;

        if (this.state.windowRequests.length < this.config.requestsPerMinute) {
          return 0;
        }

        return windowEnd - Date.now();
      }

      default:
        return 0;
    }
  }

  /**
   * Check sliding window limit
   */
  private checkSlidingWindow(): boolean {
    const cutoff = Date.now() - 60000;
    this.state.windowRequests = this.state.windowRequests.filter(
      (t) => t > cutoff
    );

    return this.state.windowRequests.length < this.config.requestsPerMinute;
  }

  /**
   * Check fixed window limit
   */
  private checkFixedWindow(): boolean {
    const currentWindow = Math.floor(Date.now() / 60000);
    const lastWindow = Math.floor(
      (this.state.windowRequests[0] || Date.now()) / 60000
    );

    if (currentWindow !== lastWindow) {
      this.state.windowRequests = [];
      return true;
    }

    return this.state.windowRequests.length < this.config.requestsPerMinute;
  }

  /**
   * Report rate limit hit (from provider response)
   */
  reportRateLimit(retryAfter?: number): void {
    this.state.consecutiveFailures++;
    this.stats.deniedRequests++;

    if (this.config.adaptiveBackoff) {
      // Exponential backoff
      const backoff = Math.min(
        this.config.maxBackoff,
        1000 * Math.pow(2, this.state.consecutiveFailures)
      );
      this.state.currentBackoff = backoff;
    }

    const resetTime = retryAfter
      ? Date.now() + retryAfter * 1000
      : Date.now() + this.state.currentBackoff;

    this.config.onRateLimit?.({
      provider: this.provider,
      retryAfter: retryAfter || this.state.currentBackoff / 1000,
      limit: this.config.requestsPerMinute,
      remaining: 0,
      resetTime,
      strategy: this.config.strategy,
    });

    this.emit("rate-limit", {
      provider: this.provider,
      retryAfter,
      backoff: this.state.currentBackoff,
    });
  }

  /**
   * Report success (reset backoff)
   */
  reportSuccess(): void {
    this.state.consecutiveFailures = 0;
    this.state.currentBackoff = 0;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current state
   */
  getState(): RateLimitState {
    return { ...this.state };
  }

  /**
   * Get statistics
   */
  getStats(): LimiterStats {
    const avgWait =
      this.stats.allowedRequests > 0
        ? this.stats.totalWaitTime / this.stats.allowedRequests
        : 0;

    return {
      totalRequests: this.stats.totalRequests,
      allowedRequests: this.stats.allowedRequests,
      deniedRequests: this.stats.deniedRequests,
      totalTokens: this.stats.totalTokens,
      averageWaitTime: avgWait,
      currentRate: this.calculateCurrentRate(),
      burstCapacity: this.state.tokens,
    };
  }

  /**
   * Calculate current request rate
   */
  private calculateCurrentRate(): number {
    const now = Date.now();
    const windowStart = now - 60000;

    switch (this.config.strategy) {
      case "sliding-window":
      case "fixed-window":
        return this.state.windowRequests.filter((t) => t > windowStart).length;

      case "token-bucket": {
        // Approximate from consumed tokens
        const consumed = this.config.burstSize - this.state.tokens;
        return Math.max(0, consumed);
      }

      default:
        return 0;
    }
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state = {
      tokens: this.config.burstSize,
      lastRefill: Date.now(),
      windowRequests: [],
      currentBackoff: 0,
      consecutiveFailures: 0,
    };
    this.requestQueue = [];
  }
}

/**
 * Multi-provider rate limiter
 */
export class MultiProviderRateLimiter {
  private limiters = new Map<string, RateLimiter>();

  /**
   * Create or get limiter for provider
   */
  getLimiter(provider: string, config?: Partial<RateLimiterConfig>): RateLimiter {
    if (!this.limiters.has(provider)) {
      this.limiters.set(provider, new RateLimiter(provider, config));
    }
    return this.limiters.get(provider)!;
  }

  /**
   * Acquire for specific provider
   */
  async acquire(provider: string, tokens?: number): Promise<boolean> {
    const limiter = this.getLimiter(provider);
    return limiter.acquire(tokens);
  }

  /**
   * Get all stats
   */
  getAllStats(): Record<string, LimiterStats> {
    const stats: Record<string, LimiterStats> = {};
    for (const [provider, limiter] of this.limiters) {
      stats[provider] = limiter.getStats();
    }
    return stats;
  }
}

/**
 * Convenience function
 */
export function createRateLimiter(
  provider: string,
  config?: Partial<RateLimiterConfig>
): RateLimiter {
  return new RateLimiter(provider, config);
}
