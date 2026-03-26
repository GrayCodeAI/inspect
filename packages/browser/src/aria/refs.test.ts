import { describe, it, expect, beforeEach } from "vitest";
import { RefManager } from "./refs.js";
import type { ElementSnapshot } from "@inspect/shared";

function makeSnapshot(ref: string, role: string, name: string): ElementSnapshot {
  return {
    ref,
    role,
    name,
    xpath: "",
    bounds: { x: 0, y: 0, width: 100, height: 30 },
    interactable: true,
    visible: true,
  };
}

describe("RefManager", () => {
  let mgr: RefManager;

  beforeEach(() => {
    mgr = new RefManager();
  });

  it("generates sequential refs", () => {
    expect(mgr.generateRef()).toBe("e1");
    expect(mgr.generateRef()).toBe("e2");
    expect(mgr.generateRef()).toBe("e3");
  });

  it("registers and retrieves elements", () => {
    const snap = makeSnapshot("e1", "button", "Submit");
    mgr.register(snap);
    expect(mgr.getElement("e1")).toEqual(snap);
  });

  it("returns undefined for missing refs", () => {
    expect(mgr.getElement("e999")).toBeUndefined();
  });

  it("has() checks existence", () => {
    const snap = makeSnapshot("e1", "link", "Home");
    mgr.register(snap);
    expect(mgr.has("e1")).toBe(true);
    expect(mgr.has("e2")).toBe(false);
  });

  it("getAllRefs returns registered refs", () => {
    mgr.register(makeSnapshot("e1", "button", "A"));
    mgr.register(makeSnapshot("e2", "link", "B"));
    expect(mgr.getAllRefs()).toEqual(["e1", "e2"]);
  });

  it("size returns count", () => {
    expect(mgr.size).toBe(0);
    mgr.register(makeSnapshot("e1", "button", "X"));
    expect(mgr.size).toBe(1);
  });

  it("clear resets counter and refs", () => {
    mgr.generateRef();
    mgr.generateRef();
    mgr.register(makeSnapshot("e1", "button", "X"));
    mgr.clear();
    expect(mgr.size).toBe(0);
    expect(mgr.generateRef()).toBe("e1");
  });

  it("resolveLocator throws for missing ref", () => {
    const fakePage = {} as any;
    expect(() => mgr.resolveLocator(fakePage, "e99")).toThrow('Reference "e99" not found');
  });
});
