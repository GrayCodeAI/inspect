// ============================================================================
// @inspect/browser - DOM Settler
//
// Waits for the DOM to stop changing before taking actions.
// Uses MutationObserver to detect when the page has "settled."
// Prevents acting on loading/transitioning states.
// ============================================================================

import type { Page } from "playwright";

export interface DOMSettlerOptions {
  /** Max time to wait for DOM to settle (ms). Default: 5000 */
  timeoutMs?: number;
  /** Time with no mutations to consider settled (ms). Default: 500 */
  quietMs?: number;
}

/**
 * DOMSettler waits for the page DOM to stop changing.
 *
 * Usage:
 * ```ts
 * const settler = new DOMSettler();
 * await settler.waitForSettle(page); // Waits until DOM is quiet for 500ms
 * // Now safe to take snapshot and act
 * ```
 */
export class DOMSettler {
  private options: Required<DOMSettlerOptions>;

  constructor(options: DOMSettlerOptions = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? 5000,
      quietMs: options.quietMs ?? 500,
    };
  }

  /**
   * Wait for the DOM to settle (stop changing).
   * Returns true if settled, false if timed out.
   */
  async waitForSettle(page: Page): Promise<boolean> {
    const { timeoutMs, quietMs } = this.options;

    return page.evaluate(
      ({ timeoutMs, quietMs }) => {
        return new Promise<boolean>((resolve) => {
          let lastMutation = Date.now();
          const _settled = false;

          const observer = new MutationObserver(() => {
            lastMutation = Date.now();
          });

          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
          });

          const check = () => {
            if (Date.now() - lastMutation >= quietMs) {
              observer.disconnect();
              settled = true;
              resolve(true);
              return;
            }
            if (Date.now() - startTime >= timeoutMs) {
              observer.disconnect();
              resolve(false);
              return;
            }
            setTimeout(check, 100);
          };

          const startTime = Date.now();
          setTimeout(check, quietMs);
        });
      },
      { timeoutMs, quietMs },
    );
  }

  /**
   * Wait for DOM to settle, then check if element is in viewport.
   */
  async waitAndVerifyElement(page: Page, selector: string): Promise<boolean> {
    await this.waitForSettle(page);

    return page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth &&
        rect.width > 0 &&
        rect.height > 0
      );
    }, selector);
  }

  /**
   * Scroll element into view if needed, then wait for settle.
   */
  async scrollIntoViewAndSettle(page: Page, selector: string): Promise<boolean> {
    const scrolled = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }, selector);

    if (!scrolled) return false;
    return this.waitForSettle(page);
  }
}
