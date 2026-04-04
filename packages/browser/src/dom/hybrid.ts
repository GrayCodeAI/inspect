// ──────────────────────────────────────────────────────────────────────────────
// HybridTree - Merge ARIA + DOM trees into a unified representation
// ──────────────────────────────────────────────────────────────────────────────

import type { ElementSnapshot, DOMNode, HybridNode } from "@inspect/shared";
import { RefManager } from "../aria/refs.js";

/** Tag names that indicate interactive elements */
const INTERACTIVE_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "details",
  "summary",
  "label",
  "option",
]);

/** Attributes that indicate interactivity */
const INTERACTIVE_ATTRS = new Set([
  "onclick",
  "onchange",
  "onsubmit",
  "tabindex",
  "contenteditable",
  "role",
]);

/** Roles that indicate interactivity */
const INTERACTIVE_ROLES = new Set([
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
  "treeitem",
]);

/**
 * Creates a hybrid tree that combines ARIA semantics with DOM positional data.
 * Assigns stable reference IDs, includes XPath/CSS selectors and bounding boxes,
 * and marks interactable elements.
 */
export class HybridTree {
  private refManager: RefManager;

  constructor(refManager?: RefManager) {
    this.refManager = refManager ?? new RefManager();
  }

  /**
   * Merge an ARIA tree with a DOM tree to produce HybridNodes.
   * Each node gets a stable ref, selectors, bounds, and interactivity marking.
   */
  merge(ariaTree: ElementSnapshot[], domTree: DOMNode[]): HybridNode[] {
    this.refManager.clear();
    const flatAria = this.flattenAria(ariaTree);
    const flatDOM = this.flattenDOM(domTree, "");

    const hybridNodes: HybridNode[] = [];

    // First pass: match ARIA nodes to DOM nodes
    const matched = new Set<number>();

    for (const ariaNode of flatAria) {
      let bestMatch: { dom: DOMNode & { _path?: string; _index?: number }; score: number } | null =
        null;

      for (let i = 0; i < flatDOM.length; i++) {
        if (matched.has(i)) continue;
        const dom = flatDOM[i];
        const score = this.matchScore(ariaNode, dom);
        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { dom: { ...dom, _index: i }, score };
        }
      }

      if (bestMatch && bestMatch.dom._index !== undefined) {
        matched.add(bestMatch.dom._index);
      }

      const dom = bestMatch?.dom;
      const tagName = dom?.tagName ?? ariaNode.tagName ?? "unknown";
      const ref = this.refManager.generateRef();
      const xpath = dom?._path ?? this.buildXPathFromAria(ariaNode);
      const cssSelector = this.buildCSSSelector(dom, ariaNode);
      const interactive = this.isInteractive(ariaNode, dom);

      hybridNodes.push({
        ref,
        role: ariaNode.role,
        name: ariaNode.name,
        tagName,
        xpath,
        cssSelector,
        bounds: ariaNode.bounds ?? dom?.bounds,
        interactive,
        visible: ariaNode.visible && dom?.visible !== false,
        textContent: ariaNode.textContent ?? dom?.textContent,
        attributes: this.mergeAttributes(ariaNode.attributes, dom?.attributes),
        ariaProperties: ariaNode.ariaProperties,
      });
    }

    // Second pass: add unmatched DOM nodes that are interactive or significant
    for (let i = 0; i < flatDOM.length; i++) {
      if (matched.has(i)) continue;
      const dom = flatDOM[i];
      if (!dom.tagName || !dom.visible) continue;

      const isInteractive = this.isDOMInteractive(dom);
      if (!isInteractive && !dom.textContent) continue;

      const ref = this.refManager.generateRef();
      hybridNodes.push({
        ref,
        role: this.tagToRole(dom.tagName),
        name: dom.textContent ?? "",
        tagName: dom.tagName,
        xpath: (dom as DOMNode & { _path?: string })._path ?? `//${dom.tagName}`,
        cssSelector: this.buildCSSSelector(dom),
        bounds: dom.bounds,
        interactive: isInteractive,
        visible: dom.visible ?? true,
        textContent: dom.textContent,
        attributes: dom.attributes,
      });
    }

    return hybridNodes;
  }

  /** Get the ref manager used by this hybrid tree. */
  getRefManager(): RefManager {
    return this.refManager;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private flattenAria(tree: ElementSnapshot[]): ElementSnapshot[] {
    const result: ElementSnapshot[] = [];
    for (const node of tree) {
      result.push(node);
      if (node.children) result.push(...this.flattenAria(node.children));
    }
    return result;
  }

  private flattenDOM(tree: DOMNode[], parentPath: string): (DOMNode & { _path?: string })[] {
    const result: (DOMNode & { _path?: string })[] = [];
    const tagCounts: Record<string, number> = {};

    for (const node of tree) {
      if (node.nodeType !== 1 || !node.tagName) continue;

      const tag = node.tagName.toLowerCase();
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      const path = `${parentPath}/${tag}[${tagCounts[tag]}]`;

      result.push({ ...node, _path: path });

      if (node.children) {
        result.push(...this.flattenDOM(node.children, path));
      }
    }

    return result;
  }

  private matchScore(aria: ElementSnapshot, dom: DOMNode): number {
    let score = 0;

    // Text content match
    if (aria.textContent && dom.textContent && aria.textContent === dom.textContent) {
      score += 3;
    } else if (
      aria.textContent &&
      dom.textContent &&
      (aria.textContent.includes(dom.textContent) || dom.textContent.includes(aria.textContent))
    ) {
      score += 1;
    }

    // Role-tag match
    if (dom.tagName && this.roleMatchesTag(aria.role, dom.tagName)) {
      score += 2;
    }

    // Attribute overlap
    if (aria.attributes && dom.attributes) {
      for (const key of Object.keys(aria.attributes)) {
        if (dom.attributes[key] === aria.attributes[key]) score += 1;
      }
    }

    // Bounds proximity (if both have bounds)
    if (aria.bounds && dom.bounds) {
      const dx = Math.abs(aria.bounds.x - dom.bounds.x);
      const dy = Math.abs(aria.bounds.y - dom.bounds.y);
      if (dx < 5 && dy < 5) score += 2;
    }

    return score;
  }

  private isInteractive(aria: ElementSnapshot, dom?: DOMNode): boolean {
    if (aria.interactable) return true;
    if (INTERACTIVE_ROLES.has(aria.role)) return true;
    if (dom) return this.isDOMInteractive(dom);
    return false;
  }

  private isDOMInteractive(dom: DOMNode): boolean {
    if (dom.tagName && INTERACTIVE_TAGS.has(dom.tagName.toLowerCase())) return true;
    if (dom.attributes) {
      for (const attr of Object.keys(dom.attributes)) {
        if (INTERACTIVE_ATTRS.has(attr)) return true;
      }
      if (dom.attributes["role"] && INTERACTIVE_ROLES.has(dom.attributes["role"])) return true;
    }
    return false;
  }

  private roleMatchesTag(role: string, tagName: string): boolean {
    const mapping: Record<string, string[]> = {
      button: ["button"],
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
      checkbox: ["input"],
      radio: ["input"],
      combobox: ["select"],
    };
    const tags = mapping[role];
    return tags ? tags.includes(tagName.toLowerCase()) : false;
  }

  private tagToRole(tagName: string): string {
    const mapping: Record<string, string> = {
      a: "link",
      button: "button",
      input: "textbox",
      textarea: "textbox",
      select: "combobox",
      img: "img",
      h1: "heading",
      h2: "heading",
      h3: "heading",
      h4: "heading",
      h5: "heading",
      h6: "heading",
      nav: "navigation",
      main: "main",
      aside: "complementary",
      footer: "contentinfo",
      header: "banner",
      form: "form",
      table: "table",
      ul: "list",
      ol: "list",
      li: "listitem",
      p: "paragraph",
      div: "generic",
      span: "generic",
    };
    return mapping[tagName.toLowerCase()] ?? "generic";
  }

  private buildXPathFromAria(aria: ElementSnapshot): string {
    if (aria.xpath) return aria.xpath;
    if (aria.role === "heading" && aria.name) {
      return `//h1[text()="${aria.name}"] | //h2[text()="${aria.name}"] | //h3[text()="${aria.name}"]`;
    }
    if (aria.role === "link" && aria.name) {
      return `//a[text()="${aria.name}"]`;
    }
    if (aria.role === "button" && aria.name) {
      return `//button[text()="${aria.name}"]`;
    }
    return "";
  }

  private buildCSSSelector(dom?: DOMNode, aria?: ElementSnapshot): string {
    if (aria?.cssSelector) return aria.cssSelector;
    if (!dom?.tagName) return "";

    const tag = dom.tagName.toLowerCase();
    if (dom.attributes?.["id"]) return `#${dom.attributes["id"]}`;
    if (dom.attributes?.["class"]) {
      const classes = dom.attributes["class"].split(/\s+/).filter(Boolean).slice(0, 2).join(".");
      return `${tag}.${classes}`;
    }
    if (dom.attributes?.["name"]) return `${tag}[name="${dom.attributes["name"]}"]`;
    return tag;
  }

  private mergeAttributes(
    ariaAttrs?: Record<string, string>,
    domAttrs?: Record<string, string>,
  ): Record<string, string> | undefined {
    if (!ariaAttrs && !domAttrs) return undefined;
    return { ...domAttrs, ...ariaAttrs };
  }
}
