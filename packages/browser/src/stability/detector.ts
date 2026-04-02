/**
 * Stability Detection - Tasks 291-320
 *
 * Two-phase stability detection: network + visual
 */

import { Effect, Stream, SubscriptionRef } from "effect";
import type { Page } from "playwright";
import { createHash } from "crypto";

/**
 * Network request types to monitor
 */
const RELEVANT_RESOURCE_TYPES = [
  "document",
  "stylesheet",
  "script",
  "image",
  "font",
  "xhr",
  "fetch",
];

const IGNORED_URL_PATTERNS = [
  /analytics/,
  /googletagmanager/,
  /facebook\.com\/tr/,
  /doubleclick/,
  /google-analytics/,
  /hotjar/,
  /intercom/,
  /drift/,
  /crisp/,
  /^wss?:\/\//, // WebSocket
];

/**
 * Task 291: Create stability detector
 */
export class StabilityDetector {
  private networkStable = false;
  private visualStable = false;
  private lastNetworkActivity = Date.now();
  private screenshotHistory: Array<{ timestamp: number; hash: string }> = [];

  constructor(
    private page: Page,
    private options: {
      networkQuietPeriod: number;    // Task 297: 500ms of no activity
      visualCheckInterval: number;   // Task 299: 100ms intervals
      visualStableFrames: number;    // Task 301: 3 consecutive frames
      visualThreshold: number;       // Task 301: 0.01 difference
      maxWaitTime: number;           // Task 303: Max wait time
    } = {
      networkQuietPeriod: 500,
      visualCheckInterval: 100,
      visualStableFrames: 3,
      visualThreshold: 0.01,
      maxWaitTime: 30000,
    }
  ) {}

  /**
   * Task 292-297: Network stability monitoring
   */
  async waitForNetworkStability(): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkStability = () => {
        const elapsed = Date.now() - this.lastNetworkActivity;

        // Task 297: Wait for 500ms of no relevant activity
        if (elapsed >= this.options.networkQuietPeriod) {
          this.networkStable = true;
          resolve(true);
          return;
        }

        // Task 303: Stability timeout
        if (Date.now() - startTime > this.options.maxWaitTime) {
          resolve(false);
          return;
        }

        setTimeout(checkStability, 50);
      };

      // Set up network monitoring
      this.page.on("request", (request) => {
        if (this.isRelevantRequest(request)) {
          this.lastNetworkActivity = Date.now();
          this.networkStable = false;
        }
      });

      this.page.on("response", () => {
        this.lastNetworkActivity = Date.now();
      });

      checkStability();
    });
  }

  /**
   * Task 293: Check if request is relevant
   * Task 294-296: Filter out analytics, ads, WebSocket
   */
  private isRelevantRequest(request: { resourceType(): string; url(): string }): boolean {
    const resourceType = request.resourceType();
    const url = request.url();

    // Check resource type
    if (!RELEVANT_RESOURCE_TYPES.includes(resourceType)) {
      return false;
    }

    // Task 294-296: Filter out analytics, ads, WebSocket
    for (const pattern of IGNORED_URL_PATTERNS) {
      if (pattern.test(url)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Task 298-301: Visual stability detection
   */
  async waitForVisualStability(): Promise<boolean> {
    const startTime = Date.now();

    while (true) {
      // Task 303: Check timeout
      if (Date.now() - startTime > this.options.maxWaitTime) {
        return false;
      }

      // Task 299: Take screenshot at intervals
      const screenshot = await this.page.screenshot({
        type: "jpeg",
        quality: 50,
        fullPage: false,
      });

      // Task 300: Compute hash (simplified - would use pixel diff with sharp)
      const hash = createHash("md5").update(screenshot).digest("hex");

      this.screenshotHistory.push({
        timestamp: Date.now(),
        hash,
      });

      // Keep only recent history
      const cutoff = Date.now() - (this.options.visualCheckInterval * 5);
      this.screenshotHistory = this.screenshotHistory.filter(
        (s) => s.timestamp > cutoff
      );

      // Task 301: Check for 3 consecutive stable frames
      if (this.screenshotHistory.length >= this.options.visualStableFrames) {
        const recent = this.screenshotHistory.slice(-this.options.visualStableFrames);
        const allSame = recent.every((s) => s.hash === recent[0].hash);

        if (allSame) {
          this.visualStable = true;
          return true;
        }
      }

      // Task 299: Wait for next interval
      await new Promise((r) => setTimeout(r, this.options.visualCheckInterval));
    }
  }

  /**
   * Task 302: Combined stability check
   */
  async waitForStability(): Promise<{ network: boolean; visual: boolean }> {
    const [network, visual] = await Promise.all([
      this.waitForNetworkStability(),
      this.waitForVisualStability(),
    ]);

    return { network, visual };
  }

  /**
   * Task 304: Emit stability events
   */
  onStability(callback: (state: { network: boolean; visual: boolean }) => void): void {
    const checkInterval = setInterval(() => {
      callback({ network: this.networkStable, visual: this.visualStable });

      if (this.networkStable && this.visualStable) {
        clearInterval(checkInterval);
      }
    }, 100);
  }
}

/**
 * Task 305-312: Tab manager
 */
export class TabManager {
  private tabActivity = new Map<string, number>();
  private activeTab: string | null = null;

  constructor(private pages: Page[]) {
    this.setupTracking();
  }

  private setupTracking(): void {
    for (const page of this.pages) {
      // Task 307: Inject __tabActivityTime
      page.evaluate(() => {
        (window as unknown as { __tabActivityTime: number }).__tabActivityTime = Date.now();

        document.addEventListener("click", () => {
          (window as unknown as { __tabActivityTime: number }).__tabActivityTime = Date.now();
        });

        document.addEventListener("keydown", () => {
          (window as unknown as { __tabActivityTime: number }).__tabActivityTime = Date.now();
        });

        document.addEventListener("scroll", () => {
          (window as unknown as { __tabActivityTime: number }).__tabActivityTime = Date.now();
        });
      });
    }

    // Task 308: Poll activity every 200ms
    setInterval(() => this.pollActivity(), 200);
  }

  private async pollActivity(): Promise<void> {
    for (const page of this.pages) {
      try {
        const lastActivity = await page.evaluate(
          () => (window as unknown as { __tabActivityTime?: number }).__tabActivityTime || 0
        );
        this.tabActivity.set(page.url(), lastActivity);
      } catch {
        // Page may be closed
      }
    }
  }

  /**
   * Task 309: Auto-switch to most recently active tab
   */
  getMostActiveTab(): Page | null {
    let mostRecent: { url: string; time: number } | null = null;

    for (const [url, time] of this.tabActivity) {
      if (!mostRecent || time > mostRecent.time) {
        mostRecent = { url, time };
      }
    }

    if (mostRecent) {
      return this.pages.find((p) => p.url() === mostRecent!.url) || null;
    }

    return null;
  }

  /**
   * Task 310-311: Track tab events
   */
  onTabCreated(page: Page): void {
    this.pages.push(page);
    this.tabActivity.set(page.url(), Date.now());
  }

  onTabClosed(page: Page): void {
    this.pages = this.pages.filter((p) => p !== page);
    this.tabActivity.delete(page.url());
  }
}
