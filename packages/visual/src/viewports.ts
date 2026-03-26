// ============================================================================
// @inspect/visual - Multi-Viewport Capture
// ============================================================================

import type { ViewportConfig } from "@inspect/shared";
import { sleep } from "@inspect/shared";

/** Page-like interface */
interface PageHandle {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  screenshot(options?: { fullPage?: boolean; type?: string }): Promise<Buffer>;
  waitForLoadState(state?: string): Promise<void>;
  evaluate<R>(fn: string | ((...args: unknown[]) => R), ...args: unknown[]): Promise<R>;
}

/** Viewport with label */
export interface LabeledViewport extends ViewportConfig {
  /** Human-readable label for this viewport */
  label: string;
}

/** Viewport capture options */
export interface ViewportCaptureOptions {
  /** Wait for this time after viewport change before capturing */
  stabilizeDelay?: number;
  /** Full page screenshot */
  fullPage?: boolean;
  /** Navigation timeout */
  timeout?: number;
  /** Wait until state */
  waitUntil?: string;
  /** CSS selectors to hide before capture */
  hideSelectors?: string[];
  /** Custom JavaScript to run before each capture */
  beforeCapture?: string;
}

/** Common viewport presets */
export const VIEWPORT_PRESETS: Record<string, LabeledViewport> = {
  "mobile-s": { label: "Mobile S (320)", width: 320, height: 568 },
  "mobile-m": { label: "Mobile M (375)", width: 375, height: 667 },
  "mobile-l": { label: "Mobile L (425)", width: 425, height: 812 },
  tablet: { label: "Tablet (768)", width: 768, height: 1024 },
  "tablet-landscape": { label: "Tablet Landscape (1024)", width: 1024, height: 768 },
  laptop: { label: "Laptop (1366)", width: 1366, height: 768 },
  desktop: { label: "Desktop (1920)", width: 1920, height: 1080 },
  "desktop-l": { label: "Desktop L (2560)", width: 2560, height: 1440 },
  "4k": { label: "4K (3840)", width: 3840, height: 2160 },
};

/** Preset collections */
export const VIEWPORT_COLLECTIONS = {
  /** Mobile-first responsive breakpoints */
  responsive: ["mobile-s", "mobile-m", "mobile-l", "tablet", "laptop", "desktop"],
  /** All common sizes */
  all: Object.keys(VIEWPORT_PRESETS),
  /** Just mobile sizes */
  mobile: ["mobile-s", "mobile-m", "mobile-l"],
  /** Desktop sizes */
  desktopOnly: ["laptop", "desktop", "desktop-l"],
  /** Common breakpoints (Bootstrap-style) */
  breakpoints: ["mobile-m", "tablet", "laptop", "desktop"],
} as const;

/**
 * ViewportCapture captures screenshots of a page at multiple viewport sizes
 * for responsive testing and visual regression.
 */
export class ViewportCapture {
  /**
   * Capture screenshots of a URL at multiple viewport sizes.
   *
   * @param page - Playwright page instance
   * @param url - URL to navigate to
   * @param viewports - Array of labeled viewports to capture at
   * @param options - Capture options
   * @returns Map of viewport label to screenshot buffer
   */
  async captureAtViewports(
    page: PageHandle,
    url: string,
    viewports: LabeledViewport[],
    options: ViewportCaptureOptions = {},
  ): Promise<Map<string, Buffer>> {
    const stabilizeDelay = options.stabilizeDelay ?? 300;
    const fullPage = options.fullPage ?? false;
    const timeout = options.timeout ?? 30_000;
    const results = new Map<string, Buffer>();

    // Navigate to the URL first
    await page.goto(url, { waitUntil: options.waitUntil ?? "networkidle", timeout });
    await page.waitForLoadState("networkidle");

    for (const viewport of viewports) {
      // Set viewport
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // Wait for layout to settle
      if (stabilizeDelay > 0) {
        await sleep(stabilizeDelay);
      }

      // Wait for any responsive JavaScript to trigger
      await page.evaluate(`
        new Promise(function(resolve) {
          requestAnimationFrame(function() {
            requestAnimationFrame(resolve);
          });
        })
      `);

      // Hide elements if requested
      if (options.hideSelectors?.length) {
        const selectorsStr = JSON.stringify(options.hideSelectors);
        await page.evaluate(`
          (function() {
            var selectors = ${selectorsStr};
            selectors.forEach(function(sel) {
              document.querySelectorAll(sel).forEach(function(el) {
                el.style.visibility = 'hidden';
              });
            });
          })()
        `);
      }

      // Run custom JavaScript
      if (options.beforeCapture) {
        await page.evaluate(options.beforeCapture);
      }

      // Capture screenshot
      const screenshot = await page.screenshot({ fullPage, type: "png" });
      results.set(viewport.label, screenshot);

      // Restore hidden elements
      if (options.hideSelectors?.length) {
        const selectorsStr = JSON.stringify(options.hideSelectors);
        await page.evaluate(`
          (function() {
            var selectors = ${selectorsStr};
            selectors.forEach(function(sel) {
              document.querySelectorAll(sel).forEach(function(el) {
                el.style.visibility = '';
              });
            });
          })()
        `);
      }
    }

    return results;
  }

  /**
   * Capture using preset viewport collection names.
   */
  async captureCollection(
    page: PageHandle,
    url: string,
    collection: keyof typeof VIEWPORT_COLLECTIONS,
    options: ViewportCaptureOptions = {},
  ): Promise<Map<string, Buffer>> {
    const presetNames = VIEWPORT_COLLECTIONS[collection];
    const viewports = presetNames
      .map((name) => VIEWPORT_PRESETS[name])
      .filter((v): v is LabeledViewport => v !== undefined);

    return this.captureAtViewports(page, url, viewports, options);
  }

  /**
   * Capture at all standard responsive breakpoints.
   */
  async captureResponsive(
    page: PageHandle,
    url: string,
    options: ViewportCaptureOptions = {},
  ): Promise<Map<string, Buffer>> {
    return this.captureCollection(page, url, "responsive", options);
  }

  /**
   * Capture at custom width breakpoints with auto-generated labels.
   */
  async captureAtWidths(
    page: PageHandle,
    url: string,
    widths: number[],
    options: ViewportCaptureOptions & { height?: number } = {},
  ): Promise<Map<string, Buffer>> {
    const height = options.height ?? 900;
    const viewports: LabeledViewport[] = widths.map((w) => ({
      label: `${w}px`,
      width: w,
      height,
    }));

    return this.captureAtViewports(page, url, viewports, options);
  }
}
