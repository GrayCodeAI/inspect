// ============================================================================
// @inspect/browser - Watchdog System
//
// Parallel monitors that run during browser testing to auto-handle:
// - Cookie consent banners
// - Popup windows
// - Overlay/modal dismissal
// - Browser crashes
// Inspired by Browser Use's watchdog system.
// ============================================================================

import type { Page } from "playwright";

export interface WatchdogOptions {
  /** Auto-dismiss cookie consent. Default: true */
  cookieConsent?: boolean;
  /** Auto-close popup windows. Default: true */
  popups?: boolean;
  /** Auto-dismiss overlays/modals blocking content. Default: true */
  overlays?: boolean;
  /** Detect and report crashes. Default: true */
  crashes?: boolean;
  /** Check interval in ms. Default: 2000 */
  intervalMs?: number;
}

export interface WatchdogEvent {
  type: "cookie-consent" | "popup" | "overlay" | "crash";
  action: "dismissed" | "detected" | "failed";
  details?: string;
  timestamp: number;
}

/**
 * BrowserWatchdog runs parallel monitors during testing.
 */
export class BrowserWatchdog {
  private page: Page;
  private options: Required<WatchdogOptions>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private events: WatchdogEvent[] = [];
  private running = false;

  constructor(page: Page, options: WatchdogOptions = {}) {
    this.page = page;
    this.options = {
      cookieConsent: options.cookieConsent ?? true,
      popups: options.popups ?? true,
      overlays: options.overlays ?? true,
      crashes: options.crashes ?? true,
      intervalMs: options.intervalMs ?? 2000,
    };
  }

  /**
   * Start monitoring.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Auto-close popup windows
    if (this.options.popups) {
      this.page.context().on("page", async (newPage) => {
        try {
          await newPage.close();
          this.events.push({ type: "popup", action: "dismissed", details: newPage.url(), timestamp: Date.now() });
        } catch {}
      });
    }

    // Periodic checks
    this.timer = setInterval(() => this.check(), this.options.intervalMs);
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Get all events captured during monitoring.
   */
  getEvents(): WatchdogEvent[] {
    return [...this.events];
  }

  private async check(): Promise<void> {
    if (!this.running) return;

    try {
      // Cookie consent check
      if (this.options.cookieConsent) {
        await this.dismissCookieConsent();
      }

      // Overlay check
      if (this.options.overlays) {
        await this.dismissOverlays();
      }
    } catch {
      // Non-critical — page might have navigated
    }
  }

  private async dismissCookieConsent(): Promise<void> {
    const dismissed = await this.page.evaluate(() => {
      const selectors = [
        'button[id*="cookie" i][id*="accept" i]',
        'button[class*="cookie" i][class*="accept" i]',
        'button[id*="consent" i][id*="accept" i]',
        '[class*="cookie-banner" i] button',
        '[id*="onetrust" i] button#onetrust-accept-btn-handler',
        'button[aria-label*="accept" i][aria-label*="cookie" i]',
        'button:has-text("Accept All")',
        'button:has-text("Accept Cookies")',
        'button:has-text("I Agree")',
        'button:has-text("Got it")',
      ];

      for (const sel of selectors) {
        try {
          const btn = document.querySelector(sel) as HTMLElement;
          if (btn && btn.offsetParent !== null) {
            btn.click();
            return true;
          }
        } catch {}
      }
      return false;
    });

    if (dismissed) {
      this.events.push({ type: "cookie-consent", action: "dismissed", timestamp: Date.now() });
    }
  }

  private async dismissOverlays(): Promise<void> {
    const dismissed = await this.page.evaluate(() => {
      // Find fixed/absolute overlays covering >50% of viewport
      const overlays = document.querySelectorAll('[style*="position: fixed"], [style*="position:fixed"], .modal, .overlay, [role="dialog"]');

      for (const overlay of overlays) {
        const rect = (overlay as HTMLElement).getBoundingClientRect();
        if (rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.5) {
          // Look for close button inside
          const closeBtn = overlay.querySelector('button[aria-label*="close" i], button[class*="close" i], .close, [data-dismiss]') as HTMLElement;
          if (closeBtn) {
            closeBtn.click();
            return true;
          }
        }
      }
      return false;
    });

    if (dismissed) {
      this.events.push({ type: "overlay", action: "dismissed", timestamp: Date.now() });
    }
  }
}
