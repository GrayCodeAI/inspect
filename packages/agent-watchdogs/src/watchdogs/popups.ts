// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Popup Watchdog
// ──────────────────────────────────────────────────────────────────────────────

import type { Watchdog, WatchdogEvent } from "./manager.js";

/** Tracked popup/dialog */
export interface TrackedPopup {
  /** Type of popup */
  type: "window" | "dialog" | "modal" | "toast" | "overlay";
  /** URL (for new windows) */
  url?: string;
  /** Dialog message (for alert/confirm/prompt) */
  message?: string;
  /** When detected */
  detectedAt: number;
  /** Whether it was handled */
  handled: boolean;
  /** How it was handled */
  resolution?: "accepted" | "dismissed" | "closed" | "ignored";
}

/** Auto-handling rules for popups */
export interface PopupRule {
  /** Match condition */
  match: {
    type?: TrackedPopup["type"];
    messagePattern?: string;
    urlPattern?: string;
  };
  /** Action to take */
  action: "accept" | "dismiss" | "close" | "ignore" | "block";
  /** Value to enter (for prompt dialogs) */
  promptValue?: string;
}

/**
 * Watchdog that monitors for unexpected popups, dialogs, modals,
 * toast notifications, and overlay elements.
 *
 * Can be configured with auto-handling rules for common popup patterns
 * (cookie consent, newsletter modals, etc.).
 */
export class PopupWatchdog implements Watchdog {
  readonly type = "popup" as const;
  private popups: TrackedPopup[] = [];
  private pendingEvents: WatchdogEvent[] = [];
  private rules: PopupRule[] = [];
  private defaultRule: PopupRule["action"] = "dismiss";

  constructor(rules?: PopupRule[]) {
    if (rules) {
      this.rules = rules;
    }

    // Default rules for common popups
    this.rules.push(
      {
        match: { messagePattern: "cookie" },
        action: "accept",
      },
      {
        match: { messagePattern: "notification" },
        action: "dismiss",
      },
      {
        match: { messagePattern: "newsletter" },
        action: "dismiss",
      },
      {
        match: { messagePattern: "subscribe" },
        action: "dismiss",
      },
    );
  }

  start(): void {
    this.popups = [];
    this.pendingEvents = [];
  }

  stop(): void {
    // Nothing to clean up
  }

  check(): WatchdogEvent | null {
    return this.pendingEvents.shift() ?? null;
  }

  /**
   * Called when a new browser window/tab is opened.
   */
  onNewWindow(url: string): PopupRule["action"] {
    const popup: TrackedPopup = {
      type: "window",
      url,
      detectedAt: Date.now(),
      handled: false,
    };
    this.popups.push(popup);

    const rule = this.findMatchingRule(popup);
    const action = rule?.action ?? this.defaultRule;

    popup.handled = true;
    popup.resolution = action === "accept" ? "accepted" : "dismissed";

    this.pendingEvents.push({
      type: "popup",
      timestamp: Date.now(),
      message: `New window opened: ${url} (${action})`,
      severity: "info",
      blocking: false,
      data: { popup, action },
    });

    return action;
  }

  /**
   * Called when a browser dialog (alert/confirm/prompt) appears.
   */
  onDialog(
    dialogType: "alert" | "confirm" | "prompt" | "beforeunload",
    message: string,
  ): {
    action: "accept" | "dismiss";
    promptValue?: string;
  } {
    const popup: TrackedPopup = {
      type: "dialog",
      message,
      detectedAt: Date.now(),
      handled: false,
    };
    this.popups.push(popup);

    const rule = this.findMatchingRule(popup);
    const action = rule?.action === "accept" ? "accept" : "dismiss";
    const promptValue = rule?.promptValue;

    popup.handled = true;
    popup.resolution = action === "accept" ? "accepted" : "dismissed";

    this.pendingEvents.push({
      type: "popup",
      timestamp: Date.now(),
      message: `Dialog (${dialogType}): "${message}" -> ${action}`,
      severity: dialogType === "beforeunload" ? "warning" : "info",
      blocking: false,
      data: { popup, dialogType, action },
    });

    return { action, promptValue };
  }

  /**
   * Called when a modal/overlay is detected on the page.
   */
  onModalDetected(description: string): void {
    const popup: TrackedPopup = {
      type: "modal",
      message: description,
      detectedAt: Date.now(),
      handled: false,
    };
    this.popups.push(popup);

    const rule = this.findMatchingRule(popup);

    this.pendingEvents.push({
      type: "popup",
      timestamp: Date.now(),
      message: `Modal detected: ${description}`,
      severity: "info",
      blocking: !rule, // Block if no auto-handle rule
      data: { popup },
      suggestedAction: rule ? `auto_${rule.action}` : "dismiss_modal_or_wait",
    });
  }

  /**
   * Add a custom popup handling rule.
   */
  addRule(rule: PopupRule): void {
    this.rules.unshift(rule); // Higher priority for custom rules
  }

  /**
   * Get all tracked popups.
   */
  getPopups(): TrackedPopup[] {
    return [...this.popups];
  }

  /**
   * Set the default action for unmatched popups.
   */
  setDefault(action: PopupRule["action"]): void {
    this.defaultRule = action;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private findMatchingRule(popup: TrackedPopup): PopupRule | null {
    for (const rule of this.rules) {
      if (rule.match.type && rule.match.type !== popup.type) continue;

      if (rule.match.messagePattern) {
        const text = (popup.message ?? "").toLowerCase();
        if (!text.includes(rule.match.messagePattern.toLowerCase())) continue;
      }

      if (rule.match.urlPattern) {
        const url = (popup.url ?? "").toLowerCase();
        if (!url.includes(rule.match.urlPattern.toLowerCase())) continue;
      }

      return rule;
    }

    return null;
  }
}
