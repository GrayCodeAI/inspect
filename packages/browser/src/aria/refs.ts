// ──────────────────────────────────────────────────────────────────────────────
// RefManager - Manages element reference IDs for ARIA snapshots
// ──────────────────────────────────────────────────────────────────────────────

import type { Page, Locator } from "playwright";
import type { ElementSnapshot } from "@inspect/shared";

/**
 * Manages a map of short reference IDs (e1, e2, ...) to element snapshot data.
 * Provides locator resolution so AI agents can refer to elements by ref string.
 */
export class RefManager {
  private counter = 0;
  private refs: Map<string, ElementSnapshot> = new Map();

  /**
   * Generate the next reference ID.
   * Returns strings like "e1", "e2", "e3", ...
   */
  generateRef(): string {
    this.counter++;
    return `e${this.counter}`;
  }

  /**
   * Register an element snapshot with a reference ID.
   * Returns the ref that was assigned.
   */
  register(snapshot: ElementSnapshot): string {
    this.refs.set(snapshot.ref, snapshot);
    return snapshot.ref;
  }

  /**
   * Get the ElementSnapshot for a given ref.
   */
  getElement(ref: string): ElementSnapshot | undefined {
    return this.refs.get(ref);
  }

  /**
   * Check whether a ref exists.
   */
  has(ref: string): boolean {
    return this.refs.has(ref);
  }

  /**
   * Resolve a ref to a Playwright Locator.
   *
   * Resolution strategy (in order of preference):
   * 1. ARIA role + name locator (most stable)
   * 2. CSS selector (if stored)
   * 3. XPath selector (if stored)
   * 4. Text content match
   */
  resolveLocator(page: Page, ref: string): Locator {
    const element = this.refs.get(ref);
    if (!element) {
      throw new Error(`Reference "${ref}" not found. Available refs: ${[...this.refs.keys()].join(", ")}`);
    }

    // Strategy 1: Use ARIA role + name — most resilient to DOM changes
    if (element.role && element.name) {
      return page.getByRole(element.role as Parameters<Page["getByRole"]>[0], {
        name: element.name,
        exact: false,
      });
    }

    // Strategy 2: CSS selector
    if (element.cssSelector) {
      return page.locator(element.cssSelector);
    }

    // Strategy 3: XPath
    if (element.xpath) {
      return page.locator(`xpath=${element.xpath}`);
    }

    // Strategy 4: Text content
    if (element.textContent) {
      return page.getByText(element.textContent, { exact: false });
    }

    throw new Error(`Cannot resolve locator for ref "${ref}": insufficient selector data.`);
  }

  /**
   * Get all registered refs.
   */
  getAllRefs(): string[] {
    return [...this.refs.keys()];
  }

  /**
   * Get total number of registered refs.
   */
  get size(): number {
    return this.refs.size;
  }

  /**
   * Clear all refs and reset counter.
   */
  clear(): void {
    this.counter = 0;
    this.refs.clear();
  }
}
