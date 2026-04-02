/**
 * Multi-Tree DOM Collection
 *
 * Collects DOM + Accessibility + Snapshot trees in parallel
 * for comprehensive page understanding.
 *
 * Pattern: Skyvern/Stagehand hybrid snapshot approach
 */

import type { Page, CDPSession } from "playwright";

export interface MultiTreeCollection {
  /** DOM tree */
  dom: DOMTreeNode;
  /** Accessibility tree */
  accessibility: AXTreeNode;
  /** DOM snapshot (layout, paint order) */
  snapshot: DOMSnapshot;
  /** Timestamp */
  timestamp: number;
  /** Collection duration */
  duration: number;
}

export interface DOMTreeNode {
  nodeId: number;
  nodeType: number;
  nodeName: string;
  nodeValue?: string;
  attributes?: Record<string, string>;
  children: DOMTreeNode[];
  backendNodeId?: number;
}

export interface AXTreeNode {
  nodeId: string;
  role?: string;
  name?: string;
  value?: string;
  description?: string;
  properties?: Record<string, unknown>;
  children: AXTreeNode[];
  backendDOMNodeId?: number;
}

export interface DOMSnapshot {
  /** Document URL */
  documentURL: string;
  /** Document title */
  title: string;
  /** Base URL */
  baseURL: string;
  /** Layout tree nodes */
  layoutTreeNodes: LayoutTreeNode[];
  /** Computed styles */
  computedStyles: ComputedStyle[];
  /** Paint order */
  paintOrder: number[];
}

export interface LayoutTreeNode {
  nodeIndex: number;
  styles: number[];
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  visible: boolean;
}

export interface ComputedStyle {
  properties: Array<{
    name: string;
    value: string;
  }>;
}

export interface EnhancedElement {
  /** Unique identifier */
  id: string;
  /** DOM tag name */
  tagName: string;
  /** ARIA role */
  role?: string;
  /** Accessible name */
  name?: string;
  /** Element text content */
  text?: string;
  /** Element bounds */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Whether visible */
  isVisible: boolean;
  /** Whether interactable */
  isInteractable: boolean;
  /** CSS selector */
  selector: string;
  /** XPath */
  xpath: string;
  /** Computed styles */
  computedStyles: Record<string, string>;
  /** DOM source */
  domSource: DOMTreeNode;
  /** AX source */
  axSource?: AXTreeNode;
  /** Children */
  children: EnhancedElement[];
}

export interface MultiTreeConfig {
  /** Maximum depth to traverse */
  maxDepth: number;
  /** Maximum nodes to collect */
  maxNodes: number;
  /** Include hidden elements */
  includeHidden: boolean;
  /** Include computed styles */
  includeStyles: boolean;
  /** Timeout for collection (ms) */
  timeout: number;
}

export const DEFAULT_MULTI_TREE_CONFIG: MultiTreeConfig = {
  maxDepth: 10,
  maxNodes: 1000,
  includeHidden: false,
  includeStyles: true,
  timeout: 10000,
};

/**
 * Multi-Tree DOM Collector
 */
export class MultiTreeCollector {
  private config: MultiTreeConfig;

  constructor(config: Partial<MultiTreeConfig> = {}) {
    this.config = { ...DEFAULT_MULTI_TREE_CONFIG, ...config };
  }

  /**
   * Collect all trees in parallel
   */
  async collect(page: Page): Promise<MultiTreeCollection> {
    const startTime = Date.now();

    // Get CDP session
    const cdpSession = await page.context().newCDPSession(page);

    try {
      // Collect all three trees in parallel with timeout
      const [dom, accessibility, snapshot] = await Promise.all([
        this.collectDOMTree(cdpSession),
        this.collectAXTree(cdpSession),
        this.collectDOMSnapshot(cdpSession),
      ]);

      return {
        dom,
        accessibility,
        snapshot,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      };
    } finally {
      await cdpSession.detach();
    }
  }

  /**
   * Collect DOM tree via CDP
   */
  private async collectDOMTree(cdpSession: CDPSession): Promise<DOMTreeNode> {
    // Get document root
    const { root } = await cdpSession.send("DOM.getDocument", {
      depth: this.config.maxDepth,
      pierce: true,
    });

    return this.convertDOMNode(root);
  }

  /**
   * Convert CDP DOM node to our format
   */
  private convertDOMNode(node: unknown): DOMTreeNode {
    const n = node as {
      nodeId: number;
      nodeType: number;
      nodeName: string;
      nodeValue?: string;
      attributes?: string[];
      children?: unknown[];
      backendNodeId?: number;
    };

    // Convert attributes array to record
    const attributes: Record<string, string> = {};
    if (n.attributes) {
      for (let i = 0; i < n.attributes.length; i += 2) {
        attributes[n.attributes[i]] = n.attributes[i + 1];
      }
    }

    return {
      nodeId: n.nodeId,
      nodeType: n.nodeType,
      nodeName: n.nodeName,
      nodeValue: n.nodeValue,
      attributes,
      children: (n.children || []).map((c) => this.convertDOMNode(c)),
      backendNodeId: n.backendNodeId,
    };
  }

  /**
   * Collect accessibility tree via CDP
   */
  private async collectAXTree(cdpSession: CDPSession): Promise<AXTreeNode> {
    // Get full accessibility tree
    const { nodes } = await cdpSession.send("Accessibility.queryAXTree", {
      // Get root node
    });

    // Find root node - cast as any to avoid strict role type issues
    const rootNode = (nodes as any[]).find((n: any) => !n.role);
    if (!rootNode) {
      return { nodeId: "root", children: [] };
    }

    return this.convertAXNode(rootNode, nodes);
  }

  /**
   * Convert CDP AX node to our format
   */
  private convertAXNode(
    node: unknown,
    allNodes: unknown[]
  ): AXTreeNode {
    const n = node as {
      nodeId: string;
      role?: string;
      name?: string;
      value?: string;
      description?: string;
      properties?: unknown[];
      childIds?: string[];
      backendDOMNodeId?: number;
    };

    // Build children from childIds
    const children: AXTreeNode[] = [];
    if (n.childIds) {
      for (const childId of n.childIds) {
        const childNode = (allNodes as Array<{ nodeId: string }>).find(
          (node) => node.nodeId === childId
        );
        if (childNode) {
          children.push(this.convertAXNode(childNode, allNodes));
        }
      }
    }

    return {
      nodeId: n.nodeId,
      role: n.role,
      name: n.name,
      value: n.value,
      description: n.description,
      properties: this.convertAXProperties(n.properties),
      children,
      backendDOMNodeId: n.backendDOMNodeId,
    };
  }

  /**
   * Convert AX properties
   */
  private convertAXProperties(
    properties?: unknown[]
  ): Record<string, unknown> {
    if (!properties) return {};

    const result: Record<string, unknown> = {};
    for (const prop of properties) {
      const p = prop as { name: string; value?: unknown };
      if (p.name && p.value !== undefined) {
        result[p.name] = p.value;
      }
    }
    return result;
  }

  /**
   * Collect DOM snapshot via CDP
   */
  private async collectDOMSnapshot(
    cdpSession: CDPSession
  ): Promise<DOMSnapshot> {
    const snapshot = await cdpSession.send("DOMSnapshot.captureSnapshot", {
      computedStyles: this.config.includeStyles
        ? ["display", "visibility", "opacity", "position", "z-index"]
        : [],
    });

    // Handle CDP response structure
    const layoutTreeNodes = (snapshot as any).layoutTreeNodes || [];
    const computedStyles = (snapshot as any).computedStyles || [];

    return {
      documentURL: snapshot.strings[snapshot.documents[0].documentURL],
      title: snapshot.strings[snapshot.documents[0].title],
      baseURL: snapshot.strings[snapshot.documents[0].baseURL],
      layoutTreeNodes: layoutTreeNodes.map(
        (node: {
          nodeIndex: number;
          styles: number[];
          bounds: number[];
        }) => ({
          nodeIndex: node.nodeIndex,
          styles: node.styles,
          bounds: {
            x: node.bounds[0],
            y: node.bounds[1],
            width: node.bounds[2],
            height: node.bounds[3],
          },
          visible: true,
        })
      ),
      computedStyles: computedStyles.map(
        (style: { properties: Array<{ name: number; value: number }> }) => ({
          properties: style.properties.map((p) => ({
            name: snapshot.strings[p.name],
            value: snapshot.strings[p.value],
          })),
        })
      ),
      paintOrder: layoutTreeNodes.map(
        (_n: unknown, i: number) => i
      ),
    };
  }

  /**
   * Build enhanced element tree by merging all sources
   */
  buildEnhancedTree(collection: MultiTreeCollection): EnhancedElement[] {
    const elements: EnhancedElement[] = [];
    let idCounter = 1;

    // Walk DOM tree and merge with AX data
    const walkDOM = (
      node: DOMTreeNode,
      depth: number,
      parent?: EnhancedElement
    ): EnhancedElement | undefined => {
      if (depth > this.config.maxDepth) return undefined;
      if (elements.length >= this.config.maxNodes) return undefined;

      // Find matching AX node
      const axNode = this.findMatchingAXNode(node, collection.accessibility);

      // Get layout data
      const layoutNode = collection.snapshot.layoutTreeNodes.find(
        (n) => n.nodeIndex === node.nodeId
      );

      // Skip hidden elements if configured
      if (!this.config.includeHidden && layoutNode && !layoutNode.visible) {
        return undefined;
      }

      // Get computed styles
      const computedStyles: Record<string, string> = {};
      if (layoutNode && this.config.includeStyles) {
        const style = collection.snapshot.computedStyles[layoutNode.styles[0]];
        if (style) {
          for (const prop of style.properties) {
            computedStyles[prop.name] = prop.value;
          }
        }
      }

      // Build enhanced element
      const element: EnhancedElement = {
        id: `e${idCounter++}`,
        tagName: node.nodeName.toLowerCase(),
        role: axNode?.role,
        name: axNode?.name,
        text: node.nodeValue,
        bounds: layoutNode?.bounds || { x: 0, y: 0, width: 0, height: 0 },
        isVisible: layoutNode?.visible ?? true,
        isInteractable: this.isInteractable(node, axNode, computedStyles),
        selector: this.buildSelector(node),
        xpath: this.buildXPath(node),
        computedStyles,
        domSource: node,
        axSource: axNode,
        children: [],
      };

      // Process children
      for (const child of node.children) {
        const enhancedChild = walkDOM(child, depth + 1, element);
        if (enhancedChild) {
          element.children.push(enhancedChild);
        }
      }

      elements.push(element);
      return element;
    };

    walkDOM(collection.dom, 0);
    return elements;
  }

  /**
   * Find matching AX node for DOM node
   */
  private findMatchingAXNode(
    domNode: DOMTreeNode,
    axRoot: AXTreeNode
  ): AXTreeNode | undefined {
    // Match by backendNodeId if available
    if (domNode.backendNodeId) {
      const findByBackendId = (node: AXTreeNode): AXTreeNode | undefined => {
        if (node.backendDOMNodeId === domNode.backendNodeId) {
          return node;
        }
        for (const child of node.children) {
          const found = findByBackendId(child);
          if (found) return found;
        }
        return undefined;
      };

      const found = findByBackendId(axRoot);
      if (found) return found;
    }

    return undefined;
  }

  /**
   * Check if element is interactable
   */
  private isInteractable(
    domNode: DOMTreeNode,
    axNode?: AXTreeNode,
    computedStyles?: Record<string, string>
  ): boolean {
    // Check tag name
    const interactiveTags = [
      "a",
      "button",
      "input",
      "select",
      "textarea",
      "details",
      "summary",
    ];
    if (interactiveTags.includes(domNode.nodeName.toLowerCase())) {
      return true;
    }

    // Check ARIA role
    const interactiveRoles = [
      "button",
      "link",
      "textbox",
      "checkbox",
      "radio",
      "combobox",
      "listbox",
      "menuitem",
      "tab",
      "switch",
    ];
    if (axNode?.role && interactiveRoles.includes(axNode.role)) {
      return true;
    }

    // Check for click handlers (via attributes)
    if (domNode.attributes) {
      if (
        domNode.attributes.onclick ||
        domNode.attributes.onmousedown ||
        domNode.attributes.ontouchstart ||
        domNode.attributes.tabindex === "0"
      ) {
        return true;
      }
    }

    // Check cursor style
    if (computedStyles?.cursor === "pointer") {
      return true;
    }

    return false;
  }

  /**
   * Build CSS selector for element
   */
  private buildSelector(node: DOMTreeNode): string {
    const tag = node.nodeName.toLowerCase();

    // Try ID first
    if (node.attributes?.id) {
      return `#${node.attributes.id}`;
    }

    // Try classes
    if (node.attributes?.class) {
      const classes = node.attributes.class.split(" ").filter((c) => c);
      if (classes.length > 0) {
        return `${tag}.${classes.join(".")}`;
      }
    }

    return tag;
  }

  /**
   * Build XPath for element
   */
  private buildXPath(node: DOMTreeNode): string {
    // Simplified XPath generation
    return `//${node.nodeName.toLowerCase()}`;
  }

  /**
   * Serialize tree to string for LLM
   */
  serializeForLLM(elements: EnhancedElement[]): string {
    const lines: string[] = [];

    const serialize = (el: EnhancedElement, depth: number) => {
      const indent = "  ".repeat(depth);
      const type = el.role || el.tagName;
      const name = el.name || el.text?.slice(0, 30) || "";
      const visible = el.isVisible ? "" : " [hidden]";

      lines.push(`${indent}[${el.id}] ${type}: ${name}${visible}`);

      for (const child of el.children) {
        serialize(child, depth + 1);
      }
    };

    for (const el of elements.filter((e) => e.isVisible)) {
      serialize(el, 0);
    }

    return lines.join("\n");
  }
}
