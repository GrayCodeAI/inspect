/**
 * Two-Phase Stability Detector
 *
 * Waits for both network stability AND visual stability before agent acts.
 * Inspired by browser-use and Playwright's auto-waiting.
 */

import type { Page } from "playwright";

export interface StabilityConfig {
  /** Wait for network idle */
  waitForNetwork: boolean;
  /** Network idle timeout (ms) */
  networkTimeout: number;
  /** Network idle duration (ms of no requests) */
  networkIdleDuration: number;
  /** Wait for visual stability */
  waitForVisual: boolean;
  /** Visual stability timeout (ms) */
  visualTimeout: number;
  /** Number of consecutive stable frames required */
  stableFramesRequired: number;
  /** Screenshot interval (ms) */
  screenshotInterval: number;
  /** Pixel diff threshold (0-1) */
  pixelDiffThreshold: number;
  /** Callback on stability reached */
  onStable?: (metrics: StabilityMetrics) => void;
  /** Callback on timeout */
  onTimeout?: (phase: string) => void;
}

export interface StabilityMetrics {
  /** Time to network stability */
  networkStableTime?: number;
  /** Time to visual stability */
  visualStableTime?: number;
  /** Total stability time */
  totalStableTime: number;
  /** Network requests during wait */
  networkRequests: number;
  /** Screenshots taken */
  screenshotsTaken: number;
  /** Consecutive stable frames */
  stableFrames: number;
}

export interface NetworkStats {
  activeRequests: number;
  completedRequests: number;
  failedRequests: number;
}

export const DEFAULT_STABILITY_CONFIG: StabilityConfig = {
  waitForNetwork: true,
  networkTimeout: 30000,
  networkIdleDuration: 500,
  waitForVisual: true,
  visualTimeout: 30000,
  stableFramesRequired: 3,
  screenshotInterval: 100,
  pixelDiffThreshold: 0.01,
};

/**
 * Two-Phase Stability Detector
 *
 * Phase 1: Network stability - wait for no active requests
 * Phase 2: Visual stability - wait for no visual changes
 */
export class StabilityDetector {
  private config: StabilityConfig;
  private networkIdleTimer?: NodeJS.Timeout;
  private visualCheckTimer?: NodeJS.Timeout;
  private networkStats: NetworkStats = {
    activeRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
  };

  constructor(config: Partial<StabilityConfig> = {}) {
    this.config = { ...DEFAULT_STABILITY_CONFIG, ...config };
  }

  /**
   * Wait for full stability (both network and visual)
   */
  async waitForStable(page: Page): Promise<StabilityMetrics> {
    const startTime = Date.now();
    const metrics: StabilityMetrics = {
      totalStableTime: 0,
      networkRequests: 0,
      screenshotsTaken: 0,
      stableFrames: 0,
    };

    // Phase 1: Network stability
    if (this.config.waitForNetwork) {
      const networkStart = Date.now();
      const networkStable = await this.waitForNetworkIdle(page);

      if (networkStable) {
        metrics.networkStableTime = Date.now() - networkStart;
        this.config.onStable?.({ ...metrics, networkStableTime: metrics.networkStableTime });
      } else {
        this.config.onTimeout?.("network");
      }
    }

    // Phase 2: Visual stability
    if (this.config.waitForVisual) {
      const visualStart = Date.now();
      const visualMetrics = await this.waitForVisualStability(page);

      if (visualMetrics.stable) {
        metrics.visualStableTime = Date.now() - visualStart;
        metrics.screenshotsTaken = visualMetrics.screenshotsTaken;
        metrics.stableFrames = visualMetrics.stableFrames;
      } else {
        this.config.onTimeout?.("visual");
      }
    }

    metrics.totalStableTime = Date.now() - startTime;
    return metrics;
  }

  /**
   * Phase 1: Wait for network idle
   */
  private async waitForNetworkIdle(page: Page): Promise<boolean> {
    return new Promise((resolve) => {
      let lastActivity = Date.now();
      let resolved = false;

      // Set timeout
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, this.config.networkTimeout);

      // Monitor network activity
      const checkInterval = setInterval(() => {
        if (resolved) {
          clearInterval(checkInterval);
          return;
        }

        // Check if network is idle
        if (this.networkStats.activeRequests === 0) {
          const idleTime = Date.now() - lastActivity;

          if (idleTime >= this.config.networkIdleDuration) {
            clearTimeout(timeout);
            clearInterval(checkInterval);
            resolved = true;
            resolve(true);
          }
        } else {
          lastActivity = Date.now();
        }
      }, 50);

      // Start monitoring
      this.startNetworkMonitoring(page);
    });
  }

  /**
   * Start monitoring network requests
   */
  private startNetworkMonitoring(page: Page): void {
    // Monitor requests
    page.on("request", () => {
      this.networkStats.activeRequests++;
      this.networkStats.completedRequests++;
    });

    page.on("requestfinished", () => {
      this.networkStats.activeRequests--;
    });

    page.on("requestfailed", () => {
      this.networkStats.activeRequests--;
      this.networkStats.failedRequests++;
    });
  }

  /**
   * Phase 2: Wait for visual stability
   */
  private async waitForVisualStability(
    page: Page
  ): Promise<{ stable: boolean; screenshotsTaken: number; stableFrames: number }> {
    const startTime = Date.now();
    let previousScreenshot: Buffer | null = null;
    let stableFrames = 0;
    let screenshotsTaken = 0;

    while (Date.now() - startTime < this.config.visualTimeout) {
      // Take screenshot
      const currentScreenshot = await page.screenshot();
      screenshotsTaken++;

      // Compare with previous
      if (previousScreenshot) {
        const diff = this.calculatePixelDiff(previousScreenshot, currentScreenshot);

        if (diff < this.config.pixelDiffThreshold) {
          stableFrames++;

          if (stableFrames >= this.config.stableFramesRequired) {
            return { stable: true, screenshotsTaken, stableFrames };
          }
        } else {
          stableFrames = 0;
        }
      }

      previousScreenshot = currentScreenshot;

      // Wait before next screenshot
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.screenshotInterval)
      );
    }

    return { stable: false, screenshotsTaken, stableFrames };
  }

  /**
   * Calculate pixel difference between two screenshots
   */
  private calculatePixelDiff(img1: Buffer, img2: Buffer): number {
    // Simple byte comparison
    // In production, use sharp or pixelmatch
    let diffPixels = 0;
    const minLength = Math.min(img1.length, img2.length);

    for (let i = 0; i < minLength; i += 4) {
      const rDiff = Math.abs(img1[i] - img2[i]);
      const gDiff = Math.abs(img1[i + 1] - img2[i + 1]);
      const bDiff = Math.abs(img1[i + 2] - img2[i + 2]);

      if (rDiff + gDiff + bDiff > 30) {
        diffPixels++;
      }
    }

    return diffPixels / (minLength / 4);
  }

  /**
   * Quick check - is page stable?
   */
  async isStable(page: Page): Promise<boolean> {
    const metrics = await this.waitForStable(page);
    return metrics.totalStableTime < this.config.networkTimeout;
  }

  /**
   * Get network stats
   */
  getNetworkStats(): NetworkStats {
    return { ...this.networkStats };
  }

  /**
   * Reset stats
   */
  reset(): void {
    this.networkStats = {
      activeRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
    };
  }
}

/**
 * Convenience function
 */
export async function waitForStable(
  page: Page,
  config?: Partial<StabilityConfig>
): Promise<StabilityMetrics> {
  const detector = new StabilityDetector(config);
  return detector.waitForStable(page);
}
