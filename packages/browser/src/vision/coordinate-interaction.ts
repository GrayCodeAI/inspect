/**
 * Coordinate-Based Interaction Module
 *
 * Enables Computer Use API (CUA) mode for vision-first interaction.
 * Maps LLM coordinates to Playwright actions with DPR and iframe handling.
 *
 * OSS Pattern: Coordinate-Based Grounding (browser-use, Shortest)
 */

import type { Page, ElementHandle } from "playwright";

export interface CoordinateConfig {
  /** Device Pixel Ratio for scaling */
  devicePixelRatio: number;
  /** Coordinate system origin */
  origin: "viewport" | "page" | "screen";
  /** Whether to handle iframe offsets */
  handleIframes: boolean;
  /** Scroll handling strategy */
  scrollStrategy: "none" | "center" | "smooth";
  /** Coordinate precision */
  precision: number;
}

export const DEFAULT_COORDINATE_CONFIG: CoordinateConfig = {
  devicePixelRatio: 1,
  origin: "viewport",
  handleIframes: true,
  scrollStrategy: "center",
  precision: 1,
};

export interface NormalizedCoordinate {
  /** Normalized X (0-1 relative to viewport) */
  x: number;
  /** Normalized Y (0-1 relative to viewport) */
  y: number;
  /** Absolute pixel X */
  absoluteX: number;
  /** Absolute pixel Y */
  absoluteY: number;
}

export interface CoordinateMapping {
  /** Original LLM coordinates */
  original: { x: number; y: number };
  /** Normalized coordinates */
  normalized: NormalizedCoordinate;
  /** Playwright coordinates (DPR-adjusted) */
  playwright: { x: number; y: number };
  /** Element at coordinates */
  element?: ElementInfo;
  /** Iframe offset if applicable */
  iframeOffset?: { x: number; y: number };
}

export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  role?: string;
  text?: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Coordinate transformer for CUA mode
 */
export class CoordinateTransformer {
  private config: CoordinateConfig;

  constructor(config: Partial<CoordinateConfig> = {}) {
    this.config = { ...DEFAULT_COORDINATE_CONFIG, ...config };
  }

  /**
   * Transform LLM coordinates to Playwright coordinates
   *
   * LLMs typically return coordinates in the screenshot space.
   * We need to convert to Playwright's coordinate space accounting for DPR.
   */
  async transform(
    page: Page,
    llmX: number,
    llmY: number
  ): Promise<CoordinateMapping> {
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

    // Get actual DPR from page
    const dpr = await page.evaluate(() => window.devicePixelRatio);

    // LLM coordinates are typically in screenshot space (scaled by DPR)
    // Convert to CSS pixels
    const cssX = llmX / dpr;
    const cssY = llmY / dpr;

    // Normalize to 0-1 range
    const normalizedX = cssX / viewport.width;
    const normalizedY = cssY / viewport.height;

    // Find element at coordinates
    const element = await this.getElementAtCoordinate(page, cssX, cssY);

    // Check if inside iframe
    let iframeOffset: { x: number; y: number } | undefined;
    if (this.config.handleIframes) {
      iframeOffset = await this.getIframeOffset(page, cssX, cssY);
    }

    return {
      original: { x: llmX, y: llmY },
      normalized: {
        x: normalizedX,
        y: normalizedY,
        absoluteX: cssX,
        absoluteY: cssY,
      },
      playwright: {
        x: cssX + (iframeOffset?.x ?? 0),
        y: cssY + (iframeOffset?.y ?? 0),
      },
      element,
      iframeOffset,
    };
  }

  /**
   * Get element information at coordinate
   */
  private async getElementAtCoordinate(
    page: Page,
    x: number,
    y: number
  ): Promise<ElementInfo | undefined> {
    return page.evaluate(
      ({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        if (!element) return undefined;

        const rect = element.getBoundingClientRect();

        return {
          tagName: element.tagName.toLowerCase(),
          id: element.id || undefined,
          className: element.className || undefined,
          role: element.getAttribute("role") || undefined,
          text: element.textContent?.slice(0, 50) || undefined,
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        };
      },
      { x, y }
    );
  }

  /**
   * Get iframe offset if coordinate is inside an iframe
   */
  private async getIframeOffset(
    page: Page,
    x: number,
    y: number
  ): Promise<{ x: number; y: number } | undefined> {
    return page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      if (!element) return undefined;

      // Check if inside iframe
      const iframe = element.closest("iframe");
      if (!iframe) return undefined;

      const rect = iframe.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
      };
    }, { x, y });
  }

  /**
   * Ensure element is in viewport
   */
  async ensureInViewport(
    page: Page,
    x: number,
    y: number
  ): Promise<void> {
    if (this.config.scrollStrategy === "none") return;

    const isVisible = await page.evaluate(
      ({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        if (!element) return false;

        const rect = element.getBoundingClientRect();
        return (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.right <= window.innerWidth
        );
      },
      { x, y }
    );

    if (!isVisible) {
      await page.evaluate(
        ({ x, y, strategy }) => {
          const element = document.elementFromPoint(x, y);
          if (!element) return;

          element.scrollIntoView({
            behavior: strategy === "smooth" ? "smooth" : "auto",
            block: "center",
            inline: "center",
          });
        },
        { x, y, strategy: this.config.scrollStrategy }
      );

      // Wait for scroll to complete
      await page.waitForTimeout(300);
    }
  }
}

/**
 * CUA Action executor using coordinates
 */
export class CUAActionExecutor {
  private transformer: CoordinateTransformer;

  constructor(config?: Partial<CoordinateConfig>) {
    this.transformer = new CoordinateTransformer(config);
  }

  /**
   * Click at coordinates
   */
  async click(
    page: Page,
    x: number,
    y: number,
    options: { button?: "left" | "right" | "middle"; count?: number } = {}
  ): Promise<void> {
    const mapping = await this.transformer.transform(page, x, y);
    await this.transformer.ensureInViewport(page, mapping.normalized.absoluteX, mapping.normalized.absoluteY);

    await page.mouse.click(mapping.playwright.x, mapping.playwright.y, {
      button: options.button ?? "left",
      clickCount: options.count ?? 1,
    });
  }

  /**
   * Double-click at coordinates
   */
  async doubleClick(page: Page, x: number, y: number): Promise<void> {
    await this.click(page, x, y, { count: 2 });
  }

  /**
   * Type text at coordinates
   */
  async type(
    page: Page,
    x: number,
    y: number,
    text: string,
    options: { clearFirst?: boolean } = {}
  ): Promise<void> {
    const mapping = await this.transformer.transform(page, x, y);
    await this.transformer.ensureInViewport(page, mapping.normalized.absoluteX, mapping.normalized.absoluteY);

    // Click to focus
    await page.mouse.click(mapping.playwright.x, mapping.playwright.y);

    // Clear if requested
    if (options.clearFirst) {
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Delete");
    }

    // Type text
    await page.keyboard.type(text);
  }

  /**
   * Drag from one coordinate to another
   */
  async drag(
    page: Page,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ): Promise<void> {
    const from = await this.transformer.transform(page, fromX, fromY);
    const to = await this.transformer.transform(page, toX, toY);

    await this.transformer.ensureInViewport(page, from.normalized.absoluteX, from.normalized.absoluteY);

    await page.mouse.move(from.playwright.x, from.playwright.y);
    await page.mouse.down();
    await page.mouse.move(to.playwright.x, to.playwright.y);
    await page.mouse.up();
  }

  /**
   * Scroll at coordinates
   */
  async scroll(
    page: Page,
    x: number,
    y: number,
    deltaX: number,
    deltaY: number
  ): Promise<void> {
    const mapping = await this.transformer.transform(page, x, y);

    await page.mouse.move(mapping.playwright.x, mapping.playwright.y);
    await page.mouse.wheel(deltaX, deltaY);
  }

  /**
   * Hover at coordinates
   */
  async hover(page: Page, x: number, y: number): Promise<void> {
    const mapping = await this.transformer.transform(page, x, y);
    await this.transformer.ensureInViewport(page, mapping.normalized.absoluteX, mapping.normalized.absoluteY);

    await page.mouse.move(mapping.playwright.x, mapping.playwright.y);
  }

  /**
   * Take screenshot for CUA
   */
  async takeScreenshot(
    page: Page,
    options: { fullPage?: boolean; type?: "png" | "jpeg" } = {}
  ): Promise<Buffer> {
    return page.screenshot({
      type: options.type ?? "png",
      fullPage: options.fullPage ?? false,
    });
  }
}

/**
 * Convert element index to coordinates (for hybrid mode)
 */
export async function elementIndexToCoordinate(
  page: Page,
  index: number,
  selector: string
): Promise<{ x: number; y: number } | undefined> {
  const element = await page.locator(selector).nth(index).elementHandle();
  if (!element) return undefined;

  const box = await element.boundingBox();
  if (!box) return undefined;

  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

/**
 * Validate coordinates are within viewport
 */
export function validateCoordinates(
  x: number,
  y: number,
  viewport: { width: number; height: number }
): boolean {
  return x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height;
}
