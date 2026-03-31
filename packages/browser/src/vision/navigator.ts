// ============================================================================
// @inspect/browser - Vision Navigator
//
// Hybrid DOM + Vision element location for robust element targeting.
// Falls back from DOM to vision when selectors fail, learning from success.
// Inspired by Skyvern's vision-first approach combined with DOM efficiency.
// ============================================================================

import type { Page, Locator } from "playwright";
import { createLogger } from "@inspect/core";
import { VisionDetector, type VisionLLMClient } from "./detector.js";
import { AnnotatedScreenshot } from "./annotated-screenshot.js";

const logger = createLogger("browser/vision-navigator");

export interface VisionNavigatorOptions {
  /** Vision LLM client to use */
  visionClient: VisionLLMClient;
  /** Try DOM selectors before vision (default: true) */
  preferDom?: boolean;
  /** Cache successful strategies for learning (default: true) */
  enableLearning?: boolean;
  /** Minimum confidence threshold for vision actions (default: 0.5) */
  confidenceThreshold?: number;
  /** Maximum vision attempts before giving up (default: 3) */
  maxVisionAttempts?: number;
}

export interface ElementLocation {
  /** How the element was found */
  strategy: "dom" | "vision" | "cache";
  /** The locator (DOM) or coordinates (vision) */
  locator?: Locator;
  coordinates?: { x: number; y: number };
  /** Element label from annotation */
  label?: string;
  /** Confidence score (vision only) */
  confidence?: number;
  /** Time taken to locate */
  durationMs: number;
}

export interface LearningCache {
  description: string;
  strategy: "dom" | "vision";
  selector?: string;
  elementHint?: string;
  timestamp: number;
  successCount: number;
}

/**
 * VisionNavigator provides hybrid element location using DOM + Vision.
 *
 * Strategy:
 * 1. Try cached selector from previous successful runs
 * 2. Try DOM selector based on element description
 * 3. Fall back to vision-based detection
 * 4. Cache successful strategy for future runs
 *
 * Usage:
 * ```ts
 * const navigator = new VisionNavigator(page, {
 *   visionClient: new OpenAIVisionClient(apiKey),
 * });
 *
 * // Find element with hybrid approach
 * const location = await navigator.locate("the green submit button");
 *
 * if (location.locator) {
 *   await location.locator.click();
 * } else if (location.coordinates) {
 *   await page.mouse.click(location.coordinates.x, location.coordinates.y);
 * }
 * ```
 */
export class VisionNavigator {
  private page: Page;
  private options: Required<Omit<VisionNavigatorOptions, "visionClient">> & { visionClient: VisionLLMClient };
  private detector: VisionDetector;
  private annotator: AnnotatedScreenshot;
  private learningCache = new Map<string, LearningCache>();

  constructor(page: Page, options: VisionNavigatorOptions) {
    this.page = page;
    this.options = {
      visionClient: options.visionClient,
      preferDom: options.preferDom ?? true,
      enableLearning: options.enableLearning ?? true,
      confidenceThreshold: options.confidenceThreshold ?? 0.5,
      maxVisionAttempts: options.maxVisionAttempts ?? 3,
    };
    this.detector = new VisionDetector();
    this.annotator = new AnnotatedScreenshot();
  }

  /**
   * Locate an element using hybrid DOM + Vision approach.
   */
  async locate(description: string): Promise<ElementLocation> {
    const startTime = Date.now();

    // 1. Try cached selector first
    if (this.options.enableLearning) {
      const cached = this.learningCache.get(description);
      if (cached && cached.selector) {
        try {
          const locator = this.page.locator(cached.selector);
          if (await locator.isVisible({ timeout: 1000 })) {
            logger.debug("Element found via cached selector", { description, selector: cached.selector });
            return {
              strategy: "cache",
              locator,
              label: cached.elementHint,
              durationMs: Date.now() - startTime,
            };
          }
        } catch {
          // Cache miss, continue with other strategies
          logger.debug("Cached selector failed, trying other strategies", { description });
        }
      }
    }

    // 2. Try DOM-based selectors
    if (this.options.preferDom) {
      const domResult = await this.tryDomLocation(description);
      if (domResult) {
        return { ...domResult, durationMs: Date.now() - startTime };
      }
    }

    // 3. Fall back to vision-based detection
    const visionResult = await this.tryVisionLocation(description);
    if (visionResult) {
      return { ...visionResult, durationMs: Date.now() - startTime };
    }

    // Not found
    return {
      strategy: "dom",
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Try to locate element using DOM selectors.
   */
  private async tryDomLocation(description: string): Promise<ElementLocation | null> {
    // Generate candidate selectors from description
    const selectors = this.generateSelectors(description);

    for (const selector of selectors) {
      try {
        const locator = this.page.locator(selector);
        const count = await locator.count();

        if (count === 1 && await locator.isVisible({ timeout: 2000 })) {
          // Unique visible element found
          this.recordSuccess(description, "dom", selector);
          return {
            strategy: "dom",
            locator,
            durationMs: 0,
          };
        } else if (count > 1) {
          // Multiple matches - try to narrow down
          const first = locator.first();
          if (await first.isVisible({ timeout: 1000 })) {
            this.recordSuccess(description, "dom", selector);
            return {
              strategy: "dom",
              locator: first,
              durationMs: 0,
            };
          }
        }
      } catch {
        // Selector didn't match, try next
      }
    }

    return null;
  }

  /**
   * Try to locate element using vision detection.
   */
  private async tryVisionLocation(description: string): Promise<ElementLocation | null> {
    for (let attempt = 0; attempt < this.options.maxVisionAttempts; attempt++) {
      try {
        // Capture annotated screenshot
        const annotated = await this.annotator.capture(this.page);

        // Build instruction with element context
        const instruction = this.buildVisionInstruction(description, annotated.elements);

        // Detect actions via vision
        const actions = await this.detector.detect(
          annotated.screenshot,
          instruction,
          this.options.visionClient,
        );

        // Filter by confidence and type
        const clickActions = actions.filter(
          (a) => a.confidence >= this.options.confidenceThreshold && a.type === "click",
        );

        if (clickActions.length > 0) {
          const best = clickActions[0];

          // If element label matches, record for learning
          if (best.elementLabel) {
            const element = annotated.elements.find((e) => e.id === best.elementLabel);
            if (element) {
              this.recordSuccess(description, "vision", undefined, element.id);
            }
          }

          return {
            strategy: "vision",
            coordinates: best.coordinates,
            label: best.elementLabel,
            confidence: best.confidence,
            durationMs: 0,
          };
        }
      } catch (error) {
        logger.debug("Vision detection attempt failed", { attempt, error });
      }
    }

    return null;
  }

  /**
   * Generate candidate DOM selectors from description.
   */
  private generateSelectors(description: string): string[] {
    const selectors: string[] = [];
    const lower = description.toLowerCase();

    // Extract quoted text
    const quotedMatch = description.match(/["']([^"']+)["']/);
    const quotedText = quotedMatch?.[1];

    // Extract button text patterns
    const buttonText = quotedText || this.extractButtonName(description);

    // Button selectors
    if (lower.includes("button") || buttonText) {
      if (buttonText) {
        selectors.push(`button:has-text("${buttonText}")`);
        selectors.push(`button >> text="${buttonText}"`);
        selectors.push(`[role="button"]:has-text("${buttonText}")`);
        selectors.push(`input[type="submit"][value*="${buttonText}"]`);
        selectors.push(`input[type="button"][value*="${buttonText}"]`);
        selectors.push(`a:has-text("${buttonText}")`);
      }
    }

    // Link selectors
    if (lower.includes("link") || lower.includes("anchor")) {
      if (buttonText) {
        selectors.push(`a:has-text("${buttonText}")`);
        selectors.push(`a >> text="${buttonText}"`);
      }
    }

    // Input selectors
    if (lower.includes("input") || lower.includes("field") || lower.includes("textbox")) {
      const fieldName = quotedText || this.extractFieldName(description);
      if (fieldName) {
        selectors.push(`input[placeholder*="${fieldName}"]`);
        selectors.push(`input[name*="${fieldName.toLowerCase().replace(/\s+/g, "_")}"]`);
        selectors.push(`input[aria-label*="${fieldName}"]`);
        selectors.push(`label:has-text("${fieldName}") + input`);
        selectors.push(`textarea[placeholder*="${fieldName}"]`);
      }
    }

    // Generic text-based selectors
    if (buttonText) {
      selectors.push(`text="${buttonText}"`);
      selectors.push(`:text("${buttonText}")`);
    }

    // Role-based selectors
    const roleMatch = lower.match(/\b(button|link|checkbox|radio|textbox|combobox|menuitem|tab)\b/);
    if (roleMatch) {
      selectors.push(`[role="${roleMatch[1]}"]`);
    }

    // Color-based selectors
    const colorMatch = lower.match(/\b(green|red|blue|yellow|orange|purple|black|white)\b/);
    if (colorMatch) {
      // Color is harder to select via DOM, but try common patterns
      selectors.push(`[class*="${colorMatch[1]}"]`);
    }

    return selectors;
  }

  /**
   * Extract button name from description.
   */
  private extractButtonName(description: string): string | null {
    // Patterns like "Click the X button", "Press X", "Tap X"
    const patterns = [
      /click\s+(?:the\s+)?["']?([^"']+?)["']?\s*button/i,
      /press\s+(?:the\s+)?["']?([^"']+?)["']?\s*button/i,
      /tap\s+(?:the\s+)?["']?([^"']+?)["']?\s*button/i,
      /click\s+(?:on\s+)?["']?([^"']+?)["']?$/i,
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) return match[1].trim();
    }

    return null;
  }

  /**
   * Extract field name from description.
   */
  private extractFieldName(description: string): string | null {
    const patterns = [
      /(?:enter|type|fill|input)\s+(?:in\s+)?(?:the\s+)?["']?([^"']+?)["']?\s*(?:field|input|box)/i,
      /(?:in\s+)?(?:the\s+)?["']?([^"']+?)["']?\s*(?:field|input|textbox)/i,
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) return match[1].trim();
    }

    return null;
  }

  /**
   * Build vision instruction with element context.
   */
  private buildVisionInstruction(
    description: string,
    elements: Array<{ id: string; tagName: string; role?: string; text?: string }>,
  ): string {
    const elementContext = elements
      .slice(0, 20)
      .map((e) => {
        const parts = [`[${e.id}] ${e.tagName}`];
        if (e.role) parts.push(`role="${e.role}"`);
        if (e.text) parts.push(`text="${e.text}"`);
        return parts.join(" ");
      })
      .join("\n");

    return `Find the element for: "${description}"

Available elements:
${elementContext}

Return the action to interact with the best matching element.`;
  }

  /**
   * Record successful strategy for learning.
   */
  private recordSuccess(
    description: string,
    strategy: "dom" | "vision",
    selector?: string,
    elementHint?: string,
  ): void {
    if (!this.options.enableLearning) return;

    const existing = this.learningCache.get(description);
    if (existing) {
      existing.successCount++;
      existing.timestamp = Date.now();
    } else {
      this.learningCache.set(description, {
        description,
        strategy,
        selector,
        elementHint,
        timestamp: Date.now(),
        successCount: 1,
      });
    }

    logger.debug("Recorded successful location strategy", {
      description,
      strategy,
      selector,
    });
  }

  /**
   * Clear the learning cache.
   */
  clearCache(): void {
    this.learningCache.clear();
  }

  /**
   * Export learning cache for persistence.
   */
  exportCache(): LearningCache[] {
    return [...this.learningCache.values()];
  }

  /**
   * Import learning cache from previous session.
   */
  importCache(caches: LearningCache[]): void {
    for (const cache of caches) {
      this.learningCache.set(cache.description, cache);
    }
  }
}
