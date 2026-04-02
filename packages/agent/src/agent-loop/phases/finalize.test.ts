/**
 * Tests for finalize phase
 */

import { describe, it, expect, beforeEach } from "vitest";
import { finalizePhase } from "./finalize.js";
import type { FinalizeInput } from "./finalize.js";

describe("finalize phase", () => {
  let baseInput: FinalizeInput;

  beforeEach(() => {
    baseInput = {
      stepNumber: 1,
      actionResults: [
        { success: true, output: "clicked" },
        { success: false, error: "Element not found" },
        { success: true, output: "text entered" },
      ],
      brain: {
        evaluation: {
          success: true,
          assessment: "Step was successful",
        },
        memory: [{ content: "learned something", importance: 0.8 }],
        nextGoal: "continue",
      },
      browserState: {
        url: "https://example.com",
        title: "Example",
        timestamp: Date.now(),
      },
      stepDuration: 2500,
      tokensUsed: 850,
      costUSD: 0.0025,
    };
  });

  it("should record history entry", async () => {
    const result = await finalizePhase(baseInput);

    expect(result.recorded).toBe(true);
  });

  it("should calculate metrics from action results", async () => {
    const result = await finalizePhase(baseInput);

    expect(result.metrics).toBeDefined();
    expect(result.metrics.stepNumber).toBe(1);
  });

  it("should calculate success rate", async () => {
    const result = await finalizePhase(baseInput);

    // 2 out of 3 actions succeeded
    expect(result.metrics.successRate).toBeCloseTo(0.667, 2);
  });

  it("should track tokens and cost", async () => {
    const result = await finalizePhase(baseInput);

    expect(result.metrics.tokensUsed).toBe(850);
    expect(result.metrics.cost).toBe(0.0025);
  });

  it("should record step duration", async () => {
    const result = await finalizePhase(baseInput);

    expect(result.metrics.duration).toBe(2500);
  });

  it("should handle all successful actions", async () => {
    const input: FinalizeInput = {
      ...baseInput,
      actionResults: [
        { success: true, output: "action1" },
        { success: true, output: "action2" },
      ],
    };

    const result = await finalizePhase(input);

    expect(result.metrics.successRate).toBe(1);
  });

  it("should handle all failed actions", async () => {
    const input: FinalizeInput = {
      ...baseInput,
      actionResults: [
        { success: false, error: "error1" },
        { success: false, error: "error2" },
      ],
    };

    const result = await finalizePhase(input);

    expect(result.metrics.successRate).toBe(0);
  });

  it("should handle empty action results", async () => {
    const input: FinalizeInput = {
      ...baseInput,
      actionResults: [],
    };

    const result = await finalizePhase(input);

    // Should handle gracefully without crashing
    expect(result.recorded).toBe(true);
  });

  it("should return history", async () => {
    const result = await finalizePhase(baseInput);

    expect(result.history).toBeDefined();
  });
});
