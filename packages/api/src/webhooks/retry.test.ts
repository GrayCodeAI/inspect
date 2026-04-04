import { describe, it, expect, beforeEach } from "vitest";
import { RetryPolicy } from "./retry.js";
import type { DeadLetterEntry } from "./retry.js";

describe("RetryPolicy", () => {
  let policy: RetryPolicy;

  beforeEach(() => {
    policy = new RetryPolicy({
      maxRetries: 3,
      backoffType: "exponential",
      initialDelayMs: 10, // Short delays for fast tests
      maxDelayMs: 200,
      jitter: 0, // Disable jitter for deterministic tests
    });
  });

  describe("calculateDelay", () => {
    it("calculates exponential backoff delays", () => {
      const delay0 = policy.calculateDelay(0); // 10 * 2^0 = 10
      const delay1 = policy.calculateDelay(1); // 10 * 2^1 = 20
      const delay2 = policy.calculateDelay(2); // 10 * 2^2 = 40
      const delay3 = policy.calculateDelay(3); // 10 * 2^3 = 80

      expect(delay0).toBe(10);
      expect(delay1).toBe(20);
      expect(delay2).toBe(40);
      expect(delay3).toBe(80);
    });

    it("calculates linear backoff delays", () => {
      const linearPolicy = new RetryPolicy({
        backoffType: "linear",
        initialDelayMs: 100,
        maxDelayMs: 5000,
        maxRetries: 3,
        jitter: 0,
      });

      expect(linearPolicy.calculateDelay(0)).toBe(100); // 100 * 1
      expect(linearPolicy.calculateDelay(1)).toBe(200); // 100 * 2
      expect(linearPolicy.calculateDelay(2)).toBe(300); // 100 * 3
    });

    it("caps delay at maxDelayMs", () => {
      const delay = policy.calculateDelay(100); // Would be huge without cap
      expect(delay).toBeLessThanOrEqual(200);
    });

    it("applies jitter when configured", () => {
      const jitterPolicy = new RetryPolicy({
        maxRetries: 3,
        backoffType: "exponential",
        initialDelayMs: 1000,
        maxDelayMs: 60_000,
        jitter: 0.5,
      });

      // Run many times and check that jitter produces variation
      const delays = new Set<number>();
      for (let i = 0; i < 20; i++) {
        delays.add(jitterPolicy.calculateDelay(0));
      }
      // With 50% jitter, we should see multiple different values
      expect(delays.size).toBeGreaterThan(1);
    });
  });

  describe("execute", () => {
    it("succeeds on first attempt", async () => {
      const result = await policy.execute(async () => ({
        statusCode: 200,
        response: "OK",
      }));

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.statusCode).toBe(200);
      expect(result.response).toBe("OK");
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it("retries and eventually succeeds", async () => {
      let attempt = 0;
      const result = await policy.execute(async () => {
        attempt++;
        if (attempt < 3) {
          throw new Error("Server error");
        }
        return { statusCode: 200, response: "OK" };
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it("fails after exhausting all retries", async () => {
      const result = await policy.execute(async () => {
        throw new Error("Persistent failure");
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(4); // 1 initial + 3 retries
      expect(result.error).toBe("Persistent failure");
    });

    it("does not retry on 4xx client errors (except 429)", async () => {
      let callCount = 0;
      const result = await policy.execute(async () => {
        callCount++;
        throw new Error("Server responded with 400 Bad Request");
      });

      expect(result.success).toBe(false);
      expect(callCount).toBe(1); // No retries
      expect(result.statusCode).toBe(400);
    });

    it("retries on 429 rate limit errors", async () => {
      let callCount = 0;
      const result = await policy.execute(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Server responded with 429 Too Many Requests");
        }
        return { statusCode: 200, response: "OK" };
      });

      expect(result.success).toBe(true);
      expect(callCount).toBe(3);
    });

    it("respects maxRetries override", async () => {
      const result = await policy.execute(
        async () => {
          throw new Error("fail");
        },
        1, // Override: only 1 retry
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2); // 1 initial + 1 retry
    });

    it("truncates long error messages", async () => {
      const longMessage = "x".repeat(300);
      const result = await policy.execute(async () => {
        throw new Error(longMessage);
      });

      expect(result.success).toBe(false);
      expect(result.error!.length).toBeLessThanOrEqual(203); // 200 + "..."
      expect(result.error!.endsWith("...")).toBe(true);
    });
  });

  describe("dead letter queue", () => {
    it("adds entries to the dead letter queue", () => {
      const entry: DeadLetterEntry = {
        deliveryId: "del-1",
        webhookId: "wh-1",
        event: "user.created",
        data: { userId: 123 },
        error: "Connection refused",
        attempts: 3,
        timestamp: Date.now(),
      };

      policy.addToDeadLetterQueue(entry);
      expect(policy.getDeadLetterQueueSize()).toBe(1);

      const queue = policy.getDeadLetterQueue();
      expect(queue[0].deliveryId).toBe("del-1");
      expect(queue[0].event).toBe("user.created");
    });

    it("returns a copy of the queue (not a reference)", () => {
      policy.addToDeadLetterQueue({
        deliveryId: "del-1",
        webhookId: "wh-1",
        event: "test",
        data: {},
        error: "err",
        attempts: 1,
        timestamp: Date.now(),
      });

      const queue = policy.getDeadLetterQueue();
      queue.pop(); // Mutate the returned copy
      expect(policy.getDeadLetterQueueSize()).toBe(1); // Original unchanged
    });

    it("trims the queue when it exceeds max size", () => {
      const smallPolicy = new RetryPolicy(undefined, 3);

      for (let i = 0; i < 5; i++) {
        smallPolicy.addToDeadLetterQueue({
          deliveryId: `del-${i}`,
          webhookId: "wh-1",
          event: "test",
          data: {},
          error: "err",
          attempts: 1,
          timestamp: i,
        });
      }

      expect(smallPolicy.getDeadLetterQueueSize()).toBe(3);
      // Should keep the most recent entries
      const queue = smallPolicy.getDeadLetterQueue();
      expect(queue[0].deliveryId).toBe("del-2");
      expect(queue[2].deliveryId).toBe("del-4");
    });

    it("clears the dead letter queue", () => {
      policy.addToDeadLetterQueue({
        deliveryId: "del-1",
        webhookId: "wh-1",
        event: "test",
        data: {},
        error: "err",
        attempts: 1,
        timestamp: Date.now(),
      });

      policy.clearDeadLetterQueue();
      expect(policy.getDeadLetterQueueSize()).toBe(0);
    });

    it("replays a dead letter entry successfully", async () => {
      policy.addToDeadLetterQueue({
        deliveryId: "del-1",
        webhookId: "wh-1",
        event: "test",
        data: {},
        error: "err",
        attempts: 1,
        timestamp: Date.now(),
      });

      const result = await policy.replayDeadLetter(0, async () => ({
        statusCode: 200,
        response: "OK",
      }));

      expect(result.success).toBe(true);
      expect(policy.getDeadLetterQueueSize()).toBe(0); // Removed on success
    });

    it("keeps entry in queue when replay fails", async () => {
      policy.addToDeadLetterQueue({
        deliveryId: "del-1",
        webhookId: "wh-1",
        event: "test",
        data: {},
        error: "err",
        attempts: 1,
        timestamp: Date.now(),
      });

      const result = await policy.replayDeadLetter(0, async () => {
        throw new Error("still broken");
      });

      expect(result.success).toBe(false);
      expect(policy.getDeadLetterQueueSize()).toBe(1); // Still in queue
    });

    it("returns error for invalid dead letter index", async () => {
      const result = await policy.replayDeadLetter(99, async () => ({
        statusCode: 200,
        response: "OK",
      }));

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(0);
      expect(result.error).toContain("Invalid");
    });
  });

  describe("getConfig", () => {
    it("returns a copy of the configuration", () => {
      const config = policy.getConfig();
      expect(config.maxRetries).toBe(3);
      expect(config.backoffType).toBe("exponential");
      expect(config.initialDelayMs).toBe(10);
      expect(config.maxDelayMs).toBe(200);
      expect(config.jitter).toBe(0);
    });

    it("uses sensible defaults when no config is provided", () => {
      const defaultPolicy = new RetryPolicy();
      const config = defaultPolicy.getConfig();
      expect(config.maxRetries).toBe(3);
      expect(config.backoffType).toBe("exponential");
      expect(config.initialDelayMs).toBe(1000);
      expect(config.maxDelayMs).toBe(60000);
      expect(config.jitter).toBe(0.1);
    });
  });
});
