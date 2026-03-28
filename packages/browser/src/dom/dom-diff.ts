// ============================================================================
// @inspect/browser - DOM Diff
//
// Captures DOM state before and after an action, computes the diff,
// and returns only the new/changed elements. Used for two-step actions
// (click dropdown → see new options → select one).
// Inspired by Stagehand's diffCombinedTrees.
// ============================================================================

import type { Page } from "playwright";

export interface DOMDiffResult {
  /** New elements that appeared */
  added: DiffElement[];
  /** Elements that were removed */
  removed: DiffElement[];
  /** Elements whose text/attributes changed */
  changed: DiffElement[];
  /** Whether the page URL changed */
  urlChanged: boolean;
  /** New URL if changed */
  newUrl?: string;
  /** Summary for LLM context */
  summary: string;
}

export interface DiffElement {
  tagName: string;
  role?: string;
  text?: string;
  attributes?: Record<string, string>;
  xpath?: string;
}

/**
 * DOMDiff captures before/after snapshots and computes what changed.
 */
export class DOMDiff {
  private beforeSnapshot: string | null = null;
  private beforeUrl: string | null = null;

  /**
   * Capture the "before" state.
   */
  async captureBefore(page: Page): Promise<void> {
    this.beforeUrl = page.url();
    this.beforeSnapshot = await page.evaluate(() => {
      const els: string[] = [];
      const walk = (node: Element, depth: number) => {
        if (depth > 5) return;
        const tag = node.tagName?.toLowerCase() ?? "";
        if (["script", "style", "noscript", "meta", "link"].includes(tag)) return;

        const text = node.textContent?.trim().slice(0, 100) ?? "";
        const role = node.getAttribute("role") ?? "";
        const ariaLabel = node.getAttribute("aria-label") ?? "";
        const id = node.id ? `#${node.id}` : "";
        const cls = node.className ? `.${String(node.className).split(" ")[0]}` : "";

        if (text || role || tag === "input" || tag === "button" || tag === "a" || tag === "select") {
          els.push(`${tag}${id}${cls}|${role}|${ariaLabel}|${text.slice(0, 50)}`);
        }

        for (const child of node.children) {
          walk(child, depth + 1);
        }
      };
      walk(document.body, 0);
      return els.join("\n");
    });
  }

  /**
   * Capture the "after" state and compute the diff.
   */
  async captureAfter(page: Page): Promise<DOMDiffResult> {
    const afterUrl = page.url();
    const afterSnapshot = await page.evaluate(() => {
      const els: string[] = [];
      const walk = (node: Element, depth: number) => {
        if (depth > 5) return;
        const tag = node.tagName?.toLowerCase() ?? "";
        if (["script", "style", "noscript", "meta", "link"].includes(tag)) return;

        const text = node.textContent?.trim().slice(0, 100) ?? "";
        const role = node.getAttribute("role") ?? "";
        const ariaLabel = node.getAttribute("aria-label") ?? "";
        const id = node.id ? `#${node.id}` : "";
        const cls = node.className ? `.${String(node.className).split(" ")[0]}` : "";

        if (text || role || tag === "input" || tag === "button" || tag === "a" || tag === "select") {
          els.push(`${tag}${id}${cls}|${role}|${ariaLabel}|${text.slice(0, 50)}`);
        }

        for (const child of node.children) {
          walk(child, depth + 1);
        }
      };
      walk(document.body, 0);
      return els.join("\n");
    });

    const beforeLines = new Set((this.beforeSnapshot ?? "").split("\n").filter(Boolean));
    const afterLines = new Set(afterSnapshot.split("\n").filter(Boolean));

    const added: DiffElement[] = [];
    const removed: DiffElement[] = [];

    for (const line of afterLines) {
      if (!beforeLines.has(line)) {
        added.push(this.parseDiffLine(line));
      }
    }

    for (const line of beforeLines) {
      if (!afterLines.has(line)) {
        removed.push(this.parseDiffLine(line));
      }
    }

    const urlChanged = afterUrl !== this.beforeUrl;

    const summaryParts: string[] = [];
    if (added.length > 0) summaryParts.push(`${added.length} new elements appeared`);
    if (removed.length > 0) summaryParts.push(`${removed.length} elements removed`);
    if (urlChanged) summaryParts.push(`URL changed to ${afterUrl}`);
    if (summaryParts.length === 0) summaryParts.push("No visible changes detected");

    return {
      added,
      removed,
      changed: [],
      urlChanged,
      newUrl: urlChanged ? afterUrl : undefined,
      summary: summaryParts.join(". "),
    };
  }

  private parseDiffLine(line: string): DiffElement {
    const [tagPart, role, ariaLabel, text] = line.split("|");
    const tagName = (tagPart ?? "").replace(/[#.].*/, "");
    return {
      tagName,
      role: role || undefined,
      text: (ariaLabel || text || "").trim() || undefined,
    };
  }
}
