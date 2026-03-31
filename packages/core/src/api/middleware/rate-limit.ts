// ============================================================================
// @inspect/api - Rate Limiting Middleware
// ============================================================================

import type { Middleware, APIRequest, APIResponse } from "../server.js";

/** Rate limit configuration */
export interface RateLimitConfig {
  /** Maximum requests per window (default: 100) */
  maxRequests?: number;
  /** Time window in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;
  /** Key extractor — determines how to group requests (default: by IP) */
  keyExtractor?: (req: APIRequest) => string;
  /** Message returned when rate limited */
  message?: string;
  /** Whether to include rate limit headers in responses (default: true) */
  headers?: boolean;
  /** Paths to skip rate limiting (e.g. health checks) */
  skipPaths?: string[];
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limiter using a sliding window approach.
 * Tracks request counts per key (IP by default) and rejects
 * requests that exceed the configured limit.
 */
export class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private config: Required<RateLimitConfig>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: RateLimitConfig) {
    this.config = {
      maxRequests: config?.maxRequests ?? 100,
      windowMs: config?.windowMs ?? 60_000,
      keyExtractor: config?.keyExtractor ?? defaultKeyExtractor,
      message: config?.message ?? "Too many requests, please try again later",
      headers: config?.headers ?? true,
      skipPaths: config?.skipPaths ?? ["/api/health", "/api/status"],
    };

    // Periodic cleanup of expired entries every 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60_000);
    // Allow the process to exit even if timer is pending
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Create a middleware function for rate limiting.
   */
  middleware(): Middleware {
    return async (req: APIRequest, res: APIResponse, next: () => Promise<void>) => {
      // Skip configured paths
      if (this.config.skipPaths.some((p) => req.path.startsWith(p))) {
        await next();
        return;
      }

      const key = this.config.keyExtractor(req);
      const now = Date.now();
      const entry = this.store.get(key);

      if (entry && now < entry.resetAt) {
        // Window is still active
        entry.count++;

        if (this.config.headers) {
          this.setHeaders(res, entry);
        }

        if (entry.count > this.config.maxRequests) {
          const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
          res.header("Retry-After", String(retryAfter));
          res.status(429).json({
            error: this.config.message,
            retryAfter,
          });
          return;
        }
      } else {
        // Create new window
        const newEntry: RateLimitEntry = {
          count: 1,
          resetAt: now + this.config.windowMs,
        };
        this.store.set(key, newEntry);

        if (this.config.headers) {
          this.setHeaders(res, newEntry);
        }
      }

      await next();
    };
  }

  /**
   * Get the current count for a key (useful for testing/monitoring).
   */
  getCount(key: string): number {
    const entry = this.store.get(key);
    if (!entry || Date.now() >= entry.resetAt) return 0;
    return entry.count;
  }

  /**
   * Reset rate limit for a specific key.
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Stop the cleanup timer.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private setHeaders(res: APIResponse, entry: RateLimitEntry): void {
    const remaining = Math.max(0, this.config.maxRequests - entry.count);
    res.header("X-RateLimit-Limit", String(this.config.maxRequests));
    res.header("X-RateLimit-Remaining", String(remaining));
    res.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

/**
 * Default key extractor — uses the client IP address.
 */
function defaultKeyExtractor(req: APIRequest): string {
  // Check common proxy headers first
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return ip.trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (realIp && typeof realIp === "string") {
    return realIp.trim();
  }

  // Fall back to socket remote address
  return req.raw.socket?.remoteAddress ?? "unknown";
}
