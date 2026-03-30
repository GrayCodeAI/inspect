import { describe, it, expect } from "vitest";
import { DOMDiffer } from "./dom-differ.js";

describe("DOMDiffer", () => {
  const differ = new DOMDiffer();

  it("returns no changes for identical snapshots", () => {
    const snapshot = '[e1] button "Submit"\n[e2] link "Home"';
    const result = differ.diff(snapshot, snapshot);
    expect(result.changes).toHaveLength(0);
    expect(result.hasBreakingChanges).toBe(false);
    expect(result.brokenSelectors).toHaveLength(0);
  });

  it("detects removed elements", () => {
    const prev = '[e1] button "Submit"\n[e2] link "Home"';
    const curr = '[e1] button "Submit"';
    const result = differ.diff(prev, curr);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].type).toBe("removed");
    expect(result.changes[0].selector).toBe('[ref="e2"]');
    expect(result.hasBreakingChanges).toBe(true);
    expect(result.brokenSelectors).toContain('[ref="e2"]');
  });

  it("detects added elements", () => {
    const prev = '[e1] button "Submit"';
    const curr = '[e1] button "Submit"\n[e3] textbox "Email"';
    const result = differ.diff(prev, curr);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].type).toBe("added");
    expect(result.changes[0].selector).toBe('[ref="e3"]');
    expect(result.hasBreakingChanges).toBe(false);
  });

  it("detects modified elements", () => {
    const prev = '[e1] button "Submit"';
    const curr = '[e1] button "Save"';
    const result = differ.diff(prev, curr);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].type).toBe("modified");
    expect(result.changes[0].selector).toBe('[ref="e1"]');
    expect(result.hasBreakingChanges).toBe(true);
  });

  it("detects role changes as modification", () => {
    const prev = '[e1] button "Click Me"';
    const curr = '[e1] link "Click Me"';
    const result = differ.diff(prev, curr);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].type).toBe("modified");
    expect(result.hasBreakingChanges).toBe(true);
  });

  it("handles mixed changes", () => {
    const prev = '[e1] button "Submit"\n[e2] link "Home"\n[e3] textbox "Name"';
    const curr = '[e1] button "Save"\n[e4] link "About"';
    const result = differ.diff(prev, curr);

    const removed = result.changes.filter((c) => c.type === "removed");
    const added = result.changes.filter((c) => c.type === "added");
    const modified = result.changes.filter((c) => c.type === "modified");

    expect(removed).toHaveLength(2);
    expect(added).toHaveLength(1);
    expect(modified).toHaveLength(1);
    expect(result.hasBreakingChanges).toBe(true);
  });

  it("handles empty snapshots", () => {
    const result = differ.diff("", "");
    expect(result.changes).toHaveLength(0);
    expect(result.hasBreakingChanges).toBe(false);
  });

  it("handles E-ref format (uppercase E)", () => {
    const prev = '[E1] button "Submit"';
    const curr = '[E1] button "Save"';
    const result = differ.diff(prev, curr);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].type).toBe("modified");
  });
});
