// ──────────────────────────────────────────────────────────────────────────────
// Rate Limit Watchdog
// Detects and handles rate limiting
// ──────────────────────────────────────────────────────────────────────────────

import type { Page } from "playwright";

export interface RateLimitConfig {
  /** Maximum requests per minute */
  maxRequestsPerMinute?: number;
  /** Maximum requests per hour */
  maxRequestsPerHour?: number;
  /** Cooldown time in ms */
  cooldownMs?: number;
  /** Exponential backoff (default: true) */
  exponentialBackoff?: boolean;
  /** Max retry attempts */
  maxRetries?: number;
  /** User-Agent rotation */
  rotateUserAgent?: boolean;
  /** Proxy rotation */
  rotateProxy?: boolean;
  /** Callback when rate limited */
  onRateLimited?: (info: RateLimitInfo) => Promise<void>;
}

export interface RateLimitInfo {
  /** Type of rate limit */
  type: "429" | "503" | "captcha" | "slowdown" | "custom";
  /** HTTP status code */
  statusCode?: number;
  /** Retry-After header value (seconds) */
  retryAfter?: number;
  /** Time to wait before retry (ms) */
  waitTime: number;
  /** Whether rate limit is per-IP or per-account */
  scope?: "ip" | "account" | "endpoint";
  /** Remaining requests allowed */
  remaining?: number;
  /** Rate limit window reset time */
  resetTime?: Date;
  /** Page URL when rate limited */
  url: string;
  /** Rate limit message */
  message?: string;
}

/** Request tracking for rate limiting */
interface RequestRecord {
  timestamp: number;
  url: string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequestsPerMinute: 60,
  maxRequestsPerHour: 1000,
  cooldownMs: 1000,
  exponentialBackoff: true,
  maxRetries: 3,
  rotateUserAgent: false,
  rotateProxy: false,
};

/** Rate limit indicators in page content */
const RATE_LIMIT_INDICATORS = [
  "rate limit",
  "rate limited",
  "too many requests",
  "429",
  "slow down",
  "please wait",
  "try again later",
  "temporarily blocked",
  "throttled",
  "quota exceeded",
  "limit exceeded",
  "request limit",
  "api limit",
  "usage limit",
];

/**
 * Rate Limit Watchdog
 */
export class RateLimitWatchdog {
  private page: Page;
  private config: RateLimitConfig;
  private requestHistory: RequestRecord[] = [];
  private consecutiveRateLimits = 0;
  private lastRateLimitTime = 0;

  constructor(page: Page, config: RateLimitConfig = {}) {
    this.page = page;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupRequestInterception();
  }

  /**
   * Set up request interception to track requests
   */
  private setupRequestInterception(): void {
    // Clean old requests periodically
    setInterval(() => {
      this.cleanOldRequests();
    }, 60000);
  }

  /**
   * Record a request
   */
  recordRequest(url: string): void {
    this.requestHistory.push({
      timestamp: Date.now(),
      url,
    });
  }

  /**
   * Clean old request records
   */
  private cleanOldRequests(): void {
    const oneHourAgo = Date.now() - 3600000;
    this.requestHistory = this.requestHistory.filter((r) => r.timestamp > oneHourAgo);
  }

  /**
   * Check if we're approaching rate limit
   */
  checkApproachingLimit(): { approaching: boolean; waitTime: number } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;

    const requestsLastMinute = this.requestHistory.filter((r) => r.timestamp > oneMinuteAgo).length;
    const requestsLastHour = this.requestHistory.filter((r) => r.timestamp > oneHourAgo).length;

    const maxPerMinute = this.config.maxRequestsPerMinute ?? 60;
    const maxPerHour = this.config.maxRequestsPerHour ?? 1000;

    // Check if approaching limits (80% threshold)
    const minuteThreshold = maxPerMinute * 0.8;
    const hourThreshold = maxPerHour * 0.8;

    if (requestsLastMinute >= minuteThreshold) {
      return {
        approaching: true,
        waitTime: 60000 / (maxPerMinute - requestsLastMinute + 1),
      };
    }

    if (requestsLastHour >= hourThreshold) {
      return {
        approaching: true,
        waitTime: 3600000 / (maxPerHour - requestsLastHour + 1),
      };
    }

    return { approaching: false, waitTime: 0 };
  }

  /**
   * Check if currently rate limited
   */
  async checkRateLimit(): Promise<RateLimitInfo | undefined> {
    // Check HTTP status
    const response = await this.page.evaluate(() => {
      // Access performance entries
      const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
      return {
        status: entries[0]?.responseStatus,
      };
    });

    if (response.status === 429) {
      return this.parseRateLimitInfo("429");
    }

    if (response.status === 503) {
      return this.parseRateLimitInfo("503");
    }

    // Check page content for rate limit indicators
    const pageText = await this.page.evaluate(() => document.body.innerText.toLowerCase());

    for (const indicator of RATE_LIMIT_INDICATORS) {
      if (pageText.includes(indicator)) {
        return this.parseRateLimitInfo("custom", indicator);
      }
    }

    // Check for CAPTCHA (often shown during rate limiting)
    const hasCaptcha = await this.detectCaptcha();
    if (hasCaptcha) {
      return this.parseRateLimitInfo("captcha");
    }

    // Check for slowdown indicators
    const hasSlowdown = await this.detectSlowdown();
    if (hasSlowdown) {
      return this.parseRateLimitInfo("slowdown");
    }

    return undefined;
  }

  /**
   * Parse rate limit info from page
   */
  private async parseRateLimitInfo(
    type: RateLimitInfo["type"],
    message?: string,
  ): Promise<RateLimitInfo> {
    // Try to extract retry-after from headers or page
    let retryAfter: number | undefined;

    // Check response headers
    const headers = await this.page.evaluate(() => {
      // Try to get headers from performance entries
      const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
      return entries[0]?.responseStatus;
    });

    // Try to extract from page content
    const pageText = await this.page.textContent();

    // Look for "try again in X seconds/minutes"
    const timeMatch = pageText?.match(/try again in (\d+)\s*(second|minute|hour)s?/i);
    if (timeMatch) {
      const value = parseInt(timeMatch[1], 10);
      const unit = timeMatch[2].toLowerCase();
      retryAfter =
        unit === "second"
          ? value
          : unit === "minute"
            ? value * 60
            : unit === "hour"
              ? value * 3600
              : value;
    }

    // Calculate wait time
    let waitTime = this.calculateWaitTime();

    if (retryAfter) {
      waitTime = Math.max(waitTime, retryAfter * 1000);
    }

    // Try to extract reset time
    let resetTime: Date | undefined;
    const resetMatch = pageText?.match(/reset|available at|try again at/i);
    if (resetMatch) {
      // Default to retryAfter from now
      resetTime = new Date(Date.now() + waitTime);
    }

    return {
      type,
      retryAfter,
      waitTime,
      url: this.page.url(),
      message: message ?? `Rate limited (${type})`,
      resetTime,
    };
  }

  /**
   * Calculate wait time with exponential backoff
   */
  private calculateWaitTime(): number {
    const baseCooldown = this.config.cooldownMs ?? 1000;

    if (this.config.exponentialBackoff) {
      return baseCooldown * Math.pow(2, this.consecutiveRateLimits);
    }

    return baseCooldown;
  }

  /**
   * Detect CAPTCHA
   */
  private async detectCaptcha(): Promise<boolean> {
    const captchaSelectors = [
      ".g-recaptcha",
      ".h-captcha",
      "#captcha",
      '[name="captcha"]',
      "iframe[src*='recaptcha']",
      "iframe[src*='hcaptcha']",
      "iframe[src*='captcha']",
    ];

    for (const selector of captchaSelectors) {
      try {
        const count = await this.page.locator(selector).count();
        if (count > 0) return true;
      } catch {
        // Continue
      }
    }

    return false;
  }

  /**
   * Detect slowdown indicators
   */
  private async detectSlowdown(): Promise<boolean> {
    // Check for loading spinners that persist
    const spinnerSelectors = [
      ".loading",
      ".spinner",
      ".progress",
      '[role="progressbar"]',
      ".skeleton",
      ".placeholder",
    ];

    for (const selector of spinnerSelectors) {
      try {
        const visible = await this.page.locator(selector).first().isVisible();
        if (visible) {
          // Check if it's been visible for a while
          await this.page.waitForTimeout(2000);
          const stillVisible = await this.page.locator(selector).first().isVisible();
          if (stillVisible) return true;
        }
      } catch {
        // Continue
      }
    }

    return false;
  }

  /**
   * Handle rate limit
   */
  async handleRateLimit(info: RateLimitInfo, retryCount = 0): Promise<boolean> {
    // Call custom handler if provided
    if (this.config.onRateLimited) {
      await this.config.onRateLimited(info);
    }

    // Check max retries
    const maxRetries = this.config.maxRetries ?? 3;
    if (retryCount >= maxRetries) {
      console.log(`[RateLimitWatchdog] Max retries (${maxRetries}) exceeded`);
      return false;
    }

    // Update tracking
    this.consecutiveRateLimits++;
    this.lastRateLimitTime = Date.now();

    console.log(
      `[RateLimitWatchdog] Rate limited. Waiting ${Math.round(info.waitTime / 1000)}s before retry ${retryCount + 1}/${maxRetries}`,
    );

    // Wait
    await this.page.waitForTimeout(info.waitTime);

    // Try rotating user agent if enabled
    if (this.config.rotateUserAgent) {
      await this.rotateUserAgent();
    }

    // Recheck rate limit
    const stillLimited = await this.checkRateLimit();
    if (stillLimited) {
      return this.handleRateLimit(stillLimited, retryCount + 1);
    }

    // Reset consecutive counter on success
    this.consecutiveRateLimits = 0;
    return true;
  }

  /**
   * Rotate user agent
   */
  private async rotateUserAgent(): Promise<void> {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    ];

    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

    await this.page.setExtraHTTPHeaders({
      "User-Agent": randomUA,
    });

    console.log("[RateLimitWatchdog] Rotated user agent");
  }

  /**
   * Execute action with rate limit protection
   */
  async execute<T>(action: () => Promise<T>, url: string): Promise<T> {
    // Check approaching limit
    const limitStatus = this.checkApproachingLimit();
    if (limitStatus.approaching) {
      console.log(
        `[RateLimitWatchdog] Approaching rate limit, waiting ${Math.round(limitStatus.waitTime)}ms`,
      );
      await this.page.waitForTimeout(limitStatus.waitTime);
    }

    // Record request
    this.recordRequest(url);

    // Execute action
    try {
      const result = await action();
      return result;
    } catch (error) {
      // Check if rate limited
      const rateLimitInfo = await this.checkRateLimit();
      if (rateLimitInfo) {
        const recovered = await this.handleRateLimit(rateLimitInfo);
        if (recovered) {
          // Retry action
          return action();
        }
      }
      throw error;
    }
  }

  /**
   * Get current request statistics
   */
  getStats(): {
    requestsLastMinute: number;
    requestsLastHour: number;
    consecutiveRateLimits: number;
    lastRateLimitTime: number;
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;

    return {
      requestsLastMinute: this.requestHistory.filter((r) => r.timestamp > oneMinuteAgo).length,
      requestsLastHour: this.requestHistory.filter((r) => r.timestamp > oneHourAgo).length,
      consecutiveRateLimits: this.consecutiveRateLimits,
      lastRateLimitTime: this.lastRateLimitTime,
    };
  }
}

/** Create rate limit watchdog */
export function createRateLimitWatchdog(page: Page, config?: RateLimitConfig): RateLimitWatchdog {
  return new RateLimitWatchdog(page, config);
}
