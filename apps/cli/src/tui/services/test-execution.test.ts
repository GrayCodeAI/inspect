import { describe, it, expect } from "vitest";
import { TestPlanStep } from "@inspect/shared";
import {
  createInitialState,
  formatElapsed,
  generateTestPlanSteps,
  getToolCallsForStep,
  delay,
  getRandomStepDelay,
  getInitialTokenCount,
  getStepTokenIncrement,
  getVerificationTokenCount,
} from "./test-execution.js";

describe("test-execution", () => {
  describe("createInitialState", () => {
    it("returns initial state with correct defaults", () => {
      const state = createInitialState();

      expect(state.steps).toEqual([]);
      expect(state.currentStep).toBe(0);
      expect(state.elapsed).toBe(0);
      expect(state.tokenCount).toBe(0);
      expect(state.phase).toBe("planning");
      expect(state.liveToolCall).toBeNull();
      expect(state.scrollOffset).toBe(0);
    });
  });

  describe("formatElapsed", () => {
    it("formats seconds only", () => {
      expect(formatElapsed(45)).toBe("0:45");
      expect(formatElapsed(5)).toBe("0:05");
    });

    it("formats minutes and seconds", () => {
      expect(formatElapsed(65)).toBe("1:05");
      expect(formatElapsed(125)).toBe("2:05");
    });

    it("pads seconds with leading zero", () => {
      expect(formatElapsed(60)).toBe("1:00");
      expect(formatElapsed(61)).toBe("1:01");
    });
  });

  describe("generateTestPlanSteps", () => {
    it("generates 6 default steps", () => {
      const steps = generateTestPlanSteps();

      expect(steps).toHaveLength(6);
      expect(steps[0]).toBeInstanceOf(TestPlanStep);
    });

    it("generates steps with correct instructions", () => {
      const steps = generateTestPlanSteps();

      expect(steps[0].instruction).toBe("Navigate to the application");
      expect(steps[1].instruction).toBe("Verify page loads without errors");
      expect(steps[2].instruction).toBe("Test primary user interaction");
    });

    it("generates steps with pending status", () => {
      const steps = generateTestPlanSteps();

      for (const step of steps) {
        expect(step.status).toBe("pending");
      }
    });

    it("generates steps with unique ids", () => {
      const steps = generateTestPlanSteps();
      const ids = steps.map((s) => s.id);

      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("getToolCallsForStep", () => {
    it("returns tool call for step 0", () => {
      const call = getToolCallsForStep(0, "http://example.com");

      expect(call.tool).toBe("browser_navigate");
      expect(call.args).toHaveProperty("url", "http://example.com");
    });

    it("returns tool call for step 1", () => {
      const call = getToolCallsForStep(1, "http://example.com");

      expect(call.tool).toBe("browser_snapshot");
      expect(call.args).toHaveProperty("mode", "hybrid");
    });

    it("cycles through tool calls", () => {
      const call0 = getToolCallsForStep(0, "http://example.com");
      const call6 = getToolCallsForStep(6, "http://example.com");

      expect(call0.tool).toBe(call6.tool);
    });

    it("generates correct ref for click action", () => {
      const call = getToolCallsForStep(2, "http://example.com");

      expect(call.tool).toBe("browser_click");
      expect(call.args).toHaveProperty("ref", "e3");
    });
  });

  describe("delay", () => {
    it("resolves after specified milliseconds", async () => {
      const start = Date.now();
      await delay(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("getRandomStepDelay", () => {
    it("returns value within expected range", () => {
      for (let i = 0; i < 10; i++) {
        const delay = getRandomStepDelay();

        expect(delay).toBeGreaterThanOrEqual(800);
        expect(delay).toBeLessThanOrEqual(2000);
      }
    });

    it("returns different values on subsequent calls", () => {
      const delays = new Set();

      for (let i = 0; i < 5; i++) {
        delays.add(getRandomStepDelay());
      }

      // With 5 random values, very unlikely they're all the same
      expect(delays.size).toBeGreaterThan(1);
    });
  });

  describe("token count helpers", () => {
    it("getInitialTokenCount returns 245", () => {
      expect(getInitialTokenCount()).toBe(245);
    });

    it("getVerificationTokenCount returns 180", () => {
      expect(getVerificationTokenCount()).toBe(180);
    });

    it("getStepTokenIncrement returns value in expected range", () => {
      for (let i = 0; i < 10; i++) {
        const increment = getStepTokenIncrement();

        expect(increment).toBeGreaterThanOrEqual(120);
        expect(increment).toBeLessThan(200);
      }
    });
  });
});
