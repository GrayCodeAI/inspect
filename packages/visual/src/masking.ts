// ============================================================================
// @inspect/visual - Element Masking for Visual Comparison
// ============================================================================

import type { BoundingBox } from "@inspect/shared";
import type { RawImage } from "./diff.js";

/** Page-like interface */
interface PageHandle {
  evaluate<R>(fn: string | ((...args: unknown[]) => R), ...args: unknown[]): Promise<R>;
  screenshot(options?: { fullPage?: boolean; type?: string }): Promise<Buffer>;
}

/** Masking options */
export interface MaskOptions {
  /** Color to fill masked regions [R, G, B, A] */
  fillColor?: [number, number, number, number];
  /** Whether to expand the mask by a padding amount */
  padding?: number;
}

/** Default selectors for elements that commonly cause flaky visual diffs */
export const DEFAULT_MASK_SELECTORS = [
  // Timestamps and dates
  "time",
  "[datetime]",
  ".timestamp",
  ".date",
  "[data-testid='timestamp']",
  // Ads
  ".ad",
  ".ads",
  ".advertisement",
  '[id^="google_ads"]',
  '[class*="adsbygoogle"]',
  "iframe[src*='ads']",
  "iframe[src*='doubleclick']",
  // Animations
  "video",
  "canvas",
  ".animation",
  "[data-animated]",
  // Cursors and carets
  ".cursor",
  ".caret",
  // Loading indicators
  ".spinner",
  ".loading",
  ".skeleton",
  "[aria-busy='true']",
  // Live counters
  ".live-count",
  ".visitor-count",
  ".online-count",
  // Chat widgets
  ".intercom-lightweight-app",
  "#hubspot-messages-iframe-container",
  ".drift-widget",
  "[id^='crisp-chatbox']",
];

/**
 * ElementMasking provides utilities to mask dynamic or irrelevant
 * elements before capturing screenshots for visual comparison.
 */
export class ElementMasking {
  /**
   * Capture a screenshot with specified elements hidden via CSS.
   * Elements are hidden using `visibility: hidden` to preserve layout.
   */
  async maskSelectors(
    page: PageHandle,
    selectors: string[],
    options?: { fullPage?: boolean },
  ): Promise<Buffer> {
    const selectorsStr = JSON.stringify(selectors);

    // Hide elements via injected CSS
    await page.evaluate(`
      (function() {
        var style = document.createElement('style');
        style.id = '__inspect_mask_style';
        var selectors = ${selectorsStr};
        style.textContent = selectors.map(function(s) {
          return s + ' { visibility: hidden !important; }';
        }).join('\\n');
        document.head.appendChild(style);
      })()
    `);

    try {
      // Capture screenshot
      const screenshot = await page.screenshot({
        fullPage: options?.fullPage ?? false,
        type: "png",
      });
      return screenshot;
    } finally {
      // Remove the injected style
      await page
        .evaluate(
          `
        (function() {
          var style = document.getElementById('__inspect_mask_style');
          if (style) style.remove();
        })()
      `,
        )
        .catch((err) => console.debug("[Masking] Failed to remove injected style:", err));
    }
  }

  /**
   * Capture a screenshot with default dynamic elements masked.
   */
  async maskDefaults(
    page: PageHandle,
    additionalSelectors: string[] = [],
    options?: { fullPage?: boolean },
  ): Promise<Buffer> {
    const selectors = [...DEFAULT_MASK_SELECTORS, ...additionalSelectors];
    return this.maskSelectors(page, selectors, options);
  }

  /**
   * Draw solid rectangles over specified pixel regions in a raw image.
   * Useful for masking regions that can't be targeted by CSS selectors.
   */
  maskRegions(image: RawImage, regions: BoundingBox[], options: MaskOptions = {}): RawImage {
    const fillColor = options.fillColor ?? [128, 128, 128, 255];
    const padding = options.padding ?? 0;

    // Clone the image data
    const data = new Uint8Array(image.data);

    for (const region of regions) {
      const x1 = Math.max(0, region.x - padding);
      const y1 = Math.max(0, region.y - padding);
      const x2 = Math.min(image.width, region.x + region.width + padding);
      const y2 = Math.min(image.height, region.y + region.height + padding);

      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const offset = (y * image.width + x) * 4;
          data[offset] = fillColor[0];
          data[offset + 1] = fillColor[1];
          data[offset + 2] = fillColor[2];
          data[offset + 3] = fillColor[3];
        }
      }
    }

    return {
      data,
      width: image.width,
      height: image.height,
    };
  }

  /**
   * Get bounding boxes of elements matching selectors.
   * Useful for determining which regions to mask in pixel space.
   */
  async getElementRegions(page: PageHandle, selectors: string[]): Promise<BoundingBox[]> {
    const regions = (await page.evaluate(`
      (function() {
        var selectors = ${JSON.stringify(selectors)};
        var boxes = [];
        selectors.forEach(function(sel) {
          try {
            document.querySelectorAll(sel).forEach(function(el) {
              var rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                boxes.push({
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height)
                });
              }
            });
          } catch(e) {}
        });
        return boxes;
      })()
    `)) as BoundingBox[];

    return regions;
  }
}
