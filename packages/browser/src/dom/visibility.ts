/**
 * DOM Visibility & Interactability - Tasks 240-260
 *
 * Element visibility detection and interactability checks
 */

import { Effect } from "effect";
import type { Page } from "playwright";

/**
 * Visibility check options
 */
export interface VisibilityOptions {
  viewportThreshold: number;  // px beyond viewport to consider visible
  checkParents: boolean;      // check all parent visibility
  checkOpacity: boolean;      // check opacity > 0
  checkPointerEvents: boolean; // check pointer-events
}

export const DEFAULT_VISIBILITY_OPTIONS: VisibilityOptions = {
  viewportThreshold: 1000,
  checkParents: true,
  checkOpacity: true,
  checkPointerEvents: true,
};

/**
 * Task 240-245: Compute element visibility
 */
export async function isElementVisible(
  page: Page,
  selector: string,
  options: Partial<VisibilityOptions> = {}
): Promise<boolean> {
  const opts = { ...DEFAULT_VISIBILITY_OPTIONS, ...options };

  return page.evaluate(
    (args) => {
      const { selector, opts } = args;
      const element = document.querySelector(selector);
      if (!element) return false;

      // Task 241: Check visibility according to all parents
      if (opts.checkParents) {
        let current: Element | null = element;
        while (current) {
          const style = window.getComputedStyle(current as Element);

          // Task 242: Check CSS display
          if (style.display === "none") return false;

          // Task 243: Check CSS visibility
          if (style.visibility === "hidden" || style.visibility === "collapse") return false;

          // Task 244: Check CSS opacity
          if (opts.checkOpacity && parseFloat(style.opacity) === 0) return false;

          current = current.parentElement;
        }
      }

      // Task 245: Check viewport bounds
      const rect = element.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const isInViewport =
        rect.top >= -opts.viewportThreshold &&
        rect.left >= -opts.viewportThreshold &&
        rect.bottom <= viewportHeight + opts.viewportThreshold &&
        rect.right <= viewportWidth + opts.viewportThreshold;

      if (!isInViewport) return false;

      // Check pointer events
      if (opts.checkPointerEvents) {
        const style = window.getComputedStyle(element);
        if (style.pointerEvents === "none") return false;
      }

      // Check element dimensions
      if (rect.width === 0 || rect.height === 0) return false;

      return true;
    },
    { selector, opts }
  );
}

/**
 * Task 246-250: Iframe handling
 */
export interface IframeConfig {
  maxDepth: number;      // Task 246: iframe depth limit (default 5)
  maxCount: number;      // Task 247: iframe quantity limit (default 100)
  lazyFetch: boolean;    // Task 248: lazy fetch cross-origin
  skipInvisible: boolean; // Task 250: skip invisible iframes
  minSize: number;       // Task 250: minimum iframe size
}

export const DEFAULT_IFRAME_CONFIG: IframeConfig = {
  maxDepth: 5,
  maxCount: 100,
  lazyFetch: true,
  skipInvisible: true,
  minSize: 10,
};

/**
 * Enhanced node with visibility info
 */
export interface EnhancedNode {
  selector: string;
  tag: string;
  visible: boolean;
  interactive: boolean;
  rect: { x: number; y: number; width: number; height: number };
  index?: number;
  children: EnhancedNode[];
}

/**
 * Task 251-257: DOM Serializer
 */
export class DOMSerializer {
  constructor(
    private options: {
      maxDepth: number;
      skipSelectors: string[];
      indexClickable: boolean; // Task 255: assign numeric index
    } = {
      maxDepth: 10,
      skipSelectors: ["script", "style", "link", "meta", "noscript"],
      indexClickable: true,
    }
  ) {}

  /**
   * Task 252-254: Filter and serialize DOM
   */
  async serialize(page: Page): Promise<{ text: string; selectorMap: Map<number, string> }> {
    const result = await page.evaluate((opts) => {
      const selectorMap = new Map<number, string>();
      let clickableIndex = 0;

      function processNode(node: Element, depth: number): string | null {
        // Task 252: Skip non-displayable nodes
        if (opts.skipSelectors.includes(node.tagName.toLowerCase())) {
          return null;
        }

        // Check visibility
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") {
          return null; // Task 254: Remove hidden elements
        }

        // Get role and name
        const role = node.getAttribute("role") || "";
        const ariaLabel = node.getAttribute("aria-label") || "";
        const text = node.textContent?.slice(0, 100) || "";

        // Determine if clickable
        const isClickable =
          node.tagName === "BUTTON" ||
          node.tagName === "A" ||
          node.tagName === "INPUT" ||
          node.tagName === "SELECT" ||
          node.tagName === "TEXTAREA" ||
          role === "button" ||
          role === "link" ||
          style.cursor === "pointer";

        // Build line
        let line = "".padStart(depth * 2);

        if (isClickable && opts.indexClickable) {
          // Task 255-257: Format as [index] role: name
          const index = clickableIndex++;
          selectorMap.set(index, (node as Element & { inspectSelector?: string }).inspectSelector || "");
          line += `[${index}] `;
        }

        line += node.tagName.toLowerCase();

        if (role) line += ` role="${role}"`;
        if (ariaLabel) line += ` "${ariaLabel}"`;
        else if (text) line += ` "${text.slice(0, 50)}"`;

        // Process children
        const children: string[] = [];
        if (depth < opts.maxDepth) {
          for (const child of node.children) {
            const childLine = processNode(child, depth + 1);
            if (childLine) children.push(childLine);
          }
        }

        if (children.length > 0) {
          return line + "\n" + children.join("\n");
        }

        return line;
      }

      const body = document.body;
      const output = processNode(body, 0);

      return {
        text: output || "",
        selectorMap: Array.from(selectorMap.entries()),
      };
    }, this.options);

    // Reconstruct selector map
    const selectorMap = new Map<number, string>();
    for (const [index, selector] of result.selectorMap) {
      selectorMap.set(index, selector);
    }

    return { text: result.text, selectorMap };
  }
}

/**
 * Task 258-260: Clickable detector
 */
export async function isInteractable(
  page: Page,
  selector: string
): Promise<boolean> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return false;

    const style = window.getComputedStyle(element);

    // Check basic visibility
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (parseFloat(style.opacity) === 0) return false;

    // Task 259-260: Check interactability

    // 1. Check ARIA widget roles
    const role = element.getAttribute("role");
    const interactiveRoles = [
      "button", "link", "checkbox", "radio", "textbox", "combobox",
      "slider", "spinbutton", "listbox", "menuitem", "tab", "treeitem",
    ];
    if (role && interactiveRoles.includes(role)) return true;

    // 2. Check if element has click listener
    // (This is a heuristic - we can't actually detect listeners)
    const clickableTags = ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"];
    if (clickableTags.includes(element.tagName)) return true;

    // 3. Check pointer events
    if (style.pointerEvents === "none") return false;

    // 4. Check if element is actually visible
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    // 5. Check tabindex
    const tabIndex = element.getAttribute("tabindex");
    if (tabIndex && parseInt(tabIndex) >= 0) return true;

    // 6. Check cursor style
    if (style.cursor === "pointer") return true;

    // 7. Check if it's a label for a form element
    if (element.tagName === "LABEL" && element.hasAttribute("for")) return true;

    return false;
  }, selector);
}

/**
 * Check if element is behind another element
 */
export async function isElementCovered(
  page: Page,
  selector: string
): Promise<boolean> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Get element at center point
    const topElement = document.elementFromPoint(centerX, centerY);

    // Check if top element is the same or a child
    if (!topElement) return false;
    if (topElement === element) return false;
    if (element.contains(topElement)) return false;

    return true;
  }, selector);
}
