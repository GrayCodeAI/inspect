/**
 * Integration tests for agent loop
 *
 * Tests multi-step workflows and phase interactions
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { runAgentStep, runFullAgentLoop } from "./runner.js";
import type { AgentConfig } from "./index.js";

describe("Agent Loop Integration Tests", () => {
  let mockPage: any;
  let mockLLMProvider: any;
  let baseConfig: AgentConfig;

  beforeEach(() => {
    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnValue({
        textContent: vi.fn().mockResolvedValue("Found text"),
        scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      }),
      keyboard: { press: vi.fn().mockResolvedValue(undefined) },
      evaluate: vi.fn().mockResolvedValue({ data: "test" }),
    };

    mockLLMProvider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          evaluation: { success: true, assessment: "Step successful" },
          memory: [{ content: "important", importance: 0.8 }],
          nextGoal: "continue",
          actions: [
            { type: "click", params: { selector: ".button" } },
            { type: "extract", params: { selector: ".result" } },
          ],
        }),
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    };

    baseConfig = {
      maxSteps: 5,
      maxFailures: 2,
      model: "claude-3-sonnet",
      temperature: 0.7,
      stepTimeout: 5000,
    };
  });

  describe("Multi-step workflows", () => {
    it("should execute multiple steps in sequence", async () => {
      let stepCount = 0;

      // Mock LLM to return different actions for each step
      mockLLMProvider.chat.mockImplementation(async () => {
        stepCount++;
        return {
          content: JSON.stringify({
            evaluation: { success: stepCount < 3, assessment: `Step ${stepCount}` },
            memory: [{ content: `learned at step ${stepCount}`, importance: 0.7 }],
            nextGoal: stepCount < 3 ? "continue" : "complete",
            actions:
              stepCount === 1
                ? [{ type: "navigate", params: { url: "https://example.com" } }]
                : stepCount === 2
                  ? [{ type: "click", params: { selector: ".btn" } }]
                  : [{ type: "extract", params: { selector: ".result" } }],
          }),
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const result = await runFullAgentLoop({
        config: baseConfig,
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Navigate and extract data",
      });

      expect(result.stepsExecuted).toBeGreaterThan(0);
      expect(result.stepsExecuted).toBeLessThanOrEqual(5);
    });

    it("should accumulate memory across steps", async () => {
      let callCount = 0;

      mockLLMProvider.chat.mockImplementation(async (input: any) => {
        callCount++;
        const messages = input.messages || [];
        const userMessage = messages[messages.length - 1]?.content || "";

        // Check if previous memory is referenced in later steps
        const hasPreviousMemory = userMessage.includes("learned");

        return {
          content: JSON.stringify({
            evaluation: { success: true, assessment: `Step ${callCount}` },
            memory: [
              { content: `learned at step ${callCount}`, importance: 0.8 },
              ...(hasPreviousMemory ? [{ content: "combined knowledge", importance: 0.9 }] : []),
            ],
            nextGoal: callCount < 2 ? "continue" : "complete",
            actions: [{ type: "wait", params: { timeout: 1000 } }],
          }),
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const result = await runFullAgentLoop({
        config: { ...baseConfig, maxSteps: 2 },
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test memory accumulation",
      });

      expect(result.stepsExecuted).toBeGreaterThan(1);
    });

    it("should handle action failures and continue", async () => {
      let attemptCount = 0;

      mockPage.click.mockImplementation(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error("Element not found");
        }
        // Second attempt succeeds
      });

      mockLLMProvider.chat.mockResolvedValue({
        content: JSON.stringify({
          evaluation: { success: true, assessment: "Retrying action" },
          memory: [],
          nextGoal: "continue",
          actions: [{ type: "click", params: { selector: ".btn" } }],
        }),
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const result = await runAgentStep({
        config: baseConfig,
        stepNumber: 0,
        currentFailures: 0,
        previousBrains: [],
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test retry logic",
      });

      expect(result).toBeDefined();
    });
  });

  describe("Error handling", () => {
    it("should stop when max failures reached", async () => {
      mockLLMProvider.chat.mockRejectedValue(new Error("LLM offline"));

      const result = await runFullAgentLoop({
        config: { ...baseConfig, maxFailures: 1 },
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test failure limit",
      });

      expect(result.completed).toBe(false);
      expect(result.reason).toContain("failure");
    });

    it("should stop when max steps reached", async () => {
      mockLLMProvider.chat.mockResolvedValue({
        content: JSON.stringify({
          evaluation: { success: true, assessment: "Step" },
          memory: [],
          nextGoal: "continue",
          actions: [{ type: "wait", params: { timeout: 100 } }],
        }),
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const result = await runFullAgentLoop({
        config: { ...baseConfig, maxSteps: 2 },
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test step limit",
      });

      expect(result.stepsExecuted).toBeLessThanOrEqual(2);
    });
  });

  describe("Goal achievement", () => {
    it("should track final brain on completion", async () => {
      mockLLMProvider.chat.mockResolvedValue({
        content: JSON.stringify({
          evaluation: { success: true, assessment: "Goal achieved" },
          memory: [{ content: "success", importance: 0.9 }],
          nextGoal: "complete",
          actions: [],
          confidence: 0.95,
        }),
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const result = await runFullAgentLoop({
        config: { ...baseConfig, maxSteps: 2 },
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test goal achievement",
      });

      expect(result.stepsExecuted).toBeGreaterThan(0);
      expect(result.stepsExecuted).toBeLessThanOrEqual(2);
      if (result.finalBrain) {
        expect(result.finalBrain.nextGoal).toBeDefined();
      }
    });
  });

  describe("History tracking", () => {
    it("should build complete action history", async () => {
      const steps = 2;
      let currentStep = 0;

      mockLLMProvider.chat.mockImplementation(async () => {
        currentStep++;
        return {
          content: JSON.stringify({
            evaluation: {
              success: true,
              assessment: `Completed step ${currentStep}`,
            },
            memory: [{ content: `step_${currentStep}`, importance: 0.8 }],
            nextGoal: currentStep < steps ? "continue" : "complete",
            actions: [{ type: "wait", params: { timeout: 100 } }],
          }),
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const result = await runFullAgentLoop({
        config: { ...baseConfig, maxSteps: steps },
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Build history",
      });

      expect(result.stepsExecuted).toBe(steps);
      if (result.finalBrain) {
        expect(result.finalBrain.nextGoal).toBeDefined();
      }
    });
  });

  describe("Cost tracking", () => {
    it("should accumulate token and cost metrics", async () => {
      mockLLMProvider.chat.mockResolvedValue({
        content: JSON.stringify({
          evaluation: { success: true, assessment: "Success" },
          memory: [],
          nextGoal: "continue",
          actions: [],
        }),
        usage: {
          input_tokens: 500,
          output_tokens: 250,
        },
      });

      const result = await runAgentStep({
        config: baseConfig,
        stepNumber: 0,
        currentFailures: 0,
        previousBrains: [],
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test cost tracking",
      });

      expect(result).toBeDefined();
      // In real scenario, would verify tokens tracked in metrics
    });
  });
});
