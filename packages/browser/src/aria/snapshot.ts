// ──────────────────────────────────────────────────────────────────────────────
// AriaSnapshotBuilder - High-level ARIA snapshot with ref IDs and stats
// ──────────────────────────────────────────────────────────────────────────────

import type { Page, Locator } from "playwright";
import type { ElementSnapshot, HybridNode, SnapshotStats } from "@inspect/shared";
import { AriaTree } from "./tree.js";
import { RefManager } from "./refs.js";
import { HybridTree } from "../dom/hybrid.js";
import { DOMCapture } from "../dom/capture.js";

/**
 * Builds a complete ARIA accessibility snapshot of a page with:
 * - Reference IDs (e1, e2, ...) for each element
 * - Interactive element filtering
 * - Tree compaction (collapse empty wrappers)
 * - Token estimation for LLM context budgeting
 * - Locator resolution from ref strings
 */
export class AriaSnapshotBuilder {
  private refManager: RefManager;
  private ariaTree: AriaTree;
  private lastTree: ElementSnapshot[] = [];
  private lastFormatted = "";

  constructor() {
    this.refManager = new RefManager();
    this.ariaTree = new AriaTree(this.refManager);
  }

  /**
   * Build the full ARIA tree for the page.
   * Assigns ref IDs, filters out noise, and compacts the tree.
   */
  async buildTree(page: Page): Promise<ElementSnapshot[]> {
    this.refManager.clear();
    const rawTree = await this.ariaTree.build(page);
    this.lastTree = this.compact(rawTree);
    this.lastFormatted = this.ariaTree.format(this.lastTree);
    return this.lastTree;
  }

  /**
   * Build a hybrid tree that merges ARIA + DOM for richer context.
   * Use this when mode="hybrid" for Stagehand-style dual-source snapshots.
   */
  async buildHybridTree(page: Page): Promise<{ tree: HybridNode[]; formatted: string }> {
    // Build ARIA tree
    this.refManager.clear();
    const ariaTree = await this.ariaTree.build(page);
    this.lastTree = this.compact(ariaTree);

    // Capture DOM tree
    const domCapture = new DOMCapture();
    const domTree = await domCapture.captureDOM(page);

    // Merge using HybridTree
    const hybridTree = new HybridTree();
    const merged = hybridTree.merge(this.lastTree, domTree);

    // Format for LLM consumption
    const lines: string[] = [];
    for (const node of merged) {
      const tag = node.tagName ? `(${node.tagName})` : "";
      const name = node.name ? ` "${node.name}"` : "";
      const interactive = node.interactive ? " [interactive]" : "";
      lines.push(`[${node.ref}] ${node.role}${tag}${name}${interactive}`);
    }
    const formatted = lines.join("\n");

    this.lastFormatted = formatted;
    return { tree: merged, formatted };
  }

  /**
   * Get only interactive elements from the last snapshot.
   */
  getInteractiveElements(): ElementSnapshot[] {
    return this.ariaTree.filter(this.lastTree, (node) => node.interactable);
  }

  /**
   * Get the formatted string representation of the last snapshot.
   */
  getFormattedTree(): string {
    return this.lastFormatted;
  }

  /**
   * Resolve a ref string (e.g. "e5") to a Playwright Locator.
   */
  getRefLocator(page: Page, ref: string): Locator {
    return this.refManager.resolveLocator(page, ref);
  }

  /**
   * Get the ElementSnapshot for a ref.
   */
  getRefElement(ref: string): ElementSnapshot | undefined {
    return this.refManager.getElement(ref);
  }

  /**
   * Get statistics about the last snapshot.
   */
  getStats(): SnapshotStats {
    const formatted = this.lastFormatted;
    const lines = formatted.split("\n").filter((l) => l.trim().length > 0);
    const charCount = formatted.length;
    // Rough token estimation: ~4 chars per token for English text
    const tokenEstimate = Math.ceil(charCount / 4);
    const allRefs = this.refManager.getAllRefs();
    const interactiveCount = this.countInteractive(this.lastTree);

    return {
      lineCount: lines.length,
      charCount,
      tokenEstimate,
      refCount: allRefs.length,
      interactiveCount,
    };
  }

  /**
   * Get the underlying RefManager.
   */
  getRefManager(): RefManager {
    return this.refManager;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Compact/collapse the tree by removing wrapper nodes that add no semantic value.
   * - Nodes with role "generic"/"none"/"presentation" and no name are collapsed
   * - Single-child wrappers are flattened
   */
  private compact(tree: ElementSnapshot[]): ElementSnapshot[] {
    const result: ElementSnapshot[] = [];

    for (const node of tree) {
      const compactedChildren = node.children ? this.compact(node.children) : undefined;

      // Skip generic wrappers with no name — promote their children
      if (this.isGenericWrapper(node) && compactedChildren && compactedChildren.length > 0) {
        result.push(...compactedChildren);
        continue;
      }

      // Collapse single-child generic wrappers
      if (
        this.isGenericWrapper(node) &&
        compactedChildren &&
        compactedChildren.length === 1
      ) {
        result.push(compactedChildren[0]);
        continue;
      }

      result.push({
        ...node,
        children: compactedChildren && compactedChildren.length > 0 ? compactedChildren : undefined,
      });
    }

    return result;
  }

  private isGenericWrapper(node: ElementSnapshot): boolean {
    const genericRoles = new Set(["generic", "none", "presentation"]);
    return genericRoles.has(node.role) && !node.name && !node.interactable;
  }

  private countInteractive(tree: ElementSnapshot[]): number {
    let count = 0;
    for (const node of tree) {
      if (node.interactable) count++;
      if (node.children) count += this.countInteractive(node.children);
    }
    return count;
  }
}
