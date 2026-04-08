import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { LoopDetector } from "./loop-detector-service.js";

describe("LoopDetector", () => {
  let detector: LoopDetector;

  beforeEach(() => {
    detector = new LoopDetector();
  });

  describe("detectLoop", () => {
    it("should detect simple infinite loop", async () => {
      const steps: Array<{ description: string; status: string }> = [];
      for (let i = 0; i < 10; i++) {
        steps.push({
          description: `Step ${i}: Navigate to page`,
          status: "pass",
        });
      }

      const hasLoop = await Effect.runPromise(detector.detectLoop(steps, { maxIterations: 5 }));
      expect(hasLoop).toBe(true);
    });

    it("should not detect loop if iterations are within threshold", async () => {
      const steps: Array<{ description: string; status: string }> = [];
      for (let i = 0; i < 5; i++) {
        steps.push({
          description: `Step ${i}: Navigate to page`,
          status: "pass",
        });
      }

      const hasLoop = await Effect.runPromise(detector.detectLoop(steps, { maxIterations: 10 }));
      expect(hasLoop).toBe(false);
    });

    it("should detect loop based on repeated descriptions", async () => {
      const steps: Array<{ description: string; status: string }> = [];
      // Create 8 steps with repeating pattern every 3 steps
      for (let i = 0; i < 8; i++) {
        steps.push({
          description: `Step ${i % 3}: Check element`,
          status: "pass",
        });
      }

      const hasLoop = await Effect.runPromise(detector.detectLoop(steps, { maxIterations: 6 }));
      expect(hasLoop).toBe(true);
    });

    it("should consider step status in loop detection", async () => {
      const steps: Array<{ description: string; status: string }> = [];
      // Create 6 steps with same description but alternating status
      for (let i = 0; i < 6; i++) {
        steps.push({
          description: `Step 1: Login`,
          status: i % 2 === 0 ? "pass" : "fail",
        });
      }

      // Should not be considered a loop because status differs
      const hasLoop = await Effect.runPromise(detector.detectLoop(steps, { maxIterations: 3 }));
      expect(hasLoop).toBe(false);
    });

    it("should allow custom maxIterations", async () => {
      const steps: Array<{ description: string; status: string }> = [];
      for (let i = 0; i < 10; i++) {
        steps.push({
          description: `Step ${i}: Process item`,
          status: "pass",
        });
      }

      // Strict threshold
      let hasLoop = await Effect.runPromise(detector.detectLoop(steps, { maxIterations: 5 }));
      expect(hasLoop).toBe(true);

      // Lenient threshold
      hasLoop = await Effect.runPromise(detector.detectLoop(steps, { maxIterations: 15 }));
      expect(hasLoop).toBe(false);
    });

    it("should handle empty step list", async () => {
      const hasLoop = await Effect.runPromise(detector.detectLoop([], { maxIterations: 5 }));
      expect(hasLoop).toBe(false);
    });
  });

  describe("getLoopInfo", () => {
    it("should return loop information including repeated step indices", async () => {
      const steps: Array<{ description: string; status: string }> = [];
      for (let i = 0; i < 8; i++) {
        steps.push({
          description: `Step ${i % 3}: Check element`,
          status: "pass",
        });
      }

      const loopInfo = await Effect.runPromise(detector.getLoopInfo(steps, { maxIterations: 6 }));
      expect(loopInfo).toBeInstanceOf(Object);
      expect(loopInfo.hasLoop).toBe(true);
      expect(loopInfo.repeatedIndices).toBeInstanceOf(Array);
      expect(loopInfo.repeatedIndices).toHaveLength(2); // Two indices that are part of the loop
    });

    it("should return null if no loop detected", async () => {
      const steps: Array<{ description: string; status: string }> = [];
      for (let i = 0; i < 5; i++) {
        steps.push({
          description: `Step ${i}: Unique action`,
          status: "pass",
        });
      }

      const loopInfo = await Effect.runPromise(detector.getLoopInfo(steps, { maxIterations: 10 }));
      expect(loopInfo).toBeNull();
    });
  });

  describe("getLoopDescription", () => {
    it("should return a human-readable loop description", async () => {
      const steps: Array<{ description: string; status: string }> = [];
      for (let i = 0; i < 8; i++) {
        steps.push({
          description: `Step ${i % 3}: Check element`,
          status: "pass",
        });
      }

      const loopInfo = await Effect.runPromise(detector.getLoopInfo(steps, { maxIterations: 6 }));

      if (!loopInfo) throw new Error("Loop expected");

      const description = await Effect.runPromise(detector.getLoopDescription(loopInfo));
      expect(description).toBeString();
      expect(description).toContain("repeated");
      expect(description).toContain("Step");
    });
  });

  describe("breakLoop", () => {
    it("should suggest a step to skip to break the loop", async () => {
      const steps: Array<{ description: string; status: string }> = [];
      for (let i = 0; i < 8; i++) {
        steps.push({
          description: `Step ${i % 3}: Check element`,
          status: "pass",
        });
      }

      const result = await Effect.runPromise(detector.breakLoop(steps, { maxIterations: 6 }));
      expect(result).toBeInstanceOf(Object);
      expect(result).toHaveProperty("stepIndex");
      expect(result.stepIndex).toBeNumber();
      expect(result).toHaveProperty("action", "skip");
    });

    it("should return null if no loop detected", async () => {
      const steps: Array<{ description: string; status: string }> = [];
      for (let i = 0; i < 5; i++) {
        steps.push({
          description: `Step ${i}: Unique action`,
          status: "pass",
        });
      }

      const result = await Effect.runPromise(detector.breakLoop(steps, { maxIterations: 10 }));
      expect(result).toBeNull();
    });
  });
});
