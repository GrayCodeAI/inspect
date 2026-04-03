// ──────────────────────────────────────────────────────────────────────────────
// VisionGrounding - Vision-based coordinate grounding for page interactions
// Supports vision LLMs to find elements by description and interact via coordinates
// ──────────────────────────────────────────────────────────────────────────────

import type { Page } from "playwright";

export interface GroundedElement {
  /** Element description */
  description: string;
  /** Bounding box coordinates */
  bbox: { x: number; y: number; width: number; height: number };
  /** Center point for clicking */
  center: { x: number; y: number };
  /** Confidence score 0-1 */
  confidence: number;
}

export interface VisionGroundingOptions {
  /** LLM that accepts image + text and returns coordinates.
   *  Messages can include multi-modal content arrays. */
  llm: (
    messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>,
  ) => Promise<string>;
  /** Max retina scaling (default: 1) */
  devicePixelRatio?: number;
}

/**
 * Vision-based element grounding using screenshots and LLM vision models.
 * Falls back to DOM selectors when vision fails.
 */
export class VisionGrounding {
  private llm: VisionGroundingOptions["llm"];
  private dpr: number;

  constructor(options: VisionGroundingOptions) {
    this.llm = options.llm;
    this.dpr = options.devicePixelRatio ?? 1;
  }

  /**
   * Find an element on the page by natural language description.
   * Takes a screenshot, sends to vision LLM, gets back bounding box.
   */
  async find(page: Page, description: string): Promise<GroundedElement | null> {
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    const base64 = screenshot.toString("base64");

    const systemPrompt = [
      "You are a visual grounding model. Given a screenshot of a webpage and a description of an element,",
      "return the bounding box coordinates of that element.",
      'Respond with ONLY a JSON object: { "x": number, "y": number, "width": number, "height": number, "confidence": number }',
      "Coordinates are in CSS pixels (not device pixels). If the element is not visible, respond with null.",
    ].join(" ");

    let response: string;
    try {
      const content: Array<Record<string, unknown>> = [
        { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
        { type: "text", text: `${systemPrompt}\n\nFind: ${description}` },
      ];
      response = await this.llm([{ role: "user", content }]);
    } catch {
      return null;
    }

    try {
      const cleaned = response
        .replace(/```json?\n?/g, "")
        .replace(/```/g, "")
        .trim();
      if (cleaned === "null" || cleaned === "null,") return null;

      const parsed = JSON.parse(cleaned);
      if (!parsed.x || !parsed.y) return null;

      const scaleFactor = this.dpr;
      return {
        description,
        bbox: {
          x: parsed.x * scaleFactor,
          y: parsed.y * scaleFactor,
          width: (parsed.width ?? 50) * scaleFactor,
          height: (parsed.height ?? 30) * scaleFactor,
        },
        center: {
          x: (parsed.x + (parsed.width ?? 50) / 2) * scaleFactor,
          y: (parsed.y + (parsed.height ?? 30) / 2) * scaleFactor,
        },
        confidence: parsed.confidence ?? 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Click an element found by vision grounding.
   * Falls back to DOM-based click if visual grounding fails.
   */
  async click(page: Page, description: string, fallbackSelector?: string): Promise<boolean> {
    const element = await this.find(page, description);
    if (element) {
      await page.mouse.click(element.center.x, element.center.y);
      return true;
    }
    // Fallback to DOM selector
    if (fallbackSelector) {
      await page.click(fallbackSelector);
      return true;
    }
    return false;
  }

  /**
   * Type into an element found by vision grounding.
   */
  async fill(
    page: Page,
    description: string,
    text: string,
    fallbackSelector?: string,
  ): Promise<boolean> {
    const element = await this.find(page, description);
    if (element) {
      await page.mouse.click(element.center.x, element.center.y);
      await page.keyboard.type(text);
      return true;
    }
    if (fallbackSelector) {
      await page.fill(fallbackSelector, text);
      return true;
    }
    return false;
  }
}
