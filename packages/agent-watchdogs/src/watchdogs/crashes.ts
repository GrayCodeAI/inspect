// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Crash Watchdog
// ──────────────────────────────────────────────────────────────────────────────

import type { Watchdog, WatchdogEvent } from "./manager.js";

/** A tracked crash event */
export interface CrashInfo {
  /** Crash type */
  type: "page_crash" | "browser_crash" | "renderer_crash" | "js_error" | "unhandled_rejection";
  /** Error message */
  message: string;
  /** Stack trace if available */
  stack?: string;
  /** URL where the crash occurred */
  url: string;
  /** When it happened */
  timestamp: number;
  /** Whether the page is still usable */
  recoverable: boolean;
}

/**
 * Watchdog that detects page and browser crashes, unhandled JavaScript
 * errors, and unhandled promise rejections.
 *
 * Distinguishes between recoverable errors (JS exceptions) and
 * non-recoverable crashes (renderer crash, OOM).
 */
export class CrashWatchdog implements Watchdog {
  readonly type = "crash" as const;
  private crashes: CrashInfo[] = [];
  private pendingEvents: WatchdogEvent[] = [];
  private jsErrorCount = 0;
  private jsErrorThreshold = 10; // Alert after this many JS errors
  private currentUrl = "";

  start(): void {
    this.crashes = [];
    this.pendingEvents = [];
    this.jsErrorCount = 0;
  }

  stop(): void {
    // Nothing to clean up
  }

  check(): WatchdogEvent | null {
    return this.pendingEvents.shift() ?? null;
  }

  /**
   * Called when the page crashes (Playwright 'crash' event).
   */
  onPageCrash(url: string): void {
    const crash: CrashInfo = {
      type: "page_crash",
      message: "Page crashed",
      url,
      timestamp: Date.now(),
      recoverable: false,
    };
    this.crashes.push(crash);

    this.pendingEvents.push({
      type: "crash",
      timestamp: Date.now(),
      message: `Page crashed at ${url}`,
      severity: "critical",
      blocking: true,
      data: { crash },
      suggestedAction: "reload_page",
    });
  }

  /**
   * Called on browser disconnection.
   */
  onBrowserDisconnected(): void {
    const crash: CrashInfo = {
      type: "browser_crash",
      message: "Browser disconnected unexpectedly",
      url: this.currentUrl,
      timestamp: Date.now(),
      recoverable: false,
    };
    this.crashes.push(crash);

    this.pendingEvents.push({
      type: "crash",
      timestamp: Date.now(),
      message: "Browser disconnected unexpectedly",
      severity: "critical",
      blocking: true,
      data: { crash },
      suggestedAction: "relaunch_browser",
    });
  }

  /**
   * Called on unhandled JavaScript errors.
   */
  onJSError(message: string, stack?: string, url?: string): void {
    this.jsErrorCount++;

    const crash: CrashInfo = {
      type: "js_error",
      message,
      stack,
      url: url ?? this.currentUrl,
      timestamp: Date.now(),
      recoverable: true,
    };
    this.crashes.push(crash);

    // Only emit events for significant errors or when threshold exceeded
    const isSignificant = this.isSignificantError(message);
    const thresholdExceeded = this.jsErrorCount === this.jsErrorThreshold;

    if (isSignificant || thresholdExceeded) {
      this.pendingEvents.push({
        type: "crash",
        timestamp: Date.now(),
        message: thresholdExceeded
          ? `${this.jsErrorCount} JavaScript errors detected. Latest: ${message}`
          : `JavaScript error: ${message}`,
        severity: isSignificant ? "warning" : "info",
        blocking: false,
        data: {
          crash,
          totalErrors: this.jsErrorCount,
          isSignificant,
        },
      });
    }
  }

  /**
   * Called on unhandled promise rejections.
   */
  onUnhandledRejection(reason: string, url?: string): void {
    const crash: CrashInfo = {
      type: "unhandled_rejection",
      message: `Unhandled promise rejection: ${reason}`,
      url: url ?? this.currentUrl,
      timestamp: Date.now(),
      recoverable: true,
    };
    this.crashes.push(crash);

    this.pendingEvents.push({
      type: "crash",
      timestamp: Date.now(),
      message: `Unhandled rejection: ${reason}`,
      severity: "warning",
      blocking: false,
      data: { crash },
    });
  }

  /**
   * Update the current URL context.
   */
  setUrl(url: string): void {
    this.currentUrl = url;
  }

  /**
   * Get all recorded crashes.
   */
  getCrashes(): CrashInfo[] {
    return [...this.crashes];
  }

  /**
   * Get crash count by type.
   */
  getCrashCount(): Record<CrashInfo["type"], number> {
    const counts: Record<string, number> = {
      page_crash: 0,
      browser_crash: 0,
      renderer_crash: 0,
      js_error: 0,
      unhandled_rejection: 0,
    };

    for (const crash of this.crashes) {
      counts[crash.type]++;
    }

    return counts as Record<CrashInfo["type"], number>;
  }

  /**
   * Set the JS error threshold before alerting.
   */
  setErrorThreshold(threshold: number): void {
    this.jsErrorThreshold = threshold;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private isSignificantError(message: string): boolean {
    const lower = message.toLowerCase();
    const significantPatterns = [
      "typeerror",
      "referenceerror",
      "rangeerror",
      "syntaxerror",
      "out of memory",
      "stack overflow",
      "network error",
      "failed to fetch",
      "cors",
      "security",
      "undefined is not",
      "null is not",
      "cannot read prop",
    ];

    return significantPatterns.some((p) => lower.includes(p));
  }
}
