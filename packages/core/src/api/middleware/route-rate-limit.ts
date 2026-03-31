// ============================================================================
// @inspect/api - Per-Endpoint Rate Limiting
// ============================================================================

import type { Middleware, APIRequest, APIResponse } from "../server.js";

/** Per-route rate limit rule */
export interface RouteRateLimitRule {
  /** Path pattern to match (e.g., "/api/tasks") */
  path: string | RegExp;
  /** HTTP method to match (default: all) */
  method?: string;
  /** Max requests per window */
  maxRequests: number;
  /** Window in ms */
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Per-endpoint rate limiter with configurable rules.
 * Applies stricter limits to expensive endpoints.
 *
 * Usage:
 * ```ts
 * const limiter = new RouteRateLimiter([
 *   { path: "/api/tasks", method: "POST", maxRequests: 10, windowMs: 60_000 },
 *   { path: "/api/dashboard/run", method: "POST", maxRequests: 5, windowMs: 60_000 },
 * ]);
 * server.use(limiter.middleware());
 * ```
 */
export class RouteRateLimiter {
  private rules: RouteRateLimitRule[];
  private stores = new Map<number, Map<string, RateLimitEntry>>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(rules: RouteRateLimitRule[]) {
    this.rules = rules;

    // Init store for each rule
    for (let i = 0; i < rules.length; i++) {
      this.stores.set(i, new Map());
    }

    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60_000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  middleware(): Middleware {
    return async (req: APIRequest, res: APIResponse, next: () => Promise<void>) => {
      for (let i = 0; i < this.rules.length; i++) {
        const rule = this.rules[i];

        // Check method match
        if (rule.method && rule.method.toUpperCase() !== req.method) continue;

        // Check path match
        const matches =
          typeof rule.path === "string"
            ? req.path === rule.path || req.path.startsWith(rule.path)
            : rule.path.test(req.path);

        if (!matches) continue;

        // Apply rate limit
        const key = this.extractKey(req);
        const store = this.stores.get(i)!;
        const now = Date.now();
        const entry = store.get(key);

        if (entry && now < entry.resetAt) {
          entry.count++;
          const remaining = Math.max(0, rule.maxRequests - entry.count);
          res.header("X-RateLimit-Limit", String(rule.maxRequests));
          res.header("X-RateLimit-Remaining", String(remaining));
          res.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

          if (entry.count > rule.maxRequests) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            res.header("Retry-After", String(retryAfter));
            res.status(429).json({
              error: "Rate limit exceeded for this endpoint",
              retryAfter,
              path: req.path,
            });
            return;
          }
        } else {
          const newEntry: RateLimitEntry = { count: 1, resetAt: now + rule.windowMs };
          store.set(key, newEntry);
          res.header("X-RateLimit-Limit", String(rule.maxRequests));
          res.header("X-RateLimit-Remaining", String(rule.maxRequests - 1));
          res.header("X-RateLimit-Reset", String(Math.ceil(newEntry.resetAt / 1000)));
        }

        // First matching rule wins
        break;
      }

      await next();
    };
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
  }

  private extractKey(req: APIRequest): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
      return ip.trim();
    }
    const realIp = req.headers["x-real-ip"];
    if (realIp && typeof realIp === "string") return realIp.trim();
    return req.raw.socket?.remoteAddress ?? "unknown";
  }

  private cleanup(): void {
    const now = Date.now();
    for (const store of this.stores.values()) {
      for (const [key, entry] of store) {
        if (now >= entry.resetAt) store.delete(key);
      }
    }
  }
}
