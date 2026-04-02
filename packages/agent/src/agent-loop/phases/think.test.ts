/**
 * Tests for think phase
 */

import { Effect } from "effect";
import { describe, it, expect, beforeEach } from "vitest";
import { thinkPhase, ThinkInput } from "./think.js";
import { LLMProviderService } from "@inspect/llm";

const testLayer = LLMProviderService.layer;

describe("think phase", () => {
  let baseInput: ThinkInput;

  beforeEach(() => {
    baseInput = new ThinkInput({
      observations: [
        {
          type: "dom",
          content: "Test DOM content",
          timestamp: Date.now(),
        },
      ],
      goal: "Complete task",
      previousThoughts: [],
      systemPrompt: "You are a helpful assistant",
      model: "claude-3-sonnet",
      temperature: 0.7,
      maxTokens: 2000,
    });
  });

  it("should return brain from LLM response", async () => {
    const result = await Effect.runPromise(
      thinkPhase(baseInput).pipe(Effect.provide(testLayer)),
    );

    expect(result.brain).toBeDefined();
  });

  it("should return actions from LLM response", async () => {
    const result = await Effect.runPromise(
      thinkPhase(baseInput).pipe(Effect.provide(testLayer)),
    );

    expect(result.actions).toBeDefined();
    expect(Array.isArray(result.actions)).toBe(true);
  });

  it("should calculate confidence between 0 and 1", async () => {
    const result = await Effect.runPromise(
      thinkPhase(baseInput).pipe(Effect.provide(testLayer)),
    );

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("should track tokens used", async () => {
    const result = await Effect.runPromise(
      thinkPhase(baseInput).pipe(Effect.provide(testLayer)),
    );

    expect(result.tokensUsed).toBeGreaterThanOrEqual(0);
    expect(typeof result.tokensUsed).toBe("number");
  });

  it("should calculate cost in USD", async () => {
    const result = await Effect.runPromise(
      thinkPhase(baseInput).pipe(Effect.provide(testLayer)),
    );

    expect(result.costUSD).toBeGreaterThanOrEqual(0);
    expect(typeof result.costUSD).toBe("number");
  });

  it("should handle observations with goal", async () => {
    const result = await Effect.runPromise(
      thinkPhase(baseInput).pipe(Effect.provide(testLayer)),
    );

    const brain = result.brain as { nextGoal?: string };
    expect(brain.nextGoal).toBeDefined();
  });

  it("should use previous thoughts as context", async () => {
    const input = new ThinkInput({
      ...baseInput,
      previousThoughts: [
        {
          evaluation: { success: false, assessment: "Initial attempt failed" },
          memory: [],
          nextGoal: "Try again",
        },
      ],
    });

    const result = await Effect.runPromise(thinkPhase(input).pipe(Effect.provide(testLayer)));

    expect(result.brain).toBeDefined();
  });
});
