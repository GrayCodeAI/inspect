// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - CAPTCHA Watchdog
// ──────────────────────────────────────────────────────────────────────────────

import type { Watchdog, WatchdogEvent } from "./manager.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/watchdog-captcha");

/** Known CAPTCHA provider indicators */
const CAPTCHA_INDICATORS = {
  /** CSS selectors that indicate a CAPTCHA is present */
  selectors: [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    'iframe[src*="turnstile"]',
    ".g-recaptcha",
    ".h-captcha",
    ".cf-turnstile",
    "[data-sitekey]",
    "[data-captcha]",
    "#captcha",
    ".captcha",
    'img[alt*="captcha" i]',
    'img[alt*="verify" i]',
  ],
  /** URL patterns for CAPTCHA scripts */
  scriptPatterns: [
    "recaptcha/api.js",
    "hcaptcha.com/1/api.js",
    "challenges.cloudflare.com/turnstile",
    "funcaptcha.com/fc",
    "arkoselabs.com",
  ],
  /** Text patterns that suggest a CAPTCHA challenge */
  textPatterns: [
    "verify you are human",
    "i'm not a robot",
    "complete the captcha",
    "prove you're not a robot",
    "security check",
    "please verify",
    "one more step",
    "checking your browser",
    "attention required",
  ],
} as const;

/** Page interface (subset of Playwright Page) */
interface PageLike {
  evaluate<T>(fn: string | ((...args: unknown[]) => T)): Promise<T>;
  url(): string;
  content(): Promise<string>;
}

/**
 * Watchdog that detects CAPTCHA challenges on the page.
 *
 * Monitors for reCAPTCHA, hCaptcha, Cloudflare Turnstile,
 * and other CAPTCHA providers. When detected, emits a blocking
 * event so the agent can pause and optionally request human help.
 */
export class CaptchaWatchdog implements Watchdog {
  readonly type = "captcha" as const;
  private page: PageLike | null = null;
  private detected = false;
  private lastCheck = 0;
  private checkInterval = 2000; // Check every 2 seconds

  constructor(page?: PageLike) {
    this.page = page ?? null;
  }

  setPage(page: PageLike): void {
    this.page = page;
  }

  start(): void {
    this.detected = false;
    this.lastCheck = 0;
  }

  stop(): void {
    this.detected = false;
  }

  check(): WatchdogEvent | null {
    // Rate-limit checks
    const now = Date.now();
    if (now - this.lastCheck < this.checkInterval) {
      return null;
    }
    this.lastCheck = now;

    // Don't re-trigger if already detected
    if (this.detected) {
      return null;
    }

    // We can't synchronously check the page; return null and rely on
    // the async checkAsync method called from the manager's poll cycle
    return null;
  }

  /**
   * Async check that actually queries the page DOM.
   */
  async checkAsync(): Promise<WatchdogEvent | null> {
    if (!this.page || this.detected) return null;

    try {
      const result = (await this.page.evaluate(`
        (() => {
          const selectors = ${JSON.stringify(CAPTCHA_INDICATORS.selectors)};
          const textPatterns = ${JSON.stringify(CAPTCHA_INDICATORS.textPatterns)};

          // Check selectors
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                return { found: true, type: 'selector', detail: selector };
              }
            }
          }

          // Check page text
          const bodyText = document.body?.innerText?.toLowerCase() ?? '';
          for (const pattern of textPatterns) {
            if (bodyText.includes(pattern)) {
              return { found: true, type: 'text', detail: pattern };
            }
          }

          // Check for CAPTCHA scripts
          const scripts = Array.from(document.querySelectorAll('script[src]'));
          const scriptPatterns = ${JSON.stringify(CAPTCHA_INDICATORS.scriptPatterns)};
          for (const script of scripts) {
            const src = script.getAttribute('src') ?? '';
            for (const pattern of scriptPatterns) {
              if (src.includes(pattern)) {
                return { found: true, type: 'script', detail: pattern };
              }
            }
          }

          return { found: false };
        })()
      `)) as { found: boolean; type?: string; detail?: string };

      if (result.found) {
        this.detected = true;
        return {
          type: "captcha",
          timestamp: Date.now(),
          message: `CAPTCHA detected via ${result.type}: ${result.detail}`,
          severity: "critical",
          blocking: true,
          data: {
            detectionMethod: result.type,
            detail: result.detail,
            url: this.page.url(),
          },
          suggestedAction: "pause_for_human_intervention",
        };
      }
    } catch (error) {
      logger.debug("Failed to check for CAPTCHA, page may be navigating", {
        err: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * Mark the CAPTCHA as resolved (human solved it).
   */
  markResolved(): void {
    this.detected = false;
  }
}
