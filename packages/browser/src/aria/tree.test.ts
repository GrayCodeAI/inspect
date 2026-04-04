import { describe, it, expect, beforeEach } from "vitest";
import { AriaTree } from "./tree.js";
import type { ElementSnapshot } from "@inspect/shared";

function snap(
  ref: string,
  role: string,
  name: string,
  opts?: Partial<ElementSnapshot>,
): ElementSnapshot {
  return {
    ref,
    role,
    name,
    xpath: "",
    bounds: { x: 0, y: 0, width: 100, height: 30 },
    interactable: opts?.interactable ?? false,
    visible: true,
    ...opts,
  };
}

describe("AriaTree", () => {
  let tree: AriaTree;

  beforeEach(() => {
    tree = new AriaTree();
  });

  describe("format", () => {
    it("formats a flat list of elements", () => {
      const nodes = [
        snap("e1", "heading", "Title"),
        snap("e2", "button", "Click me", { interactable: true }),
      ];
      const output = tree.format(nodes);
      expect(output).toContain('[e1] heading "Title"');
      expect(output).toContain('[e2] button "Click me" *');
    });

    it("formats nested elements with indentation", () => {
      const nodes = [
        snap("e1", "navigation", "Nav", {
          children: [
            snap("e2", "link", "Home", { interactable: true }),
            snap("e3", "link", "About", { interactable: true }),
          ],
        }),
      ];
      const output = tree.format(nodes);
      const lines = output.split("\n");
      expect(lines[0]).toBe('[e1] navigation "Nav"');
      expect(lines[1]).toBe('  [e2] link "Home" *');
      expect(lines[2]).toBe('  [e3] link "About" *');
    });

    it("includes attributes in parentheses", () => {
      const nodes = [snap("e1", "heading", "Title", { attributes: { level: "1" } })];
      const output = tree.format(nodes);
      expect(output).toContain("(level=1)");
    });

    it("omits name if empty", () => {
      const nodes = [snap("e1", "separator", "")];
      const output = tree.format(nodes);
      expect(output).toBe("[e1] separator");
    });
  });

  describe("filter", () => {
    it("filters by predicate", () => {
      const nodes = [
        snap("e1", "button", "Submit", { interactable: true }),
        snap("e2", "paragraph", "Some text"),
        snap("e3", "link", "Home", { interactable: true }),
      ];
      const result = tree.filter(nodes, (n) => n.interactable === true);
      expect(result).toHaveLength(2);
      expect(result[0].ref).toBe("e1");
      expect(result[1].ref).toBe("e3");
    });

    it("keeps parent if child matches", () => {
      const nodes = [
        snap("e1", "navigation", "Nav", {
          children: [snap("e2", "link", "Home", { interactable: true })],
        }),
      ];
      const result = tree.filter(nodes, (n) => n.role === "link");
      expect(result).toHaveLength(1);
      expect(result[0].ref).toBe("e1");
      expect(result[0].children).toHaveLength(1);
    });

    it("returns empty for no matches", () => {
      const nodes = [snap("e1", "paragraph", "Text")];
      const result = tree.filter(nodes, (n) => n.role === "button");
      expect(result).toHaveLength(0);
    });
  });

  describe("getRefManager", () => {
    it("returns the ref manager", () => {
      const mgr = tree.getRefManager();
      expect(mgr).toBeDefined();
      expect(mgr.generateRef()).toBe("e1");
    });
  });
});
