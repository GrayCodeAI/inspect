import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { FallbackService } from "./fallback-service.js";

describe("FallbackService", () => {
  let fallbackService: FallbackService;

  beforeEach(() => {
    fallbackService = new FallbackService();
  });

  describe("handleFallback", () => {
    it("should execute fallback logic when primary fails", async () => {
      const result = await Effect.runPromise(
        fallbackService.handleFallback(new Error("Primary service failed"), {
          retryCount: 1,
          maxRetries: 3,
        }),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result).toHaveProperty("fallbackExecuted", true);
      expect(result).toHaveProperty("strategy", "retry");
    });

    it("should respect maxRetries and fail after exhaustion", async () => {
      let attempt = 0;
      const result = await Effect.runPromise(
        fallbackService.handleFallback(
          new Error("Persistent failure"),
          {
            retryCount: 3,
            maxRetries: 3,
            delayMs: 0,
          },
          () => Effect.succeed(false), // fallback function that always fails
        ),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.fallbackExecuted).toBe(false);
      expect(result.error).toContain("exhausted");
    });

    it("should support custom fallback strategies", async () => {
      const result = await Effect.runPromise(
        fallbackService.handleFallback(
          new Error("Custom fallback needed"),
          {
            retryCount: 0,
            maxRetries: 1,
            delayMs: 0,
            strategy: "useVision" as const,
          },
          () => Effect.succeed(true), // fallback function
        ),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.fallbackExecuted).toBe(true);
      expect(result.strategy).toEqual("useVision");
    });

    it("should handle multiple fallback attempts", async () => {
      let attempt = 0;
      const result = await Effect.runPromise(
        fallbackService.handleFallback(
          new Error("Transient failure"),
          {
            retryCount: 0,
            maxRetries: 3,
            delayMs: 0,
            strategy: "retry",
          },
          () => {
            attempt++;
            return Effect.succeed(attempt > 1);
          },
        ),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.fallbackExecuted).toBe(true);
      expect(attempt).toEqual(2); // Two attempts before success
    });
  });

  describe("shouldRetry", () => {
    it("should determine if a retry is appropriate based on error type", async () => {
      const recoverable = await Effect.runPromise(
        fallbackService.shouldRetry(new Error("Network timeout"), { retryCount: 0, maxRetries: 3 }),
      );
      expect(recoverable).toBe(true);

      const unrecoverable = await Effect.runPromise(
        fallbackService.shouldRetry(new Error("Invalid credentials"), {
          retryCount: 0,
          maxRetries: 3,
        }),
      );
      expect(unrecoverable).toBe(false);
    });

    it("should respect maxRetries limit", async () => {
      const retry = await Effect.runPromise(
        fallbackService.shouldRetry(new Error("Temporary failure"), {
          retryCount: 3,
          maxRetries: 3,
        }),
      );
      expect(retry).toBe(false);
    });
  });

  describe("calculateDelay", () => {
    it("should calculate exponential backoff delay", async () => {
      const delay1 = await Effect.runPromise(
        fallbackService.calculateDelay(0, { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 10000 }),
      );
      expect(delay1).toBe(100); // 100 * 2^0

      const delay2 = await Effect.runPromise(
        fallbackService.calculateDelay(1, { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 10000 }),
      );
      expect(delay2).toBe(200); // 100 * 2^1

      const delay3 = await Effect.runPromise(
        fallbackService.calculateDelay(2, { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 10000 }),
      );
      expect(delay3).toBe(400); // 100 * 2^2 (capped before maxDelayMs)
    });

    it("should cap delay at maxDelayMs", async () => {
      const delay = await Effect.runPromise(
        fallbackService.calculateDelay(5, { maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 2000 }),
      );
      expect(delay).toBeLessThanOrEqual(2000);
    });
  });
});
