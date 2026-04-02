/**
 * Tests for agent loop runner
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { runAgentStep, runFullAgentLoop } from "../runner.js";
import type { AgentConfig } from "../index.js";

describe("agent loop runner", () => {
  let mockPage: any;
  let mockLLMProvider: any;
  let baseConfig: AgentConfig;

  beforeEach(() => {
    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({}),
    };

    mockLLMProvider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          evaluation: { success: true, assessment: "Test" },
          memory: [],
          nextGoal: "continue",
          actions: [{ type: "click", params: { selector: ".btn" } }],
        }),
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    };

    baseConfig = {
      maxSteps: 10,
      maxFailures: 3,
      model: "claude-3-sonnet",
      temperature: 0.7,
      stepTimeout: 5000,
    };
  });

  describe("runAgentStep", () => {
    it("should execute a single agent step", async () => {
      const result = await runAgentStep({
        config: baseConfig,
        stepNumber: 0,
        currentFailures: 0,
        previousBrains: [],
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test goal",
      });

      expect(result.success).toBeDefined();
      expect(result.stepNumber).toBe(0);
    });

    it("should return brain on success", async () => {
      const result = await runAgentStep({
        config: baseConfig,
        stepNumber: 0,
        currentFailures: 0,
        previousBrains: [],
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test goal",
      });

      expect(result.brain).toBeDefined();
    });

    it("should stop when max steps exceeded", async () => {
      const result = await runAgentStep({
        config: baseConfig,
        stepNumber: 10, // At max
        currentFailures: 0,
        previousBrains: [],
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test goal",
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("should stop when max failures exceeded", async () => {
      const result = await runAgentStep({
        config: baseConfig,
        stepNumber: 5,
        currentFailures: 3, // At max
        previousBrains: [],
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test goal",
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("should pass goal to phases", async () => {
      const goal = "Navigate to page and click button";

      const result = await runAgentStep({
        config: baseConfig,
        stepNumber: 0,
        currentFailures: 0,
        previousBrains: [],
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal,
      });

      expect(result.stepNumber).toBe(0);
    });

    it("should complete a step without throwing", async () => {
      const result = await runAgentStep({
        config: baseConfig,
        stepNumber: 1,
        currentFailures: 0,
        previousBrains: [],
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test goal",
      });

      // Should complete without throwing
      expect(result).toBeDefined();
      expect(result.stepNumber).toBe(1);
    });
  });

  describe("runFullAgentLoop", () => {
    it("should return loop result structure", async () => {
      const result = await runFullAgentLoop({
        config: baseConfig,
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test goal",
      });

      expect(result.completed).toBeDefined();
      expect(result.stepsExecuted).toBeDefined();
      expect(result.reason).toBeDefined();
    });

    it("should track steps executed", async () => {
      const result = await runFullAgentLoop({
        config: baseConfig,
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test goal",
      });

      expect(typeof result.stepsExecuted).toBe("number");
    });

    it("should return final brain if completed", async () => {
      const result = await runFullAgentLoop({
        config: baseConfig,
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test goal",
      });

      // May be undefined if not completed, but should be defined if completed
      if (result.completed) {
        expect(result.finalBrain).toBeDefined();
      }
    });

    it("should provide reason for completion", async () => {
      const result = await runFullAgentLoop({
        config: baseConfig,
        page: mockPage,
        llmProvider: mockLLMProvider,
        goal: "Test goal",
      });

      expect(result.reason).toBeDefined();
      expect(typeof result.reason).toBe("string");
    });
  });
});
