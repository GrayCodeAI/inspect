import { describe, it, expect } from "vitest";
import {
  A11Y_RULES,
  ALL_A11Y_RULES,
  getRulesByTag,
  getRulesByImpact,
  getRulesByCategory,
  getRuleById,
} from "./a11y/rules.js";
import { CustomA11yRuleEngine, BUILTIN_CUSTOM_A11Y_RULES } from "./custom-rules.js";

describe("A11y Rules", () => {
  it("should have rules organized by category", () => {
    const categories = Object.keys(A11Y_RULES);
    expect(categories.length).toBeGreaterThan(0);
    expect(categories).toContain("aria");
    expect(categories).toContain("color");
    expect(categories).toContain("forms");
    expect(categories).toContain("keyboard");
  });

  it("should have a flat array of all rules", () => {
    expect(ALL_A11Y_RULES.length).toBeGreaterThan(0);
    expect(ALL_A11Y_RULES.length).toBeGreaterThanOrEqual(90);
  });

  it("should filter rules by tag", () => {
    const wcag2aRules = getRulesByTag("wcag2a");
    expect(wcag2aRules.length).toBeGreaterThan(0);
    for (const rule of wcag2aRules) {
      expect(rule.tags).toContain("wcag2a");
    }
  });

  it("should filter rules by impact", () => {
    const criticalRules = getRulesByImpact("critical");
    expect(criticalRules.length).toBeGreaterThan(0);
    for (const rule of criticalRules) {
      expect(rule.impact).toBe("critical");
    }
  });

  it("should filter rules by category", () => {
    const ariaRules = getRulesByCategory("aria");
    expect(ariaRules.length).toBeGreaterThan(0);
    for (const rule of ariaRules) {
      expect(rule.tags).toContain("cat.aria");
    }
  });

  it("should return empty array for unknown category", () => {
    const unknown = getRulesByCategory("nonexistent");
    expect(unknown.length).toBe(0);
  });

  it("should find a rule by ID", () => {
    const rule = getRuleById("color-contrast");
    expect(rule).toBeDefined();
    expect(rule?.id).toBe("color-contrast");
    expect(rule?.impact).toBe("serious");
  });

  it("should return undefined for unknown rule ID", () => {
    const rule = getRuleById("nonexistent-rule");
    expect(rule).toBeUndefined();
  });

  it("should have rules with valid impact levels", () => {
    const validImpacts = ["critical", "serious", "moderate", "minor"];
    for (const rule of ALL_A11Y_RULES) {
      expect(validImpacts).toContain(rule.impact);
    }
  });

  it("should have rules with valid tags", () => {
    for (const rule of ALL_A11Y_RULES) {
      expect(rule.tags.length).toBeGreaterThan(0);
      expect(rule.id.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});

describe("CustomA11yRuleEngine", () => {
  it("should register and list custom rules", () => {
    const engine = new CustomA11yRuleEngine();
    const rule = {
      id: "test-rule",
      impact: "critical" as const,
      selector: "button",
      evaluateFn: () => false,
      description: "Test rule",
    };

    engine.register(rule);
    const rules = engine.list();
    expect(rules.length).toBe(1);
    expect(rules[0].id).toBe("test-rule");
  });

  it("should unregister a rule", () => {
    const engine = new CustomA11yRuleEngine();
    const rule = {
      id: "test-rule",
      impact: "critical" as const,
      selector: "button",
      evaluateFn: () => false,
      description: "Test rule",
    };

    engine.register(rule);
    engine.unregister("test-rule");
    expect(engine.list().length).toBe(0);
  });

  it("should have builtin custom a11y rules", () => {
    expect(BUILTIN_CUSTOM_A11Y_RULES.length).toBeGreaterThan(0);
    const ids = BUILTIN_CUSTOM_A11Y_RULES.map((r: { id: string }) => r.id);
    expect(ids).toContain("form-error-association");
    expect(ids).toContain("modal-focus-trap");
    expect(ids).toContain("button-interactive-label");
  });

  it("should have builtin rules with valid impact levels", () => {
    const validImpacts = ["critical", "serious", "moderate", "minor"];
    for (const rule of BUILTIN_CUSTOM_A11Y_RULES) {
      expect(validImpacts).toContain(rule.impact);
    }
  });
});
