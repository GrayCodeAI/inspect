// ──────────────────────────────────────────────────────────────────────────────
// FrameRegistry - Discover and manage frames/iframes in a page
// ──────────────────────────────────────────────────────────────────────────────

import type { Page, Frame } from "playwright";
import type { FrameInfo, DOMNode } from "@inspect/shared";
import { DOMCapture } from "./capture.js";

/**
 * Discovers all frames in a page (including nested iframes), builds a frame
 * hierarchy tree, and provides cross-frame XPath stitching and multi-frame
 * DOM capture.
 */
export class FrameRegistry {
  private frameMap: Map<string, Frame> = new Map();
  private frameTree: FrameInfo | null = null;
  private domCapture: DOMCapture;

  constructor() {
    this.domCapture = new DOMCapture();
  }

  /**
   * Discover all frames in the page, including nested iframes.
   * Builds internal frame map and tree.
   */
  async discoverFrames(page: Page): Promise<FrameInfo> {
    this.frameMap.clear();
    const mainFrame = page.mainFrame();
    this.frameTree = await this.buildFrameInfo(mainFrame);
    return this.frameTree;
  }

  /**
   * Get the complete frame hierarchy tree.
   */
  getFullFrameTree(): FrameInfo | null {
    return this.frameTree;
  }

  /**
   * Get a flat list of all frame IDs.
   */
  listAllFrameIds(): string[] {
    return [...this.frameMap.keys()];
  }

  /**
   * Get a Frame by its ID.
   */
  getFrame(frameId: string): Frame | undefined {
    return this.frameMap.get(frameId);
  }

  /**
   * Stitch a local XPath with its frame context to create a cross-frame XPath.
   * Format: frame[frameId]//localPath
   */
  stitchXPath(frameId: string, localPath: string): string {
    if (!this.frameMap.has(frameId)) {
      throw new Error(`Frame "${frameId}" not found.`);
    }

    // If it's the main frame, return the path as-is
    const frame = this.frameMap.get(frameId)!;
    if (frame === frame.page().mainFrame()) {
      return localPath;
    }

    // Build the frame chain from child to main
    const chain: string[] = [];
    let current: Frame | null = frame;
    while (current && current !== current.page().mainFrame()) {
      const parent = current.parentFrame();
      if (parent) {
        // Find the iframe element in the parent that contains this frame
        const frameName = current.name() || current.url();
        chain.unshift(`iframe[name="${frameName}"]`);
      }
      current = parent;
    }

    if (chain.length === 0) return localPath;

    return `${chain.join("//")}${localPath}`;
  }

  /**
   * Capture DOM snapshots from all discovered frames.
   * Returns a map of frameId -> DOMNode[].
   */
  async captureAllFrames(): Promise<Map<string, DOMNode[]>> {
    const results = new Map<string, DOMNode[]>();

    for (const [frameId, frame] of this.frameMap) {
      try {
        // Use the frame as a page-like object for DOM capture
        const nodes = await frame.evaluate(() => {
          function serializeNode(node: Node): {
            nodeType: number;
            tagName?: string;
            attributes?: Record<string, string>;
            textContent?: string;
            bounds?: { x: number; y: number; width: number; height: number };
            visible?: boolean;
            children?: ReturnType<typeof serializeNode>[];
          } | null {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent?.trim();
              if (!text) return null;
              return { nodeType: Node.TEXT_NODE, textContent: text };
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return null;

            const el = node as HTMLElement;
            const tagName = el.tagName.toLowerCase();
            if (["script", "style", "noscript", "meta", "link"].includes(tagName)) return null;

            const attributes: Record<string, string> = {};
            for (const attr of Array.from(el.attributes)) {
              if (attr.name.startsWith("on") || attr.name === "style") continue;
              attributes[attr.name] = attr.value;
            }

            const rect = el.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(el);
            const visible =
              computedStyle.display !== "none" &&
              computedStyle.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0;

            const children: NonNullable<ReturnType<typeof serializeNode>>[] = [];
            for (const child of Array.from(el.childNodes)) {
              const s = serializeNode(child);
              if (s) children.push(s);
            }

            return {
              nodeType: Node.ELEMENT_NODE,
              tagName,
              attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
              textContent: el.textContent?.trim()?.slice(0, 200) || undefined,
              bounds: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
              visible,
              children: children.length > 0 ? children : undefined,
            };
          }

          const body = document.body;
          if (!body) return [];
          const result: NonNullable<ReturnType<typeof serializeNode>>[] = [];
          for (const child of Array.from(body.childNodes)) {
            const s = serializeNode(child);
            if (s) result.push(s);
          }
          return result;
        });

        results.set(frameId, nodes as DOMNode[]);
      } catch {
        // Frame may have been detached or navigated — skip it
        results.set(frameId, []);
      }
    }

    return results;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async buildFrameInfo(frame: Frame, parentId?: string): Promise<FrameInfo> {
    const id = this.generateFrameId(frame);
    this.frameMap.set(id, frame);

    const childFrames = frame.childFrames();
    const children: FrameInfo[] = [];
    for (const child of childFrames) {
      children.push(await this.buildFrameInfo(child, id));
    }

    return {
      id,
      name: frame.name() || "(main)",
      url: frame.url(),
      parentId,
      children,
    };
  }

  private generateFrameId(frame: Frame): string {
    const name = frame.name();
    const url = frame.url();
    // Create a stable ID from name + URL hash
    if (name) return `frame:${name}`;
    // Use a simple hash of the URL
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return `frame:${Math.abs(hash).toString(36)}`;
  }
}
