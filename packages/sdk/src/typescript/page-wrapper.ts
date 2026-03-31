// ──────────────────────────────────────────────────────────────────────────────
// @inspect/sdk - Playwright Page Interface Wrapper
// ──────────────────────────────────────────────────────────────────────────────

import type { PageSnapshot } from "@inspect/core";
import type { PageInterface } from "./act.js";
import { createLogger } from "@inspect/core";

const logger = createLogger("page-wrapper");

/** Raw Playwright page shape we expect */
interface PlaywrightPage {
  url(): string;
  goto(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  selectOption(selector: string, value: string): Promise<void>;
  hover(selector: string): Promise<void>;
  press(selector: string, key: string): Promise<void>;
  check(selector: string): Promise<void>;
  uncheck(selector: string): Promise<void>;
  evaluate(fn: string | ((...args: unknown[]) => unknown)): Promise<unknown>;
  screenshot(options?: unknown): Promise<Buffer>;
  title(): Promise<string>;
  locator(selector: string): { scrollIntoViewIfNeeded(): Promise<void> };
  getByRole?(role: string, options?: { name?: string }): unknown;
  accessibility?: { snapshot(): Promise<unknown> };
}

/**
 * Wrap a raw Playwright page in our PageInterface.
 * This adapts Playwright's API to our internal interface.
 */
export function createPageWrapper(rawPage: unknown): PageInterface {
  const page = rawPage as PlaywrightPage;

  return {
    async getSnapshot(): Promise<PageSnapshot> {
      const url = page.url();
      const title = await page.title();

      // Extract interactive elements from the page
      let elements: PageSnapshot["elements"] = [];
      try {
        const accessibleTree = await page.evaluate(`
          (function() {
            const elements = [];
            let counter = 0;
            const interactiveTags = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS', 'SUMMARY']);
            const interactiveRoles = new Set(['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox', 'menuitem', 'tab', 'switch', 'slider']);

            function walk(node, depth) {
              if (depth > 20 || elements.length > 200) return;
              if (node.nodeType !== 1) return;

              const el = node;
              const tag = el.tagName;
              const role = el.getAttribute('role') || el.tagName.toLowerCase();
              const name = el.getAttribute('aria-label') || el.innerText?.slice(0, 100) || el.getAttribute('placeholder') || '';
              const rect = el.getBoundingClientRect();
              const visible = rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
              const interactable = interactiveTags.has(tag) || interactiveRoles.has(role) || el.hasAttribute('onclick') || el.hasAttribute('tabindex');

              if (visible && (interactable || el.innerText?.trim())) {
                counter++;
                elements.push({
                  ref: 'e' + counter,
                  role: role,
                  name: name.trim().slice(0, 200),
                  xpath: '',
                  bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                  visible: visible,
                  interactable: interactable,
                  tagName: tag.toLowerCase(),
                  textContent: el.innerText?.trim().slice(0, 300) || undefined,
                  value: el.value || undefined,
                  cssSelector: buildSelector(el)
                });
              }

              for (const child of el.children) {
                walk(child, depth + 1);
              }
            }

            function buildSelector(el) {
              if (el.id) return '#' + el.id;
              let sel = el.tagName.toLowerCase();
              if (el.className && typeof el.className === 'string') {
                sel += '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.');
              }
              return sel;
            }

            walk(document.body, 0);
            return elements;
          })()
        `);

        if (Array.isArray(accessibleTree)) {
          elements = accessibleTree as PageSnapshot["elements"];
        }
      } catch (error) {
        logger.debug("Failed to get page elements snapshot", { error });
      }

      // Capture screenshot
      let screenshot: string | undefined;
      try {
        const buffer = await page.screenshot({ type: "png" });
        screenshot = buffer.toString("base64");
      } catch (error) {
        logger.debug("Screenshot capture failed", { error });
      }

      return {
        url,
        title,
        elements,
        timestamp: Date.now(),
        screenshot,
      };
    },

    async click(ref: string) {
      await page.click(`[data-ref="${ref}"], [aria-label="${ref}"]`).catch(async () => {
        await page.click(ref);
      });
    },

    async fill(ref: string, value: string) {
      await page.fill(`[data-ref="${ref}"], [aria-label="${ref}"]`, value).catch(async () => {
        await page.fill(ref, value);
      });
    },

    async selectOption(ref: string, value: string) {
      await page.selectOption(`[data-ref="${ref}"]`, value).catch(async () => {
        await page.selectOption(ref, value);
      });
    },

    async hover(ref: string) {
      await page.hover(`[data-ref="${ref}"]`).catch(async () => {
        await page.hover(ref);
      });
    },

    async press(key: string) {
      await page.press("body", key);
    },

    async scrollTo(ref: string) {
      try {
        const locator = page.locator(`[data-ref="${ref}"]`);
        await locator.scrollIntoViewIfNeeded();
      } catch (error) {
        logger.debug("Locator scroll failed, using evaluate fallback", { ref, error });
        await page.evaluate(
          `document.querySelector('[data-ref="${ref}"]')?.scrollIntoView({ behavior: 'smooth' })`,
        );
      }
    },

    async check(ref: string) {
      await page.check(`[data-ref="${ref}"]`).catch(async () => {
        await page.check(ref);
      });
    },

    async uncheck(ref: string) {
      await page.uncheck(`[data-ref="${ref}"]`).catch(async () => {
        await page.uncheck(ref);
      });
    },

    url(): string {
      return page.url();
    },

    // Support navigate for the Inspect class
    ...(page.goto ? { navigate: (url: string) => page.goto(url) } : {}),
  } as PageInterface;
}
