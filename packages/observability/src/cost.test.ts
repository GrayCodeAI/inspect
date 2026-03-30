import { describe, it, expect } from "vitest";
import { CostPredictor, CostOptimizer } from "./cost.js";

describe("CostPredictor", () => {
  it("should estimate cost for a test run", async () => {
    const predictor = new CostPredictor();
    const estimate = await predictor.predict({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      estimatedPages: 5,
      estimatedSteps: 25,
      includeQuality: true,
    });

    expect(estimate.estimatedSteps).toBeGreaterThan(0);
    expect(estimate.estimatedTokens).toBeGreaterThan(0);
    expect(estimate.estimatedCost).toBeGreaterThan(0);
    expect(estimate.confidence).toBe(0.7);
    expect(estimate.breakdown.execution).toBe(0.6);
  });

  it("should return higher estimates for quality checks", async () => {
    const predictor = new CostPredictor();
    const without = await predictor.predict({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      estimatedPages: 5,
      estimatedSteps: 25,
      includeQuality: false,
    });
    const with_ = await predictor.predict({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      estimatedPages: 5,
      estimatedSteps: 25,
      includeQuality: true,
    });

    expect(with_.estimatedCost).toBeGreaterThan(without.estimatedCost);
  });
});

describe("CostOptimizer", () => {
  it("should suggest flash model for non-flash runs", () => {
    const optimizer = new CostOptimizer();
    const suggestions = optimizer.suggest({
      model: "claude-sonnet-4-20250514",
      actualTokens: 50000,
      isRepeatRun: false,
      usedVision: false,
    });

    const flash = suggestions.find((s) => s.type === "use_flash_model");
    expect(flash).toBeDefined();
    expect(flash!.savings).toContain("40");
  });

  it("should suggest caching for repeat runs", () => {
    const optimizer = new CostOptimizer();
    const suggestions = optimizer.suggest({
      model: "claude-sonnet-4-20250514",
      actualTokens: 50000,
      isRepeatRun: true,
      usedVision: false,
    });

    const caching = suggestions.find((s) => s.type === "enable_caching");
    expect(caching).toBeDefined();
    expect(caching!.savings).toBe("90%");
  });

  it("should suggest vision reduction when vision was used", () => {
    const optimizer = new CostOptimizer();
    const suggestions = optimizer.suggest({
      model: "claude-sonnet-4-20250514",
      actualTokens: 50000,
      isRepeatRun: false,
      usedVision: true,
    });

    const vision = suggestions.find((s) => s.type === "reduce_vision_calls");
    expect(vision).toBeDefined();
  });

  it("should always suggest local model option", () => {
    const optimizer = new CostOptimizer();
    const suggestions = optimizer.suggest({
      model: "claude-sonnet-4-20250514",
      actualTokens: 50000,
      isRepeatRun: false,
      usedVision: false,
    });

    const local = suggestions.find((s) => s.type === "use_local_model");
    expect(local).toBeDefined();
    expect(local!.savings).toBe("100%");
  });
});
