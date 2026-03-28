// ──────────────────────────────────────────────────────────────────────────────
// @inspect/browser - iFrame Traversal Module
// ──────────────────────────────────────────────────────────────────────────────

import type { FrameInfo, ElementSnapshot, BoundingBox } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("browser/dom/frame-traverser");

/** Frame traversal options */
export interface FrameTraversalOptions {
  /** Maximum depth for nested frames */
  maxDepth?: number;
  /** Include cross-origin iframes */
  includeCrossOrigin?: boolean;
  /** Timeout for frame operations in ms */
  timeout?: number;
}

/** Result of frame traversal */
export interface FrameTraversalResult {
  /** Root frame elements */
  rootElements: ElementSnapshot[];
  /** All frames discovered */
  frames: FrameInfo[];
  /** Elements organized by frame ID */
  elementsByFrame: Map<string, ElementSnapshot[]>;
  /** Total elements found across all frames */
  totalElements: number;
}

/**
 * Traverses iFrames in a page to collect elements from all frames.
 * Handles cross-origin iframes, nested frames, and provides frame context.
 *
 * Usage:
 * ```ts
 * const traverser = new FrameTraverser(page);
 * const result = await traverser.traverse({ maxDepth: 5, includeCrossOrigin: true });
 * ```
 */
export class FrameTraverser {
  private page: unknown;
  private frameCounter = 0;

  constructor(page: unknown) {
    this.page = page;
  }

  /**
   * Traverse all frames in the page and collect elements.
   */
  async traverse(options: FrameTraversalOptions = {}): Promise<FrameTraversalResult> {
    const maxDepth = options.maxDepth ?? 10;
    const includeCrossOrigin = options.includeCrossOrigin ?? false;

    const frames: FrameInfo[] = [];
    const elementsByFrame = new Map<string, ElementSnapshot[]>();
    let totalElements = 0;

    // Traverse root frame
    const rootFrameId = `frame_${this.frameCounter++}`;
    const rootElements = await this.collectElementsFromFrame(
      this.page,
      rootFrameId,
      options.timeout,
    );
    elementsByFrame.set(rootFrameId, rootElements);
    totalElements += rootElements.length;

    frames.push({
      id: rootFrameId,
      name: "",
      url: this.getPageUrl(),
      children: [],
    });

    // Discover child frames
    await this.discoverFrames(
      this.page,
      frames[0],
      0,
      maxDepth,
      includeCrossOrigin,
      frames,
      elementsByFrame,
      options.timeout,
    );

    return {
      rootElements,
      frames,
      elementsByFrame,
      totalElements,
    };
  }

  /**
   * Find elements across all frames matching a selector.
   */
  async findInAllFrames(
    predicate: (el: ElementSnapshot) => boolean,
    options?: FrameTraversalOptions,
  ): Promise<Array<{ frameId: string; element: ElementSnapshot }>> {
    const result = await this.traverse(options);
    const matches: Array<{ frameId: string; element: ElementSnapshot }> = [];

    for (const [frameId, elements] of result.elementsByFrame) {
      for (const element of elements) {
        if (predicate(element)) {
          matches.push({ frameId, element });
        }
      }
    }

    return matches;
  }

  // ── Private methods ──────────────────────────────────────────────────

  private async discoverFrames(
    parent: unknown,
    parentFrameInfo: FrameInfo,
    depth: number,
    maxDepth: number,
    includeCrossOrigin: boolean,
    frames: FrameInfo[],
    elementsByFrame: Map<string, ElementSnapshot[]>,
    timeout?: number,
  ): Promise<void> {
    if (depth >= maxDepth) return;

    const page = parent as {
      frames(): Array<{
        name(): string;
        url(): string;
        isOOP(): boolean;
        childFrames(): unknown[];
        evaluate(fn: string): Promise<unknown>;
      }>;
    };

    try {
      const childFrames = page.frames?.() ?? [];

      for (const frame of childFrames) {
        if (frame.isOOP?.() && !includeCrossOrigin) continue;

        const frameId = `frame_${this.frameCounter++}`;
        const frameInfo: FrameInfo = {
          id: frameId,
          name: frame.name?.() ?? "",
          url: frame.url?.() ?? "",
          isOOPIF: frame.isOOP?.() ?? false,
          children: [],
        };

        parentFrameInfo.children.push(frameInfo);
        frames.push(frameInfo);

        // Collect elements from this frame
        const elements = await this.collectElementsFromFrame(frame, frameId, timeout);
        elementsByFrame.set(frameId, elements);
      }
    } catch (error) {
      logger.debug("Frame access denied or not available", { error });
    }
  }

  private async collectElementsFromFrame(
    frame: unknown,
    frameId: string,
    _timeout?: number,
  ): Promise<ElementSnapshot[]> {
    const frameObj = frame as {
      evaluate?: (fn: string) => Promise<unknown>;
    };

    if (!frameObj.evaluate) return [];

    try {
      const elements = await frameObj.evaluate(`
        (function() {
          const elements = [];
          let counter = 0;
          const interactiveTags = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS', 'SUMMARY']);

          function walk(node, depth) {
            if (depth > 20 || elements.length > 100) return;
            if (node.nodeType !== 1) return;

            const el = node;
            const tag = el.tagName;
            const role = el.getAttribute('role') || el.tagName.toLowerCase();
            const name = el.getAttribute('aria-label') || el.innerText?.slice(0, 100) || el.getAttribute('placeholder') || '';
            const rect = el.getBoundingClientRect();
            const visible = rect.width > 0 && rect.height > 0;
            const interactable = interactiveTags.has(tag) || el.hasAttribute('onclick') || el.hasAttribute('tabindex');

            if (visible && (interactable || el.innerText?.trim())) {
              counter++;
              elements.push({
                ref: 'f' + counter,
                role: role,
                name: name.trim().slice(0, 200),
                xpath: '',
                bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                visible: visible,
                interactable: interactable,
                tagName: tag.toLowerCase(),
                textContent: el.innerText?.trim().slice(0, 300) || undefined,
                frameId: '${frameId}',
              });
            }

            for (const child of el.children) {
              walk(child, depth + 1);
            }
          }

          walk(document.body, 0);
          return elements;
        })()
      `);

      return (elements as ElementSnapshot[]) ?? [];
    } catch (error) {
      logger.debug("Failed to collect elements from frame", { frameId, error });
      return [];
    }
  }

  private getPageUrl(): string {
    const page = this.page as { url?: () => string };
    return page.url?.() ?? "";
  }
}
