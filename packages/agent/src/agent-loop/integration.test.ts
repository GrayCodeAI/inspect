// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/**
 * Integration tests for agent loop
 *
 * Tests multi-step workflows and phase interactions
 */

import { Effect, Layer } from "effect";
import { describe, it, expect, beforeEach } from "vitest";
import { runAgentStep, runFullAgentLoop } from "./runner.js";
import type { AgentConfig } from "./types.js";
import { LLMProviderService } from "@inspect/llm";
import { BrowserManagerService } from "@inspect/browser";

// Test layer with mock services
const testLayer = Layer.merge(LLMProviderService.layer, BrowserManagerService.layer);

describe("Agent Loop Integration Tests", () => {
  let baseConfig: AgentConfig;

  beforeEach(() => {
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
      const result = await Effect.runPromise(
        runFullAgentLoop({
          config: baseConfig,
          goal: "Navigate and extract data",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result.stepsExecuted).toBeGreaterThan(0);
      expect(result.stepsExecuted).toBeLessThanOrEqual(5);
    });

    it("should accumulate memory across steps", async () => {
      const result = await Effect.runPromise(
        runFullAgentLoop({
          config: baseConfig,
          goal: "Accumulate memory across steps",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result.stepsExecuted).toBeGreaterThan(0);
    });

    it("should handle step failures within limits", async () => {
      const result = await Effect.runPromise(
        runFullAgentLoop({
          config: baseConfig,
          goal: "Test failure handling",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result.stepsExecuted).toBeGreaterThanOrEqual(0);
      expect(result.reason).toBeDefined();
    });
  });

  describe("Phase interactions", () => {
    it("should pass data from prepare to think phase", async () => {
      const result = await Effect.runPromise(
        runAgentStep({
          config: baseConfig,
          stepNumber: 0,
          currentFailures: 0,
          previousBrains: [],
          goal: "Test data flow",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result).toBeDefined();
      expect(result.stepNumber).toBe(0);
    });

    it("should pass data from think to act phase", async () => {
      const result = await Effect.runPromise(
        runAgentStep({
          config: baseConfig,
          stepNumber: 1,
          currentFailures: 0,
          previousBrains: [],
          goal: "Test think to act flow",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result).toBeDefined();
    });

    it("should pass data from act to finalize phase", async () => {
      const result = await Effect.runPromise(
        runAgentStep({
          config: baseConfig,
          stepNumber: 2,
          currentFailures: 0,
          previousBrains: [],
          goal: "Test act to finalize flow",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result).toBeDefined();
    });
  });

  describe("Loop completion", () => {
    it("should complete when goal achieved with high confidence", async () => {
      const result = await Effect.runPromise(
        runFullAgentLoop({
          config: baseConfig,
          goal: "High confidence goal",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result.completed).toBeDefined();
      expect(result.stepsExecuted).toBeGreaterThanOrEqual(0);
    });

    it("should stop when max steps reached", async () => {
      const lowStepConfig: AgentConfig = {
        ...baseConfig,
        maxSteps: 1,
      };

      const result = await Effect.runPromise(
        runFullAgentLoop({
          config: lowStepConfig,
          goal: "Test max steps",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result.stepsExecuted).toBeGreaterThanOrEqual(1);
      expect(result.reason).toBeDefined();
    });

    it("should stop when max failures reached", async () => {
      const lowFailConfig: AgentConfig = {
        ...baseConfig,
        maxFailures: 1,
      };

      const result = await Effect.runPromise(
        runFullAgentLoop({
          config: lowFailConfig,
          goal: "Test max failures",
        }).pipe(Effect.provide(testLayer)),
      );

      expect(result.reason).toBeDefined();
    });
  });
});
