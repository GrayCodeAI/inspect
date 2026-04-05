import { describe, it, expect } from "vitest";
import {
  BudgetManager,
  BUDGET_PRESETS,
  type BudgetThreshold,
  type BudgetCheckResult,
} from "./budgets.js";

describe("BUDGET_PRESETS", () => {
  it("should have strict preset", () => {
    expect(BUDGET_PRESETS.strict.length).toBeGreaterThan(0);
    expect(BUDGET_PRESETS.strict[0].metric).toBe("FCP");
    expect(BUDGET_PRESETS.strict[0].severity).toBe("error");
  });

  it("should have relaxed preset", () => {
    expect(BUDGET_PRESETS.relaxed.length).toBeGreaterThan(0);
    expect(BUDGET_PRESETS.relaxed[0].metric).toBe("FCP");
  });

  it("should have coreWebVitals preset", () => {
    expect(BUDGET_PRESETS.coreWebVitals.length).toBe(3);
    const metrics = BUDGET_PRESETS.coreWebVitals.map((b: BudgetThreshold) => b.metric);
    expect(metrics).toContain("LCP");
    expect(metrics).toContain("CLS");
    expect(metrics).toContain("TBT");
  });
});

describe("BudgetManager", () => {
  describe("constructor", () => {
    it("should create with no budgets", () => {
      const manager = new BudgetManager();
      const result = manager.assertBudgets(createMockReport({ performance: 95 }));
      expect(result.passed).toBe(true);
      expect(result.assertions.length).toBe(0);
    });

    it("should create with initial budgets", () => {
      const budgets: BudgetThreshold[] = [
        { metric: "performance", maxValue: 90, severity: "error" },
      ];
      const manager = new BudgetManager(budgets);
      const result = manager.assertBudgets(createMockReport({ performance: 95 }));
      expect(result.assertions.length).toBe(1);
    });
  });

  describe("setBudgets", () => {
    it("should replace all budgets", () => {
      const manager = new BudgetManager();
      manager.setBudgets([{ metric: "FCP", maxValue: 2000, severity: "error" }]);
      const result = manager.assertBudgets(createMockReport({ performance: 95, FCP: 1500 }));
      expect(result.assertions.length).toBe(1);
      expect(result.assertions[0].metric).toBe("FCP");
    });
  });

  describe("usePreset", () => {
    it("should load strict preset", () => {
      const manager = new BudgetManager();
      manager.usePreset("strict");
      const result = manager.assertBudgets(createMockReport({ performance: 95 }));
      expect(result.assertions.length).toBeGreaterThan(0);
    });

    it("should load coreWebVitals preset", () => {
      const manager = new BudgetManager();
      manager.usePreset("coreWebVitals");
      const result = manager.assertBudgets(createMockReport({ performance: 95 }));
      expect(result.assertions.length).toBe(3);
    });
  });

  describe("addBudget", () => {
    it("should add a single budget", () => {
      const manager = new BudgetManager();
      manager.addBudget({ metric: "LCP", maxValue: 2500, severity: "error" });
      const result = manager.assertBudgets(createMockReport({ performance: 95, LCP: 2000 }));
      expect(result.assertions.length).toBe(1);
    });
  });

  describe("assertBudgets", () => {
    it("should pass when metric is under budget", () => {
      const manager = new BudgetManager([{ metric: "FCP", maxValue: 2000, severity: "error" }]);
      const result = manager.assertBudgets(createMockReport({ performance: 95, FCP: 1500 }));
      expect(result.passed).toBe(true);
      expect(result.assertions[0].passed).toBe(true);
      expect(result.errorCount).toBe(0);
    });

    it("should fail when metric exceeds budget", () => {
      const manager = new BudgetManager([{ metric: "FCP", maxValue: 1800, severity: "error" }]);
      const result = manager.assertBudgets(createMockReport({ performance: 95, FCP: 2500 }));
      expect(result.passed).toBe(false);
      expect(result.assertions[0].passed).toBe(false);
      expect(result.errorCount).toBe(1);
    });

    it("should pass score metrics when above threshold", () => {
      const manager = new BudgetManager([
        { metric: "performance", maxValue: 90, severity: "error" },
      ]);
      const result = manager.assertBudgets(createMockReport({ performance: 95 }));
      expect(result.passed).toBe(true);
      expect(result.assertions[0].passed).toBe(true);
    });

    it("should fail score metrics when below threshold", () => {
      const manager = new BudgetManager([
        { metric: "performance", maxValue: 90, severity: "error" },
      ]);
      const result = manager.assertBudgets(createMockReport({ performance: 80 }));
      expect(result.passed).toBe(false);
      expect(result.assertions[0].passed).toBe(false);
    });

    it("should count warnings separately from errors", () => {
      const manager = new BudgetManager([{ metric: "FCP", maxValue: 100, severity: "warning" }]);
      const result = manager.assertBudgets(createMockReport({ performance: 95, FCP: 500 }));
      expect(result.passed).toBe(true);
      expect(result.warningCount).toBe(1);
      expect(result.errorCount).toBe(0);
    });

    it("should include overage calculation", () => {
      const manager = new BudgetManager([{ metric: "FCP", maxValue: 1000, severity: "error" }]);
      const result = manager.assertBudgets(createMockReport({ performance: 95, FCP: 1500 }));
      expect(result.assertions[0].overage).toBe(500);
    });

    it("should include message in assertion result", () => {
      const manager = new BudgetManager([
        { metric: "FCP", maxValue: 1000, severity: "error", label: "First Contentful Paint" },
      ]);
      const result = manager.assertBudgets(createMockReport({ performance: 95, FCP: 1500 }));
      expect(result.assertions[0].message).toContain("First Contentful Paint");
    });

    it("should skip unknown metrics gracefully", () => {
      const manager = new BudgetManager([
        { metric: "UNKNOWN_METRIC", maxValue: 100, severity: "error" },
      ]);
      const result = manager.assertBudgets(createMockReport({ performance: 95 }));
      expect(result.assertions.length).toBe(0);
    });

    it("should check multiple metrics", () => {
      const manager = new BudgetManager([
        { metric: "FCP", maxValue: 2000, severity: "error" },
        { metric: "LCP", maxValue: 3000, severity: "error" },
        { metric: "CLS", maxValue: 0.1, severity: "warning" },
      ]);
      const result = manager.assertBudgets(
        createMockReport({ performance: 95, FCP: 1500, LCP: 2500, CLS: 0.05 }),
      );
      expect(result.assertions.length).toBe(3);
      expect(result.passed).toBe(true);
    });

    it("should check category scores", () => {
      const manager = new BudgetManager([
        { metric: "accessibility", maxValue: 80, severity: "error" },
        { metric: "seo", maxValue: 80, severity: "error" },
      ]);
      const result = manager.assertBudgets(
        createMockReport({ performance: 95, accessibility: 90, seo: 85 }),
      );
      expect(result.passed).toBe(true);
    });

    it("should handle best-practices metric alias", () => {
      const manager = new BudgetManager([
        { metric: "best-practices", maxValue: 80, severity: "error" },
      ]);
      const result = manager.assertBudgets(
        createMockReport({ performance: 95, bestPractices: 90 }),
      );
      expect(result.assertions.length).toBe(1);
    });
  });
});

function createMockReport(overrides: {
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  seo?: number;
  FCP?: number;
  LCP?: number;
  CLS?: number;
  TBT?: number;
  SI?: number;
  TTI?: number;
}) {
  return {
    scores: {
      performance: overrides.performance ?? 100,
      accessibility: overrides.accessibility ?? 100,
      bestPractices: overrides.bestPractices ?? 100,
      seo: overrides.seo ?? 100,
      pwa: undefined,
    },
    metrics: {
      FCP: { value: overrides.FCP ?? 0, rating: "good" as const, displayValue: "0 ms" },
      LCP: { value: overrides.LCP ?? 0, rating: "good" as const, displayValue: "0 ms" },
      CLS: { value: overrides.CLS ?? 0, rating: "good" as const, displayValue: "0" },
      TBT: { value: overrides.TBT ?? 0, rating: "good" as const, displayValue: "0 ms" },
      SI: { value: overrides.SI ?? 0, rating: "good" as const, displayValue: "0 ms" },
      TTI: { value: overrides.TTI ?? 0, rating: "good" as const, displayValue: "0 ms" },
      INP: undefined,
      TTFB: undefined,
    },
    opportunities: [],
    diagnostics: [],
    device: "desktop" as const,
    timestamp: Date.now(),
    url: "https://example.com",
  };
}
