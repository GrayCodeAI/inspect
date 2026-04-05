// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/**
 * Tests for agent loop runner
 */

import { Effect, Layer } from "effect";
import { describe, it, expect, beforeEach } from "vitest";
import { runAgentStep, runFullAgentLoop } from "../runner.js";
import type { AgentConfig } from "../types.js";
import { LLMProviderService } from "@inspect/llm";
import { BrowserManagerService } from "@inspect/browser";

const testLayer = Layer.merge(LLMProviderService.layer, BrowserManagerService.layer);

describe("agent loop runner", () => {
  let baseConfig: AgentConfig;

  beforeEach(() => {
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
      const result = await Effect.runPromise(
        runAgentStep({
          config: baseConfig,
          stepNumber: 0,
          currentFailures: 0,
          previousBrains: [],
          goal: "Test goal",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result.success).toBeDefined();
      expect(result.stepNumber).toBe(0);
    });

    it("should return brain on success", async () => {
      const result = await Effect.runPromise(
        runAgentStep({
          config: baseConfig,
          stepNumber: 0,
          currentFailures: 0,
          previousBrains: [],
          goal: "Test goal",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result.brain).toBeDefined();
    });

    it("should stop when max steps exceeded", async () => {
      const result = await Effect.runPromise(
        runAgentStep({
          config: baseConfig,
          stepNumber: 10,
          currentFailures: 0,
          previousBrains: [],
          goal: "Test goal",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("should stop when max failures exceeded", async () => {
      const result = await Effect.runPromise(
        runAgentStep({
          config: baseConfig,
          stepNumber: 5,
          currentFailures: 3,
          previousBrains: [],
          goal: "Test goal",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("should pass goal to phases", async () => {
      const goal = "Navigate to page and click button";

      const result = await Effect.runPromise(
        runAgentStep({
          config: baseConfig,
          stepNumber: 0,
          currentFailures: 0,
          previousBrains: [],
          goal,
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result.stepNumber).toBe(0);
    });

    it("should complete a step without throwing", async () => {
      const result = await Effect.runPromise(
        runAgentStep({
          config: baseConfig,
          stepNumber: 1,
          currentFailures: 0,
          previousBrains: [],
          goal: "Test goal",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result).toBeDefined();
      expect(result.stepNumber).toBe(1);
    });
  });

  describe("runFullAgentLoop", () => {
    it("should return loop result structure", async () => {
      const result = await Effect.runPromise(
        runFullAgentLoop({
          config: baseConfig,
          goal: "Test goal",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result.completed).toBeDefined();
      expect(result.stepsExecuted).toBeDefined();
      expect(result.reason).toBeDefined();
    });

    it("should track steps executed", async () => {
      const result = await Effect.runPromise(
        runFullAgentLoop({
          config: baseConfig,
          goal: "Test goal",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(typeof result.stepsExecuted).toBe("number");
    });

    it("should return final brain if completed", async () => {
      const result = await Effect.runPromise(
        runFullAgentLoop({
          config: baseConfig,
          goal: "Test goal",
        }).pipe(Effect.provide(testLayer)),
      );

      if (result.completed) {
        expect(result.finalBrain).toBeDefined();
      }
    });

    it("should provide reason for completion", async () => {
      const result = await Effect.runPromise(
        runFullAgentLoop({
          config: baseConfig,
          goal: "Test goal",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result.reason).toBeDefined();
      expect(typeof result.reason).toBe("string");
    });
  });
});
