import { describe, it, expect } from "vitest";
import { HealingStrategy, mapMethodToStrategy } from "./strategies.js";

describe("HealingStrategy", () => {
  it("defines 8 strategies", () => {
    const values = Object.values(HealingStrategy);
    expect(values).toHaveLength(8);
  });

  it("has correct string values", () => {
    expect(HealingStrategy.TEXT_MATCH).toBe("text_match");
    expect(HealingStrategy.ARIA_ROLE).toBe("aria_role");
    expect(HealingStrategy.VISUAL_LOCATE).toBe("visual_locate");
    expect(HealingStrategy.XPATH_RELATIVE).toBe("xpath_relative");
    expect(HealingStrategy.CSS_SIMILAR).toBe("css_similar");
    expect(HealingStrategy.NEIGHBOR_ANCHOR).toBe("neighbor_anchor");
    expect(HealingStrategy.SEMANTIC_MATCH).toBe("semantic_match");
    expect(HealingStrategy.FULL_RESCAN).toBe("full_rescan");
  });
});

describe("mapMethodToStrategy", () => {
  it("maps 'exact' to ARIA_ROLE", () => {
    expect(mapMethodToStrategy("exact")).toBe(HealingStrategy.ARIA_ROLE);
  });

  it("maps 'semantic' to SEMANTIC_MATCH", () => {
    expect(mapMethodToStrategy("semantic")).toBe(HealingStrategy.SEMANTIC_MATCH);
  });

  it("maps 'fuzzy' to TEXT_MATCH", () => {
    expect(mapMethodToStrategy("fuzzy")).toBe(HealingStrategy.TEXT_MATCH);
  });

  it("maps 'vision' to VISUAL_LOCATE", () => {
    expect(mapMethodToStrategy("vision")).toBe(HealingStrategy.VISUAL_LOCATE);
  });

  it("maps 'css-similar' to CSS_SIMILAR", () => {
    expect(mapMethodToStrategy("css-similar")).toBe(HealingStrategy.CSS_SIMILAR);
  });

  it("maps 'neighbor-anchor' to NEIGHBOR_ANCHOR", () => {
    expect(mapMethodToStrategy("neighbor-anchor")).toBe(HealingStrategy.NEIGHBOR_ANCHOR);
  });

  it("maps unknown method to FULL_RESCAN", () => {
    expect(mapMethodToStrategy("unknown")).toBe(HealingStrategy.FULL_RESCAN);
    expect(mapMethodToStrategy("")).toBe(HealingStrategy.FULL_RESCAN);
    expect(mapMethodToStrategy("whatever")).toBe(HealingStrategy.FULL_RESCAN);
  });
});
