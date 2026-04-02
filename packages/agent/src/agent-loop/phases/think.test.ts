/**
 * Tests for think phase
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { thinkPhase } from "./think.js";
import type { ThinkInput } from "./think.js";

describe("think phase", () => {
  let mockLLMProvider: any;
  let baseInput: ThinkInput;

  beforeEach(() => {
    mockLLMProvider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          evaluation: { success: true, assessment: "Test evaluation" },
          memory: [{ content: "test", importance: 0.8 }],
          nextGoal: "continue testing",
          actions: [{ type: "click", params: { selector: ".btn" } }],
        }),
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    };

    baseInput = {
      observations: [
        {
          type: "dom",
          content: "Test DOM content",
          timestamp: Date.now(),
        },
      ],
      goal: "Complete task",
      previousThoughts: [],
      llmProvider: mockLLMProvider,
      systemPrompt: "You are a helpful assistant",
      model: "claude-3-sonnet",
      temperature: 0.7,
      maxTokens: 2000,
    };
  });

  it("should return brain from LLM response", async () => {
    const result = await thinkPhase(baseInput);

    expect(result.brain).toBeDefined();
    expect(result.brain.evaluation).toBeDefined();
  });

  it("should return actions from LLM response", async () => {
    const result = await thinkPhase(baseInput);

    expect(result.actions).toBeDefined();
    expect(Array.isArray(result.actions)).toBe(true);
  });

  it("should calculate confidence between 0 and 1", async () => {
    const result = await thinkPhase(baseInput);

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("should track tokens used", async () => {
    const result = await thinkPhase(baseInput);

    expect(result.tokensUsed).toBeGreaterThanOrEqual(0);
    expect(typeof result.tokensUsed).toBe("number");
  });

  it("should calculate cost in USD", async () => {
    const result = await thinkPhase(baseInput);

    expect(result.costUSD).toBeGreaterThanOrEqual(0);
    expect(typeof result.costUSD).toBe("number");
  });

  it("should handle observations with goal", async () => {
    const result = await thinkPhase(baseInput);

    expect(result.brain.nextGoal).toBeDefined();
  });

  it("should use previous thoughts as context", async () => {
    const input: ThinkInput = {
      ...baseInput,
      previousThoughts: [
        {
          evaluation: { success: false, assessment: "Initial attempt failed" },
          memory: [],
          nextGoal: "Try again",
        },
      ],
    };

    const result = await thinkPhase(input);

    expect(result.brain).toBeDefined();
  });
});
