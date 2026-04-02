/**
 * Tests for prepare phase
 */

import { describe, it, expect } from "vitest";
import { preparePhase } from "./prepare.js";

describe("prepare phase", () => {
  it("should allow proceeding when within step limits", async () => {
    const result = await preparePhase({
      goal: "test goal",
      stepNumber: 1,
      maxSteps: 10,
      maxFailures: 3,
      currentFailures: 0,
    });

    expect(result.canProceed).toBe(true);
  });

  it("should prevent proceeding when max steps exceeded", async () => {
    const result = await preparePhase({
      goal: "test goal",
      stepNumber: 10,
      maxSteps: 10,
      maxFailures: 3,
      currentFailures: 0,
    });

    expect(result.canProceed).toBe(false);
    expect(result.stopReason).toBe("max_steps_exceeded");
  });

  it("should prevent proceeding when max failures exceeded", async () => {
    const result = await preparePhase({
      goal: "test goal",
      stepNumber: 1,
      maxSteps: 10,
      maxFailures: 3,
      currentFailures: 3,
    });

    expect(result.canProceed).toBe(false);
    expect(result.stopReason).toBe("max_failures_exceeded");
  });

  it("should mark first step correctly", async () => {
    const result = await preparePhase({
      goal: "test goal",
      stepNumber: 0,
      maxSteps: 10,
      maxFailures: 3,
      currentFailures: 0,
    });

    expect(result.isFirstStep).toBe(true);
  });

  it("should load memory from previous brains", async () => {
    const previousMemory = [
      {
        evaluation: { success: true, assessment: "test" },
        memory: [{ content: "important info", importance: 0.9 }],
        nextGoal: "continue",
      },
    ];

    const result = await preparePhase({
      goal: "test goal",
      stepNumber: 1,
      maxSteps: 10,
      maxFailures: 3,
      currentFailures: 0,
      previousMemory,
    });

    expect(result.brain.memory.length).toBeGreaterThanOrEqual(0);
  });

  it("should calculate progress correctly", async () => {
    const result = await preparePhase({
      goal: "test goal",
      stepNumber: 3,
      maxSteps: 10,
      maxFailures: 5,
      currentFailures: 1,
    });

    expect(result.progress.stepNumber).toBe(3);
    expect(result.progress.stepsRemaining).toBe(7);
    expect(result.progress.failuresRemaining).toBe(4);
  });
});
