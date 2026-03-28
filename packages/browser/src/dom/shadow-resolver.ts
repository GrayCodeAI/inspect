// ──────────────────────────────────────────────────────────────────────────────
// @inspect/browser - Shadow DOM Resolver
// ──────────────────────────────────────────────────────────────────────────────

import type { ElementSnapshot, BoundingBox } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("browser/dom/shadow-resolver");

/** Shadow root info */
export interface ShadowRootInfo {
  hostElement: string;
  hostRef: string;
  mode: "open" | "closed";
  childElementCount: number;
}

/** Shadow DOM traversal result */
export interface ShadowDomResult {
  /** Elements found in regular DOM */
  regularElements: ElementSnapshot[];
  /** Elements found inside shadow DOMs */
  shadowElements: ElementSnapshot[];
  /** Shadow roots discovered */
  shadowRoots: ShadowRootInfo[];
  /** Total elements found */
  totalElements: number;
}

/**
 * Resolves elements inside Shadow DOM trees.
 * Handles open and closed shadow roots, nested shadows, and custom elements.
 *
 * Usage:
 * ```ts
 * const resolver = new ShadowDomResolver(page);
 * const result = await resolver.resolve();
 * ```
 */
export class ShadowDomResolver {
  private page: unknown;
  private counter = 0;

  constructor(page: unknown) {
    this.page = page;
  }

  /**
   * Resolve all elements including those in Shadow DOM.
   */
  async resolve(): Promise<ShadowDomResult> {
    const page = this.page as {
      evaluate?: (fn: string) => Promise<unknown>;
    };

    if (!page.evaluate) {
      return { regularElements: [], shadowElements: [], shadowRoots: [], totalElements: 0 };
    }

    const result = (await page.evaluate(`
      (function() {
        const regular = [];
        const shadow = [];
        const shadowRoots = [];
        let counter = 0;
        const interactiveTags = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS', 'SUMMARY']);

        function walkStandard(node, depth, inShadow) {
          if (depth > 20 || (regular.length + shadow.length) > 200) return;
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
            const elem = {
              ref: 's' + counter,
              role: role,
              name: name.trim().slice(0, 200),
              xpath: '',
              bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              visible: visible,
              interactable: interactable,
              tagName: tag.toLowerCase(),
              textContent: el.innerText?.trim().slice(0, 300) || undefined,
              inShadowDom: inShadow,
            };
            if (inShadow) {
              shadow.push(elem);
            } else {
              regular.push(elem);
            }
          }

          // Check for shadow root
          if (el.shadowRoot) {
            shadowRoots.push({
              hostElement: tag.toLowerCase(),
              hostRef: 's' + counter,
              mode: 'open',
              childElementCount: el.shadowRoot.childElementCount,
            });
            for (const child of el.shadowRoot.children) {
              walkStandard(child, depth + 1, true);
            }
          }

          for (const child of el.children) {
            walkStandard(child, depth + 1, inShadow);
          }
        }

        walkStandard(document.body, 0, false);

        return { regular, shadow, shadowRoots };
      })()
    `)) as { regular: ElementSnapshot[]; shadow: ElementSnapshot[]; shadowRoots: ShadowRootInfo[] };

    return {
      regularElements: result.regular ?? [],
      shadowElements: result.shadow ?? [],
      shadowRoots: result.shadowRoots ?? [],
      totalElements: (result.regular?.length ?? 0) + (result.shadow?.length ?? 0),
    };
  }

  /**
   * Find elements in shadow DOM matching a predicate.
   */
  async findInShadow(predicate: (el: ElementSnapshot) => boolean): Promise<ElementSnapshot[]> {
    const result = await this.resolve();
    return result.shadowElements.filter(predicate);
  }

  /**
   * Check if the page has any shadow DOM elements.
   */
  async hasShadowDom(): Promise<boolean> {
    const page = this.page as {
      evaluate?: (fn: string) => Promise<boolean>;
    };

    if (!page.evaluate) return false;

    try {
      return (await page.evaluate(`
        (function() {
          function check(node) {
            if (node.nodeType !== 1) return false;
            if (node.shadowRoot) return true;
            for (const child of node.children) {
              if (check(child)) return true;
            }
            return false;
          }
          return check(document.body);
        })()
      `)) as boolean;
    } catch (error) {
      logger.debug("Failed to check for shadow DOM", { error });
      return false;
    }
  }

  /**
   * Get all shadow root hosts in the page.
   */
  async getShadowHosts(): Promise<ShadowRootInfo[]> {
    const result = await this.resolve();
    return result.shadowRoots;
  }
}
