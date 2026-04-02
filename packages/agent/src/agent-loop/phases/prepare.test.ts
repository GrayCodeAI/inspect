/**
 * Tests for prepare phase
 */

import { Effect } from "effect";
import { describe, it, expect } from "vitest";
import { preparePhase, PrepareInput } from "./prepare.js";

describe("prepare phase", () => {
  it("should allow proceeding when within step limits", async () => {
    const input = new PrepareInput({
      goal: "test goal",
      stepNumber: 1,
      maxSteps: 10,
      maxFailures: 3,
      currentFailures: 0,
    });
    const result = await Effect.runPromise(preparePhase(input));

    expect(result.canProceed).toBe(true);
  });

  it("should prevent proceeding when max steps exceeded", async () => {
    const input = new PrepareInput({
      goal: "test goal",
      stepNumber: 10,
      maxSteps: 10,
      maxFailures: 3,
      currentFailures: 0,
    });
    const result = await Effect.runPromise(preparePhase(input));

    expect(result.canProceed).toBe(false);
    expect(result.stopReason).toBe("max_steps_exceeded");
  });

  it("should prevent proceeding when max failures exceeded", async () => {
    const input = new PrepareInput({
      goal: "test goal",
      stepNumber: 1,
      maxSteps: 10,
      maxFailures: 3,
      currentFailures: 3,
    });
    const result = await Effect.runPromise(preparePhase(input));

    expect(result.canProceed).toBe(false);
    expect(result.stopReason).toBe("max_failures_exceeded");
  });

  it("should mark first step correctly", async () => {
    const input = new PrepareInput({
      goal: "test goal",
      stepNumber: 0,
      maxSteps: 10,
      maxFailures: 3,
      currentFailures: 0,
    });
    const result = await Effect.runPromise(preparePhase(input));

    expect(result.isFirstStep).toBe(true);
  });

  it("should load memory from previous brains", async () => {
    const input = new PrepareInput({
      goal: "test goal",
      stepNumber: 1,
      maxSteps: 10,
      maxFailures: 3,
      currentFailures: 0,
      previousMemory: [
        {
          evaluation: { success: true, assessment: "test" },
          memory: [{ content: "important info", importance: 0.9 }],
          nextGoal: "continue",
        },
      ],
    });
    const result = await Effect.runPromise(preparePhase(input));

    const brain = result.brain as { memory?: unknown[] };
    expect(Array.isArray(brain.memory)).toBe(true);
  });

  it("should calculate progress correctly", async () => {
    const input = new PrepareInput({
      goal: "test goal",
      stepNumber: 3,
      maxSteps: 10,
      maxFailures: 5,
      currentFailures: 1,
    });
    const result = await Effect.runPromise(preparePhase(input));

    expect(result.progress.stepNumber).toBe(3);
    expect(result.progress.stepsRemaining).toBe(7);
    expect(result.progress.failuresRemaining).toBe(4);
  });
});
