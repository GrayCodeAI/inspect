// ──────────────────────────────────────────────────────────────────────────────
// ScreenshotCapture - Screenshot capture with annotation support
// ──────────────────────────────────────────────────────────────────────────────

import type { Page } from "playwright";
import type { ElementSnapshot, BoundingBox } from "@inspect/shared";

/** Annotation label placed on a screenshot */
interface AnnotationLabel {
  /** The reference ID (e.g. "e5") or numeric label */
  label: string;
  /** Bounding box to draw around the element */
  bounds: BoundingBox;
  /** Color for the annotation border/label */
  color: string;
}

/**
 * Captures screenshots with optional element annotation overlays.
 * Supports viewport, full-page, and element-specific captures.
 */
export class ScreenshotCapture {
  /** Color palette for element annotations */
  private static readonly COLORS = [
    "#FF0000", "#00FF00", "#0000FF", "#FF00FF", "#FFFF00", "#00FFFF",
    "#FF8800", "#8800FF", "#00FF88", "#FF0088", "#88FF00", "#0088FF",
  ];

  /**
   * Capture a PNG screenshot of the current viewport.
   */
  async capture(
    page: Page,
    options: { fullPage?: boolean; path?: string; quality?: number; type?: "png" | "jpeg" } = {},
  ): Promise<Buffer> {
    return page.screenshot({
      fullPage: options.fullPage ?? false,
      path: options.path,
      type: options.type ?? "png",
      quality: options.type === "jpeg" ? options.quality : undefined,
    }) as Promise<Buffer>;
  }

  /**
   * Capture a full-page screenshot (scrolls the entire page).
   */
  async captureFullPage(page: Page, path?: string): Promise<Buffer> {
    return page.screenshot({ fullPage: true, path, type: "png" }) as Promise<Buffer>;
  }

  /**
   * Capture a screenshot of a specific element.
   */
  async captureElement(page: Page, selector: string, path?: string): Promise<Buffer> {
    const element = page.locator(selector);
    return element.screenshot({ path, type: "png" }) as Promise<Buffer>;
  }

  /**
   * Capture a screenshot with numbered annotation labels overlaid on elements.
   * Injects a temporary overlay into the page, takes the screenshot, then removes it.
   *
   * @param page - The Playwright page
   * @param elements - Elements to annotate (must have bounds)
   * @returns Annotated screenshot buffer
   */
  async annotate(page: Page, elements: ElementSnapshot[]): Promise<Buffer> {
    // Filter elements that have bounding boxes
    const annotatable = elements.filter((e) => e.bounds && e.bounds.width > 0 && e.bounds.height > 0);

    // Inject annotation overlay
    await page.evaluate((annotations: AnnotationLabel[]) => {
      const overlay = document.createElement("div");
      overlay.id = "__inspect_annotations__";
      overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999999;";

      for (const ann of annotations) {
        // Border box around element
        const box = document.createElement("div");
        box.style.cssText = `
          position: fixed;
          left: ${ann.bounds.x}px;
          top: ${ann.bounds.y}px;
          width: ${ann.bounds.width}px;
          height: ${ann.bounds.height}px;
          border: 2px solid ${ann.color};
          pointer-events: none;
          box-sizing: border-box;
        `;

        // Label badge
        const badge = document.createElement("div");
        badge.textContent = ann.label;
        badge.style.cssText = `
          position: absolute;
          top: -18px;
          left: -2px;
          background: ${ann.color};
          color: white;
          font-size: 11px;
          font-family: monospace;
          font-weight: bold;
          padding: 1px 4px;
          border-radius: 2px;
          line-height: 14px;
          white-space: nowrap;
        `;
        box.appendChild(badge);
        overlay.appendChild(box);
      }

      document.body.appendChild(overlay);
    }, this.buildAnnotationLabels(annotatable));

    // Capture screenshot with annotations
    const screenshot = await page.screenshot({ type: "png" }) as Buffer;

    // Remove annotation overlay
    await page.evaluate(() => {
      const overlay = document.getElementById("__inspect_annotations__");
      overlay?.remove();
    });

    return screenshot;
  }

  /**
   * Convert a screenshot buffer to a base64 string.
   */
  toBase64(buffer: Buffer): string {
    return buffer.toString("base64");
  }

  /**
   * Convert a screenshot buffer to a data URI.
   */
  toDataURI(buffer: Buffer, type: "png" | "jpeg" = "png"): string {
    return `data:image/${type};base64,${this.toBase64(buffer)}`;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildAnnotationLabels(elements: ElementSnapshot[]): AnnotationLabel[] {
    return elements.map((el, i) => ({
      label: el.ref,
      bounds: el.bounds,
      color: ScreenshotCapture.COLORS[i % ScreenshotCapture.COLORS.length],
    }));
  }
}
