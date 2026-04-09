// ──────────────────────────────────────────────────────────────────────────────
// Consent Banner Watchdog
// Detects and handles cookie/GDPR consent banners
// ──────────────────────────────────────────────────────────────────────────────

import type { Page, Frame } from "playwright";

export interface ConsentBannerConfig {
  /** Auto-accept consent (default: true) */
  autoAccept?: boolean;
  /** Accept only essential cookies (default: false) */
  essentialOnly?: boolean;
  /** Custom selectors for accept button */
  acceptSelectors?: string[];
  /** Custom selectors for reject/decline button */
  rejectSelectors?: string[];
  /** Custom selectors for essential only button */
  essentialSelectors?: string[];
  /** Timeout to wait for banner (ms) */
  timeout?: number;
  /** Check interval (ms) */
  checkInterval?: number;
}

export interface ConsentBannerDetection {
  /** Whether a consent banner was detected */
  detected: boolean;
  /** Type of consent mechanism */
  type: "banner" | "modal" | "popup" | "iframe" | "none";
  /** Frame containing the banner (if in iframe) */
  frame?: Frame;
  /** Element handle for accept button */
  acceptButton?: string;
  /** Element handle for reject button */
  rejectButton?: string;
  /** Element handle for essential only button */
  essentialButton?: string;
  /** Banner text content */
  text?: string;
}

const DEFAULT_CONFIG: ConsentBannerConfig = {
  autoAccept: true,
  essentialOnly: false,
  timeout: 5000,
  checkInterval: 500,
};

/** Default selectors for consent buttons */
const DEFAULT_ACCEPT_SELECTORS = [
  // English
  'button:has-text("Accept")',
  'button:has-text("Accept All")',
  'button:has-text("I Accept")',
  'button:has-text("Agree")',
  'button:has-text("I Agree")',
  'button:has-text("OK")',
  'button:has-text("Got it")',
  'button:has-text("Allow")',
  'button:has-text("Allow All")',
  'button:has-text("Continue")',
  // ARIA labels
  '[aria-label*="Accept"]',
  '[aria-label*="accept cookies"]',
  '[aria-label*="allow cookies"]',
  // Data attributes
  '[data-testid*="accept"]',
  '[data-testid*="cookie"]',
  '[data-cy*="accept"]',
  '[data-qa*="accept"]',
  // Common IDs/classes
  "#accept-cookies",
  "#cookie-accept",
  ".accept-cookies",
  ".cookie-accept",
  "#onetrust-accept-btn-handler",
  "#truste-consent-button",
  ".cc-accept",
  ".cc-compliance a",
  // Specific vendor selectors
  '[data-testid="cookie-banner-accept"]',
  '[data-testid="accept-all"]',
];

const DEFAULT_REJECT_SELECTORS = [
  'button:has-text("Reject")',
  'button:has-text("Decline")',
  'button:has-text("Refuse")',
  'button:has-text("No, thanks")',
  'button:has-text("Necessary only")',
  'button:has-text("Essential only")',
  '[aria-label*="Reject"]',
  '[aria-label*="decline"]',
  '[data-testid*="reject"]',
  '[data-testid*="decline"]',
];

const DEFAULT_ESSENTIAL_SELECTORS = [
  'button:has-text("Essential only")',
  'button:has-text("Necessary only")',
  'button:has-text("Only necessary")',
  'button:has-text("Reject all")',
  'button:has-text("Reject non-essential")',
  'button:has-text("Customize")',
  'button:has-text("Preferences")',
  'button:has-text("Settings")',
  '[data-testid*="essential"]',
  '[data-testid*="necessary"]',
  '[data-testid*="customize"]',
  "#cookie-settings",
  ".cookie-settings",
];

/** Keywords that indicate consent content */
const CONSENT_KEYWORDS = [
  "cookie",
  "cookies",
  "consent",
  "gdpr",
  "privacy",
  "tracking",
  "we use cookies",
  "this site uses cookies",
  "by continuing",
  "privacy policy",
  "accept cookies",
  "cookie policy",
  "cookie banner",
  "cookie notice",
];

/**
 * Consent Banner Watchdog
 */
export class ConsentWatchdog {
  private config: ConsentBannerConfig;
  private page: Page;
  private checkInterval?: NodeJS.Timeout;

  constructor(page: Page, config: ConsentBannerConfig = {}) {
    this.page = page;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start monitoring for consent banners
   */
  start(): void {
    this.checkInterval = setInterval(async () => {
      await this.checkAndHandle();
    }, this.config.checkInterval ?? 1000);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  /**
   * Check for and handle consent banner
   */
  async checkAndHandle(): Promise<ConsentBannerDetection> {
    const detection = await this.detect();

    if (detection.detected && this.config.autoAccept) {
      await this.handle(detection);
    }

    return detection;
  }

  /**
   * Detect consent banner on page
   */
  async detect(): Promise<ConsentBannerDetection> {
    // Check main page
    const mainPageDetection = await this.detectInFrame(this.page);
    if (mainPageDetection.detected) {
      return { ...mainPageDetection, type: "banner" };
    }

    // Check iframes (common for consent management platforms)
    const frames = this.page.frames();
    for (const frame of frames) {
      if (frame === this.page.mainFrame()) continue;

      const frameDetection = await this.detectInFrame(frame);
      if (frameDetection.detected) {
        return { ...frameDetection, type: "iframe", frame };
      }
    }

    return { detected: false, type: "none" };
  }

  /**
   * Detect consent banner in a frame
   */
  private async detectInFrame(frame: Page | Frame): Promise<ConsentBannerDetection> {
    // Check for keywords in page text
    const pageText = await frame
      .evaluate(() => document.body.innerText.toLowerCase())
      .catch(() => "");

    const hasConsentKeywords = CONSENT_KEYWORDS.some((keyword) => pageText.includes(keyword));

    if (!hasConsentKeywords) {
      return { detected: false, type: "none" };
    }

    // Look for accept button
    const acceptSelectors = [...(this.config.acceptSelectors ?? []), ...DEFAULT_ACCEPT_SELECTORS];

    for (const selector of acceptSelectors) {
      try {
        const visible = await frame.locator(selector).isVisible();
        if (visible) {
          return {
            detected: true,
            type: "banner",
            acceptButton: selector,
            text: pageText.slice(0, 200),
          };
        }
      } catch {
        // Continue to next selector
      }
    }

    // Look for essential/reject buttons as fallback
    const essentialSelectors = [
      ...(this.config.essentialSelectors ?? []),
      ...DEFAULT_ESSENTIAL_SELECTORS,
    ];

    for (const selector of essentialSelectors) {
      try {
        const visible = await frame.locator(selector).isVisible();
        if (visible) {
          return {
            detected: true,
            type: "banner",
            essentialButton: selector,
            text: pageText.slice(0, 200),
          };
        }
      } catch {
        // Continue
      }
    }

    return { detected: false, type: "none" };
  }

  /**
   * Handle detected consent banner
   */
  async handle(detection: ConsentBannerDetection): Promise<boolean> {
    if (!detection.detected) return false;

    const frame = detection.frame ?? this.page;

    try {
      if (this.config.essentialOnly && detection.essentialButton) {
        // Click essential only
        await frame.locator(detection.essentialButton).click();
      } else if (detection.acceptButton) {
        // Click accept
        await frame.locator(detection.acceptButton).click();
      } else if (detection.rejectButton) {
        // Click reject
        await frame.locator(detection.rejectButton).click();
      } else {
        return false;
      }

      // Wait for banner to disappear
      await this.page.waitForTimeout(500);
      return true;
    } catch (error) {
      console.error("[ConsentWatchdog] Failed to handle banner:", error);
      return false;
    }
  }

  /**
   * Wait for and handle consent banner
   */
  async waitAndHandle(timeout?: number): Promise<ConsentBannerDetection> {
    const startTime = Date.now();
    const maxTime = timeout ?? this.config.timeout ?? 5000;

    while (Date.now() - startTime < maxTime) {
      const detection = await this.checkAndHandle();
      if (detection.detected) {
        return detection;
      }
      await this.page.waitForTimeout(this.config.checkInterval ?? 500);
    }

    return { detected: false, type: "none" };
  }
}

/** Create consent watchdog */
export function createConsentWatchdog(page: Page, config?: ConsentBannerConfig): ConsentWatchdog {
  return new ConsentWatchdog(page, config);
}
