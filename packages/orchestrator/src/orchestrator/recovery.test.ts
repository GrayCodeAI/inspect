import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";
import {
  RecoveryManager,
  FailureType,
  RecoveryStrategy,
  DiagnosisResult,
  RecoveryAttempt,
} from "./recovery.js";

// Mock recovery executors
const mockExecutors = {
  reScan: () => Effect.succeed(true),
  useVision: () => Effect.succeed(true),
  healSelector: () => Effect.succeed(true),
  waitForLoad: () => Effect.succeed(true),
  switchModel: () => Effect.succeed(true),
  restart: () => Effect.succeed(true),
  scrollIntoView: () => Effect.succeed(true),
  dismissOverlay: () => Effect.succeed(true),
  refreshPage: () => Effect.succeed(true),
  clearState: () => Effect.succeed(true),
};

describe("RecoveryManager", () => {
  let recoveryManager: RecoveryManager;

  beforeEach(() => {
    recoveryManager = new RecoveryManager();
  });

  afterEach(() => {
    // Reset history
    recoveryManager.clearHistory();
  });

  describe("diagnose", () => {
    it("should diagnose element_not_found from error message", async () => {
      const diagnosis = await Effect.runPromise(
        recoveryManager.diagnose("Element not found: #submit-button", {
          selector: "#submit-button",
        }),
      );
      expect(diagnosis.failureType).toEqual("element_not_found");
      expect(diagnosis.confidence).toBeGreaterThan(0.8);
      expect(diagnosis.suggestedStrategies).toContain("reScan");
      expect(diagnosis.suggestedStrategies).toContain("healSelector");
    });

    it("should diagnose navigation_timeout from error message", async () => {
      const diagnosis = await Effect.runPromise(
        recoveryManager.diagnose("Navigation timed out after 30000ms", {
          url: "http://example.com",
        }),
      );
      expect(diagnosis.failureType).toEqual("navigation_timeout");
      expect(diagnosis.confidence).toBeGreaterThan(0.6);
      expect(diagnosis.suggestedStrategies).toContain("waitForLoad");
      expect(diagnosis.suggestedStrategies).toContain("retry");
    });

    it("should diagnose unknown failure when no pattern matches", async () => {
      const diagnosis = await Effect.runPromise(
        recoveryManager.diagnose("Unexpected error: something went wrong", {
          url: "http://example.com",
        }),
      );
      expect(diagnosis.failureType).toEqual("unknown");
      expect(diagnosis.confidence).toBeCloseTo(0.3);
      expect(diagnosis.suggestedStrategies).toContain("retry");
      expect(diagnosis.suggestedStrategies).toContain("reScan");
    });

    it("should include context in diagnosis result", async () => {
      const diagnosis = await Effect.runPromise(
        recoveryManager.diagnose("Element not found: #email", {
          selector: "#email",
          url: "http://example.com",
        }),
      );
      expect(diagnosis.context).toEqual({
        errorMessage: "Element not found: #email",
        selector: "#email",
        url: "http://example.com",
      });
    });
  });

  describe("recover", () => {
    it("should successfully recover using a working strategy", async () => {
      const diagnosis = await Effect.runPromise(
        recoveryManager.diagnose("Element not found: #submit-button", {
          selector: "#submit-button",
        }),
      );
      const success = await Effect.runPromise(
        recoveryManager.recover(diagnosis, {
          ...mockExecutors,
          reScan: () => Effect.succeed(true),
        }),
      );
      expect(success).toEqual(true);
    });

    it("should fail after all strategies fail", async () => {
      const diagnosis = await Effect.runPromise(
        recoveryManager.diagnose("Element not found: #submit-button", {
          selector: "#submit-button",
        }),
      );
      const success = await Effect.runPromise(
        recoveryManager.recover(diagnosis, {
          ...mockExecutors,
          reScan: () => Effect.succeed(false),
          scrollIntoView: () => Effect.succeed(false),
          useVision: () => Effect.succeed(false),
          healSelector: () => Effect.succeed(false),
          waitForLoad: () => Effect.succeed(false),
          retry: () => Effect.succeed(false),
        }),
      );
      expect(success).toEqual(false);
    });

    it("should respect maxRetries and skip already failed strategies", async () => {
      const diagnosis = await Effect.runPromise(
        recoveryManager.diagnose("Element not found: #submit-button", {
          selector: "#submit-button",
        }),
      );

      // First recovery attempt - all fail
      let success = await Effect.runPromise(
        recoveryManager.recover(diagnosis, {
          ...mockExecutors,
          reScan: () => Effect.succeed(false),
          scrollIntoView: () => Effect.succeed(false),
          useVision: () => Effect.succeed(false),
          healSelector: () => Effect.succeed(false),
          waitForLoad: () => Effect.succeed(false),
          retry: () => Effect.succeed(false),
        }),
      );
      expect(success).toEqual(false);

      // History should contain 6 failed attempts (all strategies)
      const history = await Effect.runPromise(recoveryManager.getHistory());
      expect(history).toHaveLength(6);

      // Second attempt - should skip all strategies because they already failed maxRetries
      success = await Effect.runPromise(recoveryManager.recover(diagnosis, { ...mockExecutors }));
      expect(success).toEqual(false);

      // History should not grow because no new attempts were made
      const finalHistory = await Effect.runPromise(recoveryManager.getHistory());
      expect(finalHistory).toHaveLength(6);
    });

    it("should record each recovery attempt in history", async () => {
      const diagnosis = await Effect.runPromise(
        recoveryManager.diagnose("Element not found: #submit-button", {
          selector: "#submit-button",
        }),
      );

      // First attempt - reScan succeeds
      const success = await Effect.runPromise(
        recoveryManager.recover(diagnosis, {
          ...mockExecutors,
          reScan: () => Effect.succeed(true),
        }),
      );
      expect(success).toEqual(true);

      const history = await Effect.runPromise(recoveryManager.getHistory());
      expect(history).toHaveLength(1);
      expect(history[0].strategy).toEqual("reScan");
      expect(history[0].success).toEqual(true);
    });
  });

  describe("history management", () => {
    it("should get and clear history correctly", async () => {
      const diagnosis = await Effect.runPromise(
        recoveryManager.diagnose("Element not found: #submit-button", {
          selector: "#submit-button",
        }),
      );

      // Add some attempts
      await Effect.runPromise(
        recoveryManager.recover(diagnosis, {
          ...mockExecutors,
          reScan: () => Effect.succeed(true),
        }),
      );

      let history = await Effect.runPromise(recoveryManager.getHistory());
      expect(history).toHaveLength(1);

      recoveryManager.clearHistory();

      history = await Effect.runPromise(recoveryManager.getHistory());
      expect(history).toHaveLength(0);
    });
  });

  describe("strategy execution", () => {
    it("should execute reScan strategy", async () => {
      const result = await Effect.runPromise(
        recoveryManager["executeStrategy"]("reScan", {} as any, {
          reScan: () => Effect.succeed(true),
        }),
      );
      expect(result).toEqual(true);
    });

    it("should execute useVision strategy with selector", async () => {
      const result = await Effect.runPromise(
        recoveryManager["executeStrategy"](
          "useVision",
          { context: { selector: "#email" } } as any,
          { useVision: (selector) => Effect.succeed(selector === "#email") },
        ),
      );
      expect(result).toEqual(true);
    });

    it("should execute healSelector strategy", async () => {
      const result = await Effect.runPromise(
        recoveryManager["executeStrategy"](
          "healSelector",
          { context: { selector: "#old" } } as any,
          { healSelector: (selector) => Effect.succeed(selector === "#old") },
        ),
      );
      expect(result).toEqual(true);
    });

    it("should execute waitForLoad strategy", async () => {
      const result = await Effect.runPromise(
        recoveryManager["executeStrategy"]("waitForLoad", {} as any, {
          waitForLoad: () => Effect.succeed(true),
        }),
      );
      expect(result).toEqual(true);
    });

    it("should execute retry strategy (always succeeds)", async () => {
      const result = await Effect.runPromise(
        recoveryManager["executeStrategy"]("retry", {} as any, {}),
      );
      expect(result).toEqual(true);
    });

    it("should execute switchModel strategy", async () => {
      const result = await Effect.runPromise(
        recoveryManager["executeStrategy"]("switchModel", {} as any, {
          switchModel: () => Effect.succeed(true),
        }),
      );
      expect(result).toEqual(true);
    });

    it("should execute restart strategy", async () => {
      const result = await Effect.runPromise(
        recoveryManager["executeStrategy"]("restart", {} as any, {
          restart: () => Effect.succeed(true),
        }),
      );
      expect(result).toEqual(true);
    });

    it("should execute scrollIntoView strategy with selector", async () => {
      const result = await Effect.runPromise(
        recoveryManager["executeStrategy"](
          "scrollIntoView",
          { context: { selector: "#submit" } } as any,
          { scrollIntoView: (selector) => Effect.succeed(selector === "#submit") },
        ),
      );
      expect(result).toEqual(true);
    });

    it("should execute dismissOverlay strategy", async () => {
      const result = await Effect.runPromise(
        recoveryManager["executeStrategy"]("dismissOverlay", {} as any, {
          dismissOverlay: () => Effect.succeed(true),
        }),
      );
      expect(result).toEqual(true);
    });

    it("should execute refreshPage strategy", async () => {
      const result = await Effect.runPromise(
        recoveryManager["executeStrategy"]("refreshPage", {} as any, {
          refreshPage: () => Effect.succeed(true),
        }),
      );
      expect(result).toEqual(true);
    });

    it("should execute clearState strategy", async () => {
      const result = await Effect.runPromise(
        recoveryManager["executeStrategy"]("clearState", {} as any, {
          clearState: () => Effect.succeed(true),
        }),
      );
      expect(result).toEqual(true);
    });

    it("should execute skip strategy (always fails)", async () => {
      const result = await Effect.runPromise(
        recoveryManager["executeStrategy"]("skip", {} as any, {}),
      );
      expect(result).toEqual(false);
    });

    it("should return false for unknown strategy", async () => {
      const result = await Effect.runPromise(
        recoveryManager["executeStrategy"]("unknown" as any, {} as any, {}),
      );
      expect(result).toEqual(false);
    });
  });

  describe("edge cases", () => {
    it("should handle missing executor functions gracefully", async () => {
      const diagnosis = await Effect.runPromise(
        recoveryManager.diagnose("Element not found: #submit-button", {
          selector: "#submit-button",
        }),
      );
      // Only provide a subset of executors
      const success = await Effect.runPromise(
        recoveryManager.recover(diagnosis, {
          reScan: () => Effect.succeed(true),
          // Missing other executors
        }),
      );
      expect(success).toEqual(true);
    });

    it("should handle executor failures gracefully", async () => {
      const diagnosis = await Effect.runPromise(
        recoveryManager.diagnose("Element not found: #submit-button", {
          selector: "#submit-button",
        }),
      );
      // All executors fail
      const success = await Effect.runPromise(
        recoveryManager.recover(diagnosis, {
          reScan: () => Effect.fail(new Error("Failed")),
          useVision: () => Effect.fail(new Error("Failed")),
          healSelector: () => Effect.fail(new Error("Failed")),
          waitForLoad: () => Effect.fail(new Error("Failed")),
          switchModel: () => Effect.fail(new Error("Failed")),
          restart: () => Effect.fail(new Error("Failed")),
          scrollIntoView: () => Effect.fail(new Error("Failed")),
          dismissOverlay: () => Effect.fail(new Error("Failed")),
          refreshPage: () => Effect.fail(new Error("Failed")),
          clearState: () => Effect.fail(new Error("Failed")),
        }),
      );
      expect(success).toEqual(false);
    });
  });
});
