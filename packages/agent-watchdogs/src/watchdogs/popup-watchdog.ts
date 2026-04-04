/**
 * Popup Watchdog
 *
 * Detects and handles popups, modals, cookie consents, and overlays.
 */

import type { Page, Dialog } from "playwright";

export interface PopupConfig {
  /** Auto-dismiss cookie consents */
  autoDismissCookies: boolean;
  /** Auto-dismiss newsletter signups */
  autoDismissNewsletters: boolean;
  /** Auto-dismiss promotional modals */
  autoDismissPromotions: boolean;
  /** Auto-accept necessary cookies only */
  cookiePreference: "accept-all" | "necessary-only" | "reject-all" | "manual";
  /** Handle JavaScript dialogs */
  handleDialogs: boolean;
  /** Custom dismiss selectors */
  customDismissSelectors: string[];
  /** Callback when popup detected */
  onPopupDetected?: (type: PopupType, description: string) => void;
  /** Callback when popup handled */
  onPopupHandled?: (type: PopupType, action: string) => void;
}

export type PopupType =
  | "cookie-consent"
  | "newsletter"
  | "promotional"
  | "chat-widget"
  | "feedback"
  | "login"
  | "age-verification"
  | "location"
  | "notification"
  | "survey"
  | "js-alert"
  | "js-confirm"
  | "js-prompt"
  | "overlay"
  | "modal"
  | "unknown";

export interface PopupDetection {
  type: PopupType;
  confidence: number;
  selector?: string;
  text?: string;
  dismissSelector?: string;
  acceptSelector?: string;
}

export class PopupWatchdog {
  private config: PopupConfig;
  private isRunning = false;
  private checkInterval?: NodeJS.Timeout;
  private handledPopups = new Set<string>();
  private dialogHandler?: (dialog: Dialog) => void;

  constructor(config: Partial<PopupConfig> = {}) {
    this.config = {
      autoDismissCookies: true,
      autoDismissNewsletters: true,
      autoDismissPromotions: true,
      cookiePreference: "necessary-only",
      handleDialogs: true,
      customDismissSelectors: [],
      ...config,
    };
  }

  /**
   * Start monitoring for popups
   */
  start(page: Page): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Handle JavaScript dialogs
    if (this.config.handleDialogs) {
      this.dialogHandler = (dialog: Dialog) => {
        this.handleDialog(dialog);
      };
      page.on("dialog", this.dialogHandler);
    }

    // Check periodically for DOM-based popups
    this.checkInterval = setInterval(async () => {
      try {
        const popups = await this.detect(page);
        for (const popup of popups) {
          const popupKey = `${popup.type}-${popup.selector}`;
          if (this.handledPopups.has(popupKey)) continue;

          this.config.onPopupDetected?.(popup.type, popup.text || "");
          const handled = await this.handle(page, popup);

          if (handled) {
            this.handledPopups.add(popupKey);
            this.config.onPopupHandled?.(popup.type, "dismissed");
          }
        }
      } catch {
        // Ignore errors
      }
    }, 1000);
  }

  /**
   * Stop monitoring
   */
  stop(page: Page): void {
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    if (this.dialogHandler) {
      page.off("dialog", this.dialogHandler);
      this.dialogHandler = undefined;
    }
  }

  /**
   * Detect popups on page
   */
  async detect(page: Page): Promise<PopupDetection[]> {
    return page.evaluate((_config) => {
      // Helper functions defined inside evaluate (browser context)
      const _isVisible = (el: Element): boolean => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          style.opacity !== "0"
        );
      };

      const _findDismissButton = (el: Element): string | null => {
        const dismissSelectors = [
          'button[aria-label*="close" i]',
          'button[aria-label*="dismiss" i]',
          'button[class*="close" i]',
          'button[class*="dismiss" i]',
          '[data-testid="close-button"]',
          '[data-testid="dismiss-button"]',
          '[data-dismiss="modal"]',
          ".close",
          ".btn-close",
        ];
        for (const sel of dismissSelectors) {
          if (el.querySelector(sel)) return sel;
        }
        return null;
      };

      const _findAcceptButton = (el: Element): string | null => {
        const acceptSelectors = [
          'button:has-text("Accept")',
          'button:has-text("Allow")',
          'button:has-text("Agree")',
          'button:has-text("OK")',
          '[data-testid="accept-button"]',
        ];
        for (const sel of acceptSelectors) {
          if (el.querySelector(sel)) return sel;
        }
        return null;
      };

      const popups: Array<{
        type: PopupType;
        confidence: number;
        selector?: string;
        text?: string;
        dismissSelector?: string;
        acceptSelector?: string;
      }> = [];

      // Cookie consent selectors
      const cookieSelectors = [
        '[data-testid="cookie-banner"]',
        '[data-testid="cookie-consent"]',
        '[id*="cookie-banner" i]',
        '[id*="cookie-consent" i]',
        '[class*="cookie-banner" i]',
        '[class*="cookie-consent" i]',
        '[id*="cookieNotice" i]',
        '[class*="cookie-notice" i]',
        '[aria-label*="cookie" i]',
        "#onetrust-banner-sdk",
        "#CybotCookiebotDialog",
        ".cc-window",
        ".cookiealert",
        '[data-cy="cookie-banner"]',
      ];

      for (const selector of cookieSelectors) {
        const element = document.querySelector(selector);
        if (element && _isVisible(element)) {
          popups.push({
            type: "cookie-consent",
            confidence: 0.95,
            selector,
            text: element.textContent?.slice(0, 100),
            dismissSelector: _findDismissButton(element) || undefined,
            acceptSelector: _findAcceptButton(element) || undefined,
          });
          break; // Only detect one cookie banner
        }
      }

      // Newsletter signup selectors
      const newsletterSelectors = [
        '[data-testid="newsletter"]',
        '[id*="newsletter" i]',
        '[class*="newsletter" i]',
        '[id*="signup" i][class*="modal" i]',
        'form[action*="newsletter"]',
        '[aria-label*="newsletter" i]',
        '.modal:has(input[type="email"])',
      ];

      for (const selector of newsletterSelectors) {
        const element = document.querySelector(selector);
        if (element && _isVisible(element) && !element.closest(cookieSelectors.join(","))) {
          popups.push({
            type: "newsletter",
            confidence: 0.85,
            selector,
            text: element.textContent?.slice(0, 100),
            dismissSelector: _findDismissButton(element) || undefined,
          });
          break;
        }
      }

      // Promotional modal selectors
      const promoSelectors = [
        '[data-testid="promo-modal"]',
        '[id*="promo" i][class*="modal" i]',
        '[class*="promotional" i]',
        '[class*="sale-banner" i]',
        '.modal:has([class*="discount"])',
        '.modal:has([class*="offer"])',
      ];

      for (const selector of promoSelectors) {
        const element = document.querySelector(selector);
        if (element && _isVisible(element)) {
          popups.push({
            type: "promotional",
            confidence: 0.8,
            selector,
            text: element.textContent?.slice(0, 100),
            dismissSelector: _findDismissButton(element) || undefined,
          });
          break;
        }
      }

      // Chat widget selectors
      const chatSelectors = [
        '[data-testid="chat-widget"]',
        '[id*="chat-widget" i]',
        '[class*="chat-widget" i]',
        'iframe[id*="zopim"]', // Zendesk
        'iframe[id*="intercom"]', // Intercom
        ".drift-widget",
        '[data-testid="messenger-button"]',
      ];

      for (const selector of chatSelectors) {
        const element = document.querySelector(selector);
        if (element && _isVisible(element)) {
          popups.push({
            type: "chat-widget",
            confidence: 0.9,
            selector,
            dismissSelector: _findDismissButton(element) || undefined,
          });
          break;
        }
      }

      // Generic modal detection
      const modalSelectors = [
        '[role="dialog"]:not([aria-modal="false"])',
        '[role="alertdialog"]',
        ".modal.show",
        ".modal.active",
        ".modal-open",
        '[data-modal="true"]',
      ];

      for (const selector of modalSelectors) {
        const element = document.querySelector(selector);
        if (element && _isVisible(element)) {
          // Check if already categorized
          const alreadyCategorized = popups.some(
            (p) =>
              element.matches(p.selector || "") ||
              element.contains(document.querySelector(p.selector || "")),
          );
          if (!alreadyCategorized) {
            popups.push({
              type: "modal",
              confidence: 0.7,
              selector,
              text: element.textContent?.slice(0, 100),
              dismissSelector: _findDismissButton(element) || undefined,
            });
          }
        }
      }

      return popups;
    }, this.config);
  }

  /**
   * Handle detected popup
   */
  private async handle(page: Page, popup: PopupDetection): Promise<boolean> {
    switch (popup.type) {
      case "cookie-consent":
        if (this.config.autoDismissCookies) {
          return this.handleCookieConsent(page, popup);
        }
        break;
      case "newsletter":
        if (this.config.autoDismissNewsletters) {
          return this.dismissPopup(page, popup);
        }
        break;
      case "promotional":
      case "chat-widget":
        if (this.config.autoDismissPromotions) {
          return this.dismissPopup(page, popup);
        }
        break;
      default:
        return this.dismissPopup(page, popup);
    }
    return false;
  }

  /**
   * Handle cookie consent based on preference
   */
  private async handleCookieConsent(page: Page, popup: PopupDetection): Promise<boolean> {
    if (!popup.selector) return false;

    try {
      switch (this.config.cookiePreference) {
        case "accept-all":
          if (popup.acceptSelector) {
            await page.click(`${popup.selector} ${popup.acceptSelector}`);
            return true;
          }
          break;
        case "necessary-only": {
          // Look for "necessary only" or "reject all" button
          const necessarySelectors = [
            'button:has-text("Necessary only")',
            'button:has-text("Reject all")',
            'button:has-text("Decline")',
            'button:has-text("Only necessary")',
          ];
          for (const selector of necessarySelectors) {
            const fullSelector = `${popup.selector} ${selector}`;
            if (await page.isVisible(fullSelector).catch(() => false)) {
              await page.click(fullSelector);
              return true;
            }
          }
          // Fall back to dismiss
          return this.dismissPopup(page, popup);
        }
        case "reject-all": {
          // Look for reject button
          const rejectSelectors = [
            'button:has-text("Reject all")',
            'button:has-text("Decline")',
            'button:has-text("No")',
          ];
          for (const selector of rejectSelectors) {
            const fullSelector = `${popup.selector} ${selector}`;
            if (await page.isVisible(fullSelector).catch(() => false)) {
              await page.click(fullSelector);
              return true;
            }
          }
          return this.dismissPopup(page, popup);
        }
        case "manual":
          return false;
      }
    } catch {
      return false;
    }
    return false;
  }

  /**
   * Dismiss popup by clicking dismiss button
   */
  private async dismissPopup(page: Page, popup: PopupDetection): Promise<boolean> {
    if (!popup.selector || !popup.dismissSelector) return false;

    try {
      const fullSelector = `${popup.selector} ${popup.dismissSelector}`;
      await page.click(fullSelector);
      return true;
    } catch {
      // Try pressing Escape
      try {
        await page.keyboard.press("Escape");
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Handle JavaScript dialog
   */
  private async handleDialog(dialog: Dialog): Promise<void> {
    const message = dialog.message();
    const type = dialog.type();

    this.config.onPopupDetected?.(type as PopupType, message);

    switch (type) {
      case "alert":
        await dialog.accept();
        break;
      case "confirm":
        // Default to OK for confirms unless it's a warning
        if (message.toLowerCase().includes("leave") || message.toLowerCase().includes("delete")) {
          await dialog.dismiss();
        } else {
          await dialog.accept();
        }
        break;
      case "prompt":
        // Dismiss prompts by default
        await dialog.dismiss();
        break;
    }

    this.config.onPopupHandled?.(type as PopupType, "handled");
  }

  /**
   * Clear handled popup cache
   */
  clearCache(): void {
    this.handledPopups.clear();
  }
}
