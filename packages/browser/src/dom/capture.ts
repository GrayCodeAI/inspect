// ──────────────────────────────────────────────────────────────────────────────
// DOMCapture - Serialize DOM tree from Playwright pages
// ──────────────────────────────────────────────────────────────────────────────

import type { Page } from "playwright";
import type { DOMNode } from "@inspect/shared";

/**
 * Captures a serialized DOM tree from a Playwright Page, including
 * attributes, text content, bounding boxes, and visibility state.
 */
export class DOMCapture {
  /**
   * Capture the full DOM tree of the page.
   */
  async captureDOM(page: Page): Promise<DOMNode[]> {
    return page.evaluate(() => {
      function serializeNode(node: Node): DOMNode | null {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (!text) return null;
          return {
            nodeType: Node.TEXT_NODE,
            textContent: text,
          };
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return null;

        const el = node as HTMLElement;
        const tagName = el.tagName.toLowerCase();

        // Skip script, style, and other non-visible elements
        if (["script", "style", "noscript", "meta", "link"].includes(tagName)) {
          return null;
        }

        const attributes: Record<string, string> = {};
        for (const attr of Array.from(el.attributes)) {
          // Skip data-heavy attributes and event handlers
          if (attr.name.startsWith("on") || attr.name === "style") continue;
          attributes[attr.name] = attr.value;
        }

        const rect = el.getBoundingClientRect();
        const bounds = {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };

        const computedStyle = window.getComputedStyle(el);
        const visible =
          computedStyle.display !== "none" &&
          computedStyle.visibility !== "hidden" &&
          computedStyle.opacity !== "0" &&
          rect.width > 0 &&
          rect.height > 0;

        const children: DOMNode[] = [];
        for (const child of Array.from(el.childNodes)) {
          const serialized = serializeNode(child);
          if (serialized) children.push(serialized);
        }

        // Get direct text content (not from children)
        let textContent: string | undefined;
        const directText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent?.trim())
          .filter(Boolean)
          .join(" ");
        if (directText) textContent = directText;

        return {
          nodeType: Node.ELEMENT_NODE,
          tagName,
          attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
          textContent,
          bounds,
          visible,
          children: children.length > 0 ? children : undefined,
        };
      }

      const body = document.body;
      if (!body) return [];

      const result: DOMNode[] = [];
      for (const child of Array.from(body.childNodes)) {
        const serialized = serializeNode(child);
        if (serialized) result.push(serialized);
      }
      return result;
    });
  }

  /**
   * Capture only visible elements on the page (within viewport).
   */
  async captureVisible(page: Page): Promise<DOMNode[]> {
    return page.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      function serializeVisibleNode(node: Node): DOMNode | null {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (!text) return null;
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          // Check if text node is in viewport
          if (
            rect.bottom < 0 ||
            rect.top > viewportHeight ||
            rect.right < 0 ||
            rect.left > viewportWidth
          ) {
            return null;
          }
          return {
            nodeType: Node.TEXT_NODE,
            textContent: text,
          };
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return null;

        const el = node as HTMLElement;
        const tagName = el.tagName.toLowerCase();

        if (["script", "style", "noscript", "meta", "link"].includes(tagName)) {
          return null;
        }

        const rect = el.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(el);

        // Visibility checks
        const isVisible =
          computedStyle.display !== "none" &&
          computedStyle.visibility !== "hidden" &&
          computedStyle.opacity !== "0" &&
          rect.width > 0 &&
          rect.height > 0;

        if (!isVisible) return null;

        // Viewport intersection check
        const inViewport =
          rect.bottom > 0 &&
          rect.top < viewportHeight &&
          rect.right > 0 &&
          rect.left < viewportWidth;

        if (!inViewport) return null;

        const attributes: Record<string, string> = {};
        for (const attr of Array.from(el.attributes)) {
          if (attr.name.startsWith("on") || attr.name === "style") continue;
          attributes[attr.name] = attr.value;
        }

        const bounds = {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };

        const children: DOMNode[] = [];
        for (const child of Array.from(el.childNodes)) {
          const serialized = serializeVisibleNode(child);
          if (serialized) children.push(serialized);
        }

        let textContent: string | undefined;
        const directText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent?.trim())
          .filter(Boolean)
          .join(" ");
        if (directText) textContent = directText;

        return {
          nodeType: Node.ELEMENT_NODE,
          tagName,
          attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
          textContent,
          bounds,
          visible: true,
          children: children.length > 0 ? children : undefined,
        };
      }

      const body = document.body;
      if (!body) return [];

      const result: DOMNode[] = [];
      for (const child of Array.from(body.childNodes)) {
        const serialized = serializeVisibleNode(child);
        if (serialized) result.push(serialized);
      }
      return result;
    });
  }
}
