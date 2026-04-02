/**
 * Agent Loop Integration Test
 *
 * Tests the complete agent loop with all four phases.
 */

import { Effect, Layer } from "effect";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AgentLoop, AgentLoopConfig } from "./agent-loop.js";
import { LLMProviderService } from "@inspect/llm";

// Mock BrowserSession for testing
const createMockBrowserSession = () => ({
  navigate: (url: string) => Effect.logDebug(`Navigating to ${url}`),
  close: Effect.logDebug("Browser closed"),
  url: Effect.succeed("https://example.com"),
  title: Effect.succeed("Example Domain"),
  screenshot: (_path?: string) => Effect.succeed("data:image/png;base64,mock"),
  evaluate: <T>(_script: string) => Effect.succeed("<html><body>Mock DOM</body></html>" as unknown as T),
  click: (selector: string) => Effect.logDebug(`Clicked ${selector}`),
  type: (selector: string, text: string) => Effect.logDebug(`Typed "${text}" in ${selector}`),
  getText: (selector: string) => Effect.succeed(`Text from ${selector}`),
  isVisible: (_selector: string) => Effect.succeed(true),
  consoleLogs: Effect.succeed([] as const),
});

describe("AgentLoop", () => {
  it("should run complete loop with all phases", async () => {
    const config = new AgentLoopConfig({
      goal: "Test the login page",
      maxSteps: 5,
      timeout: 30000,
      model: "claude-3-sonnet",
      temperature: 0.7,
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const loop = yield* AgentLoop;
        const state = yield* loop.run(config);
        return state;
      }).pipe(
        Effect.provide(Layer.merge(AgentLoop.layer, LLMProviderService.layer)),
      ),
    );

    expect(result).toBeDefined();
    expect(result.goal).toBe("Test the login page");
    expect(result.currentStep).toBeGreaterThanOrEqual(0);
    expect(result.maxSteps).toBe(5);
  });

  it("should complete loop in under max steps", async () => {
    const config = new AgentLoopConfig({
      goal: "Verify page loads",
      maxSteps: 3,
      timeout: 60000,
      model: "claude-3-sonnet",
      temperature: 0.7,
    });

    const startTime = Date.now();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const loop = yield* AgentLoop;
        const state = yield* loop.run(config);
        return state;
      }).pipe(
        Effect.provide(Layer.merge(AgentLoop.layer, LLMProviderService.layer)),
      ),
    );

    const elapsed = Date.now() - startTime;

    expect(result.currentStep).toBeLessThanOrEqual(config.maxSteps);
    expect(elapsed).toBeLessThan(config.timeout);
  });

  it("should track observations throughout execution", async () => {
    const config = new AgentLoopConfig({
      goal: "Collect page observations",
      maxSteps: 2,
      timeout: 30000,
      model: "claude-3-sonnet",
      temperature: 0.7,
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const loop = yield* AgentLoop;
        const state = yield* loop.run(config);
        return state;
      }).pipe(
        Effect.provide(Layer.merge(AgentLoop.layer, LLMProviderService.layer)),
      ),
    );

    expect(result.observations).toBeDefined();
    expect(Array.isArray(result.observations)).toBe(true);
  });

  it("should track all steps with actions and results", async () => {
    const config = new AgentLoopConfig({
      goal: "Execute test steps",
      maxSteps: 2,
      timeout: 30000,
      model: "claude-3-sonnet",
      temperature: 0.7,
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const loop = yield* AgentLoop;
        const state = yield* loop.run(config);
        return state;
      }).pipe(
        Effect.provide(Layer.merge(AgentLoop.layer, LLMProviderService.layer)),
      ),
    );

    expect(result.steps).toBeDefined();
    for (const step of result.steps) {
      expect(step.action).toBeDefined();
      expect(step.action.id).toBeDefined();
      expect(step.action.name).toBeDefined();
      expect(step.result).toBeDefined();
      expect(step.result.success).toBeDefined();
      expect(step.timestamp).toBeDefined();
    }
  });

  it("should use browser session when provided", async () => {
    const config = new AgentLoopConfig({
      goal: "Test with browser",
      maxSteps: 2,
      timeout: 30000,
      model: "claude-3-sonnet",
      temperature: 0.7,
      url: "https://example.com",
    });

    const session = createMockBrowserSession();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const loop = yield* AgentLoop;
        const state = yield* loop.run(config, session as any);
        return state;
      }).pipe(
        Effect.provide(Layer.merge(AgentLoop.layer, LLMProviderService.layer)),
      ),
    );

    expect(result).toBeDefined();
    expect(result.goal).toBe("Test with browser");
    expect(result.lastUrl).toBe("https://example.com");
    expect(result.sessionId).toBeDefined();
    expect(result.observations.length).toBeGreaterThan(0);
  });
});
