/**
 * Hybrid DOM + Accessibility Snapshot
 *
 * Combines DOM tree with accessibility tree for rich element understanding.
 * Inspired by Stagehand and Skyvern patterns.
 */

import type { Page } from "playwright";

export interface HybridSnapshotConfig {
  /** Include accessibility attributes */
  includeA11y: boolean;
  /** Include computed styles */
  includeStyles: boolean;
  /** Include element positions */
  includePositions: boolean;
  /** Max depth to traverse */
  maxDepth: number;
  /** Filter visible elements only */
  visibleOnly: boolean;
  /** Minimum element size to include (px) */
  minElementSize: number;
  /** Include interactive elements only */
  interactiveOnly: boolean;
}

export interface HybridNode {
  /** Unique element ID */
  id: string;
  /** DOM tag name */
  tag: string;
  /** Element role from ARIA or semantic */
  role?: string;
  /** Accessible name */
  name?: string;
  /** Accessible description */
  description?: string;
  /** Element text content */
  text?: string;
  /** ARIA attributes */
  ariaAttributes: Record<string, string>;
  /** DOM attributes */
  domAttributes: Record<string, string>;
  /** Computed styles (if enabled) */
  styles?: Record<string, string>;
  /** Element position and size */
  bbox?: BoundingBox;
  /** Whether element is visible */
  visible: boolean;
  /** Whether element is interactive */
  interactive: boolean;
  /** Child nodes */
  children: HybridNode[];
  /** Parent node ID */
  parentId?: string;
  /** Depth in tree */
  depth: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HybridSnapshot {
  /** Root node */
  root: HybridNode;
  /** All nodes flattened by ID */
  nodeMap: Map<string, HybridNode>;
  /** Interactive elements list */
  interactiveElements: HybridNode[];
  /** Form elements */
  formElements: HybridNode[];
  /** Clickable elements */
  clickableElements: HybridNode[];
  /** Metadata */
  metadata: {
    url: string;
    title: string;
    timestamp: number;
    totalNodes: number;
    visibleNodes: number;
    interactiveNodes: number;
  };
}

export const DEFAULT_HYBRID_CONFIG: HybridSnapshotConfig = {
  includeA11y: true,
  includeStyles: false,
  includePositions: true,
  maxDepth: 10,
  visibleOnly: false,
  minElementSize: 5,
  interactiveOnly: false,
};

const INTERACTIVE_ROLES = [
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "menu",
  "menuitem",
  "tab",
  "tabpanel",
  "searchbox",
  "spinbutton",
  "switch",
  "slider",
];

const INTERACTIVE_TAGS = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "details",
  "summary",
];

/**
 * Hybrid Snapshot Builder
 *
 * Combines CDP DOM snapshot with accessibility tree for comprehensive
 * element understanding.
 */
export class HybridSnapshotBuilder {
  private config: HybridSnapshotConfig;
  private nodeCounter = 0;
  private nodeMap = new Map<string, HybridNode>();

  constructor(config: Partial<HybridSnapshotConfig> = {}) {
    this.config = { ...DEFAULT_HYBRID_CONFIG, ...config };
  }

  /**
   * Build hybrid snapshot from page
   */
  async build(page: Page): Promise<HybridSnapshot> {
    this.nodeCounter = 0;
    this.nodeMap.clear();

    // Get accessibility tree via CDP
    const client = await page.context().newCDPSession(page);
    const { nodes: a11yNodes } = await client.send("Accessibility.getFullAXTree");

    // Build accessibility node lookup
    const a11yMap = new Map<string, AccessibilityNode>();
    for (const node of a11yNodes) {
      if (node.backendDOMNodeId) {
        a11yMap.set(String(node.backendDOMNodeId), node as unknown as AccessibilityNode);
      }
    }

    // Build hybrid tree starting from body
    const root = await this.buildHybridTree(page, a11yMap);

    // Collect element categories
    const interactiveElements: HybridNode[] = [];
    const formElements: HybridNode[] = [];
    const clickableElements: HybridNode[] = [];

    for (const node of this.nodeMap.values()) {
      if (node.interactive) {
        interactiveElements.push(node);
        if (["input", "select", "textarea"].includes(node.tag)) {
          formElements.push(node);
        }
        if (node.tag === "button" || node.role === "button" || node.tag === "a") {
          clickableElements.push(node);
        }
      }
    }

    const metadata = {
      url: page.url(),
      title: await page.title(),
      timestamp: Date.now(),
      totalNodes: this.nodeMap.size,
      visibleNodes: Array.from(this.nodeMap.values()).filter((n) => n.visible).length,
      interactiveNodes: interactiveElements.length,
    };

    await client.detach();

    return {
      root,
      nodeMap: this.nodeMap,
      interactiveElements,
      formElements,
      clickableElements,
      metadata,
    };
  }

  /**
   * Build hybrid tree recursively
   */
  private async buildHybridTree(
    page: Page,
    a11yMap: Map<string, AccessibilityNode>,
    elementHandle?: any,
    depth = 0,
    parentId?: string
  ): Promise<HybridNode> {
    const id = `node-${++this.nodeCounter}`;

    // Get element info via Playwright
    const handle = elementHandle || (await page.locator("body").elementHandle());

    // Extract DOM and accessibility info
    const elementInfo = await handle.evaluate((el: Element) => {
      const rect = el.getBoundingClientRect();
      const computed = window.getComputedStyle(el);

      // Get ARIA attributes
      const ariaAttributes: Record<string, string> = {};
      for (const attr of el.attributes) {
        if (attr.name.startsWith("aria-")) {
          ariaAttributes[attr.name] = attr.value;
        }
      }

      // Get relevant DOM attributes
      const domAttributes: Record<string, string> = {};
      const relevantAttrs = ["id", "class", "name", "type", "placeholder", "value", "href", "src", "alt", "title"];
      for (const attr of relevantAttrs) {
        const val = el.getAttribute(attr);
        if (val) domAttributes[attr] = val;
      }

      // Check visibility
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        computed.visibility !== "hidden" &&
        computed.display !== "none";

      // Check interactivity
      const interactive =
        el.tagName.toLowerCase() === "button" ||
        el.tagName.toLowerCase() === "a" ||
        el.tagName.toLowerCase() === "input" ||
        el.tagName.toLowerCase() === "select" ||
        el.tagName.toLowerCase() === "textarea" ||
        el.hasAttribute("role") ||
        el.hasAttribute("tabindex");

      return {
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.slice(0, 200),
        ariaAttributes,
        domAttributes,
        styles: {
          display: computed.display,
          visibility: computed.visibility,
          position: computed.position,
        },
        bbox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        visible,
        interactive,
      };
    });

    // Merge with accessibility info if available
    const a11yInfo = await this.getAccessibilityInfo(handle, a11yMap);

    const node: HybridNode = {
      id,
      tag: elementInfo.tag,
      role: a11yInfo?.role,
      name: a11yInfo?.name,
      description: a11yInfo?.description,
      text: elementInfo.text,
      ariaAttributes: elementInfo.ariaAttributes,
      domAttributes: elementInfo.domAttributes,
      styles: this.config.includeStyles ? elementInfo.styles : undefined,
      bbox: this.config.includePositions ? elementInfo.bbox : undefined,
      visible: elementInfo.visible,
      interactive: this.isInteractive(elementInfo.tag, a11yInfo?.role, elementInfo.domAttributes),
      children: [],
      parentId,
      depth,
    };

    this.nodeMap.set(id, node);

    // Recursively process children
    if (depth < this.config.maxDepth) {
      const childHandles = await handle.locator(
        ":scope > *:not(script):not(style):not(noscript)"
      ).elementHandles();

      for (const childHandle of childHandles.slice(0, 50)) {
        // Limit children
        const childNode = await this.buildHybridTree(
          page,
          a11yMap,
          childHandle,
          depth + 1,
          id
        );
        node.children.push(childNode);
      }
    }

    return node;
  }

  /**
   * Get accessibility info for element
   */
  private async getAccessibilityInfo(
    handle: any,
    a11yMap: Map<string, AccessibilityNode>
  ): Promise<{ role?: string; name?: string; description?: string } | null> {
    try {
      // Try to get backend node ID
      const nodeId = await handle.evaluate((el: Element) => {
        // This would need CDP access to get actual backend node ID
        // For now, return null and rely on ARIA attributes
        return null;
      });

      if (nodeId && a11yMap.has(String(nodeId))) {
        const a11yNode = a11yMap.get(String(nodeId))!;
        return {
          role: a11yNode.role?.value,
          name: a11yNode.name?.value,
          description: a11yNode.description?.value,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Determine if element is interactive
   */
  private isInteractive(
    tag: string,
    role?: string,
    domAttributes?: Record<string, string>
  ): boolean {
    if (INTERACTIVE_TAGS.includes(tag)) return true;
    if (role && INTERACTIVE_ROLES.includes(role)) return true;
    if (domAttributes?.tabindex && domAttributes.tabindex !== "-1") return true;
    if (domAttributes?.onclick) return true;
    return false;
  }

  /**
   * Find element by ID
   */
  findById(snapshot: HybridSnapshot, id: string): HybridNode | undefined {
    return snapshot.nodeMap.get(id);
  }

  /**
   * Find elements by role
   */
  findByRole(snapshot: HybridSnapshot, role: string): HybridNode[] {
    return Array.from(snapshot.nodeMap.values()).filter((n) => n.role === role);
  }

  /**
   * Find elements by text content
   */
  findByText(snapshot: HybridSnapshot, text: string): HybridNode[] {
    const lowerText = text.toLowerCase();
    return Array.from(snapshot.nodeMap.values()).filter(
      (n) =>
        n.text?.toLowerCase().includes(lowerText) ||
        n.name?.toLowerCase().includes(lowerText)
    );
  }

  /**
   * Get element path (breadcrumb)
   */
  getPath(snapshot: HybridSnapshot, nodeId: string): string[] {
    const path: string[] = [];
    let current = snapshot.nodeMap.get(nodeId);

    while (current) {
      path.unshift(current.name || current.text?.slice(0, 30) || current.tag);
      if (current.parentId) {
        current = snapshot.nodeMap.get(current.parentId);
      } else {
        break;
      }
    }

    return path;
  }

  /**
   * Export snapshot to various formats
   */
  export(snapshot: HybridSnapshot, format: "json" | "yaml" | "markdown"): string {
    switch (format) {
      case "json":
        return JSON.stringify(
          {
            metadata: snapshot.metadata,
            interactiveElements: snapshot.interactiveElements.map((n) => ({
              id: n.id,
              tag: n.tag,
              role: n.role,
              name: n.name,
              text: n.text?.slice(0, 100),
              bbox: n.bbox,
            })),
          },
          null,
          2
        );

      case "markdown":
        const lines: string[] = [
          `# Page Snapshot: ${snapshot.metadata.title}`,
          ``,
          `**URL:** ${snapshot.metadata.url}`,
          `**Total Nodes:** ${snapshot.metadata.totalNodes}`,
          `**Interactive Elements:** ${snapshot.metadata.interactiveNodes}`,
          ``,
          `## Interactive Elements`,
          ``,
        ];

        for (const el of snapshot.interactiveElements.slice(0, 30)) {
          lines.push(`- **${el.tag}**${el.role ? ` (${el.role})` : ""}: ${el.name || el.text?.slice(0, 50) || "[no text]"}`);
        }

        return lines.join("\n");

      default:
        return "yaml export not implemented";
    }
  }
}

interface AccessibilityNode {
  nodeId: string;
  backendDOMNodeId?: number;
  role?: { value: string };
  name?: { value: string };
  description?: { value: string };
}

/**
 * Convenience function
 */
export async function captureHybridSnapshot(
  page: Page,
  config?: Partial<HybridSnapshotConfig>
): Promise<HybridSnapshot> {
  const builder = new HybridSnapshotBuilder(config);
  return builder.build(page);
}
