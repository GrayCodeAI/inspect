// ──────────────────────────────────────────────────────────────────────────────
// AriaTree - Build and manipulate accessibility trees
// ──────────────────────────────────────────────────────────────────────────────

import type { Page } from "playwright";
import type { ElementSnapshot, HybridNode, DOMNode } from "@inspect/shared";
import { RefManager } from "./refs.js";

/** Raw node from Playwright's accessibility snapshot */
interface AXNode {
  role: string;
  name: string;
  value?: string;
  description?: string;
  keyshortcuts?: string;
  roledescription?: string;
  valuetext?: string;
  disabled?: boolean;
  expanded?: boolean;
  focused?: boolean;
  modal?: boolean;
  multiline?: boolean;
  multiselectable?: boolean;
  readonly?: boolean;
  required?: boolean;
  selected?: boolean;
  checked?: boolean | "mixed";
  pressed?: boolean | "mixed";
  level?: number;
  valuemin?: number;
  valuemax?: number;
  autocomplete?: string;
  haspopup?: string;
  invalid?: string;
  orientation?: string;
  children?: AXNode[];
}

/**
 * Builds, formats, filters, and merges ARIA accessibility trees.
 */
export class AriaTree {
  private refManager: RefManager;

  constructor(refManager?: RefManager) {
    this.refManager = refManager ?? new RefManager();
  }

  /**
   * Build an accessibility tree from the page using Playwright's accessibility API.
   */
  async build(page: Page): Promise<ElementSnapshot[]> {
    // Use CDP to get accessibility tree (page.accessibility was removed in newer Playwright)
    const cdp = await page.context().newCDPSession(page);
    try {
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');
      const snapshot = this.cdpNodesToAXTree(nodes);
      if (!snapshot) return [];

      this.refManager.clear();
      return this.processNode(snapshot as AXNode);
    } finally {
      await cdp.detach().catch(() => {});
    }
  }

  /**
   * Convert CDP Accessibility nodes into the legacy AXNode tree format.
   */
  private cdpNodesToAXTree(nodes: Array<{ nodeId: string; role?: { value?: string }; name?: { value?: string }; childIds?: string[]; parentId?: string }>): AXNode | null {
    if (!nodes || nodes.length === 0) return null;
    const map = new Map<string, AXNode>();
    for (const node of nodes) {
      map.set(node.nodeId, {
        role: node.role?.value ?? '',
        name: node.name?.value ?? '',
        children: [],
      });
    }
    let root: AXNode | null = null;
    for (const node of nodes) {
      const axNode = map.get(node.nodeId)!;
      if (node.childIds) {
        for (const childId of node.childIds) {
          const child = map.get(childId);
          if (child) axNode.children!.push(child);
        }
      }
      if (!node.parentId) root = axNode;
    }
    return root;
  }

  /**
   * Format a tree into a human/LLM-readable indented string representation.
   *
   * Example output:
   *   [e1] heading "Welcome to Inspect" (level=1)
   *     [e2] link "Get Started"
   *     [e3] paragraph "A powerful testing platform"
   */
  format(tree: ElementSnapshot[], depth: number = 0): string {
    const lines: string[] = [];
    const indent = "  ".repeat(depth);

    for (const node of tree) {
      let line = `${indent}[${node.ref}] ${node.role}`;
      if (node.name) {
        line += ` "${node.name}"`;
      }
      if (node.attributes) {
        const attrs = Object.entries(node.attributes)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        if (attrs) line += ` (${attrs})`;
      }
      if (node.interactable) {
        line += " *";
      }
      lines.push(line);

      if (node.children && node.children.length > 0) {
        lines.push(this.format(node.children, depth + 1));
      }
    }

    return lines.join("\n");
  }

  /**
   * Filter tree nodes by a predicate.
   */
  filter(tree: ElementSnapshot[], predicate: (node: ElementSnapshot) => boolean): ElementSnapshot[] {
    const result: ElementSnapshot[] = [];

    for (const node of tree) {
      const matches = predicate(node);
      const filteredChildren = node.children ? this.filter(node.children, predicate) : [];

      if (matches || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : undefined,
        });
      }
    }

    return result;
  }

  /**
   * Merge an ARIA tree with a DOM tree to create a hybrid representation.
   * This follows the Stagehand pattern of combining AX semantics with DOM position/selector data.
   */
  merge(ariaTree: ElementSnapshot[], domTree: DOMNode[]): HybridNode[] {
    const hybridNodes: HybridNode[] = [];
    const domFlat = this.flattenDOMTree(domTree);

    for (const ariaNode of this.flattenTree(ariaTree)) {
      // Find matching DOM node by text content or role heuristic
      const domMatch = domFlat.find(
        (d) =>
          d.textContent === ariaNode.textContent ||
          (d.tagName && this.roleMatchesTag(ariaNode.role, d.tagName)),
      );

      hybridNodes.push({
        ref: ariaNode.ref,
        role: ariaNode.role,
        name: ariaNode.name,
        tagName: domMatch?.tagName ?? ariaNode.tagName ?? "unknown",
        xpath: ariaNode.xpath || this.generateXPath(domMatch),
        cssSelector: ariaNode.cssSelector ?? this.generateCSSSelector(domMatch),
        bounds: domMatch?.bounds ?? ariaNode.bounds,
        interactive: ariaNode.interactable,
        visible: ariaNode.visible,
        textContent: ariaNode.textContent ?? domMatch?.textContent,
        attributes: {
          ...domMatch?.attributes,
          ...ariaNode.attributes,
        },
        ariaProperties: ariaNode.ariaProperties,
      });
    }

    return hybridNodes;
  }

  /** Get the ref manager used by this tree. */
  getRefManager(): RefManager {
    return this.refManager;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private processNode(node: AXNode, depth: number = 0): ElementSnapshot[] {
    const results: ElementSnapshot[] = [];

    // Skip generic/empty nodes at depth > 0
    if (depth > 0 && this.isSkippableNode(node)) {
      // Process children directly
      if (node.children) {
        for (const child of node.children) {
          results.push(...this.processNode(child, depth));
        }
      }
      return results;
    }

    const ref = this.refManager.generateRef();
    const interactable = this.isInteractive(node);
    const attributes: Record<string, string> = {};

    if (node.value) attributes["value"] = node.value;
    if (node.description) attributes["description"] = node.description;
    if (node.checked !== undefined) attributes["checked"] = String(node.checked);
    if (node.selected !== undefined) attributes["selected"] = String(node.selected);
    if (node.expanded !== undefined) attributes["expanded"] = String(node.expanded);
    if (node.disabled) attributes["disabled"] = "true";
    if (node.required) attributes["required"] = "true";
    if (node.level !== undefined) attributes["level"] = String(node.level);
    if (node.readonly) attributes["readonly"] = "true";

    const snapshot: ElementSnapshot = {
      ref,
      role: node.role,
      name: node.name || "",
      xpath: "",
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      interactable,
      visible: true,
      attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
      textContent: node.name || node.value || undefined,
      children: node.children
        ? node.children.flatMap((child) => this.processNode(child, depth + 1))
        : undefined,
    };

    this.refManager.register(snapshot);
    results.push(snapshot);
    return results;
  }

  private isInteractive(node: AXNode): boolean {
    const interactableRoles = new Set([
      "button",
      "link",
      "textbox",
      "checkbox",
      "radio",
      "combobox",
      "listbox",
      "option",
      "menuitem",
      "menuitemcheckbox",
      "menuitemradio",
      "tab",
      "switch",
      "slider",
      "spinbutton",
      "searchbox",
      "textarea",
      "treeitem",
    ]);
    return interactableRoles.has(node.role);
  }

  private isSkippableNode(node: AXNode): boolean {
    // Skip generic/none/group nodes that have no name and just wrap children
    const skippableRoles = new Set(["generic", "none", "presentation"]);
    return skippableRoles.has(node.role) && !node.name;
  }

  private flattenTree(tree: ElementSnapshot[]): ElementSnapshot[] {
    const result: ElementSnapshot[] = [];
    const stack: ElementSnapshot[] = [...tree].reverse();
    while (stack.length > 0) {
      const node = stack.pop()!;
      result.push(node);
      if (node.children) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push(node.children[i]);
        }
      }
    }
    return result;
  }

  private flattenDOMTree(tree: DOMNode[]): DOMNode[] {
    const result: DOMNode[] = [];
    const stack: DOMNode[] = [...tree].reverse();
    while (stack.length > 0) {
      const node = stack.pop()!;
      result.push(node);
      if (node.children) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push(node.children[i]);
        }
      }
    }
    return result;
  }

  private roleMatchesTag(role: string, tagName: string): boolean {
    const mapping: Record<string, string[]> = {
      button: ["button", "input[type=button]", "input[type=submit]"],
      link: ["a"],
      textbox: ["input", "textarea"],
      heading: ["h1", "h2", "h3", "h4", "h5", "h6"],
      img: ["img"],
      list: ["ul", "ol"],
      listitem: ["li"],
      table: ["table"],
      row: ["tr"],
      cell: ["td", "th"],
      navigation: ["nav"],
      main: ["main"],
      complementary: ["aside"],
      contentinfo: ["footer"],
      banner: ["header"],
      form: ["form"],
    };
    const tags = mapping[role];
    return tags ? tags.includes(tagName.toLowerCase()) : false;
  }

  private generateXPath(node?: DOMNode): string {
    if (!node?.tagName) return "";
    return `//${node.tagName.toLowerCase()}`;
  }

  private generateCSSSelector(node?: DOMNode): string {
    if (!node?.tagName) return "";
    const tag = node.tagName.toLowerCase();
    if (node.attributes?.["id"]) return `#${node.attributes["id"]}`;
    if (node.attributes?.["class"]) {
      const cls = node.attributes["class"].split(" ")[0];
      return `${tag}.${cls}`;
    }
    return tag;
  }
}
