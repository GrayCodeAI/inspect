import { describe, it, expect } from "vitest";
import { RetryExecutor, RETRY_PRESETS } from "./retry.js";

describe("RetryExecutor", () => {
  it("succeeds on first attempt", async () => {
    const executor = new RetryExecutor({ maxRetries: 3 });
    const result = await executor.execute(async () => "ok");

    expect(result.success).toBe(true);
    expect(result.result).toBe("ok");
    expect(result.totalAttempts).toBe(1);
    expect(result.attempts).toHaveLength(0);
  });

  it("retries and succeeds on second attempt", async () => {
    let callCount = 0;
    const executor = new RetryExecutor({ maxRetries: 3, strategy: "immediate" });
    const result = await executor.execute(async () => {
      callCount++;
      if (callCount < 2) throw new Error("Flaky");
      return "recovered";
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe("recovered");
    expect(result.totalAttempts).toBe(2);
    expect(result.attempts).toHaveLength(1);
  });

  it("fails after exhausting retries", async () => {
    const executor = new RetryExecutor({ maxRetries: 2, strategy: "immediate" });
    const result = await executor.execute(async () => {
      throw new Error("Always fails");
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Always fails");
    expect(result.totalAttempts).toBe(3); // 1 initial + 2 retries
  });

  it("respects maxRetries: 0", async () => {
    const executor = new RetryExecutor({ maxRetries: 0 });
    const result = await executor.execute(async () => {
      throw new Error("No retry");
    });

    expect(result.success).toBe(false);
    expect(result.totalAttempts).toBe(1);
  });

  it("calculates fixed delay", () => {
    const executor = new RetryExecutor({ strategy: "fixed", baseDelayMs: 1000, jitter: 0 });
    expect(executor.calculateDelay(0)).toBe(1000);
    expect(executor.calculateDelay(1)).toBe(1000);
    expect(executor.calculateDelay(5)).toBe(1000);
  });

  it("calculates linear delay", () => {
    const executor = new RetryExecutor({ strategy: "linear", baseDelayMs: 1000, jitter: 0 });
    expect(executor.calculateDelay(0)).toBe(1000);
    expect(executor.calculateDelay(1)).toBe(2000);
    expect(executor.calculateDelay(2)).toBe(3000);
  });

  it("calculates exponential delay", () => {
    const executor = new RetryExecutor({
      strategy: "exponential",
      baseDelayMs: 1000,
      multiplier: 2,
      jitter: 0,
    });
    expect(executor.calculateDelay(0)).toBe(1000);
    expect(executor.calculateDelay(1)).toBe(2000);
    expect(executor.calculateDelay(2)).toBe(4000);
  });

  it("caps delay at maxDelayMs", () => {
    const executor = new RetryExecutor({
      strategy: "exponential",
      baseDelayMs: 10000,
      multiplier: 10,
      maxDelayMs: 30000,
      jitter: 0,
    });
    expect(executor.calculateDelay(5)).toBe(30000);
  });

  it("immediate strategy has zero delay", () => {
    const executor = new RetryExecutor({ strategy: "immediate", jitter: 0 });
    expect(executor.calculateDelay(0)).toBe(0);
    expect(executor.calculateDelay(10)).toBe(0);
  });

  it("respects retryOn filter", async () => {
    const executor = new RetryExecutor({
      maxRetries: 3,
      strategy: "immediate",
      retryOn: ["timeout"],
    });

    expect(executor.shouldRetry("Connection timeout")).toBe(true);
    expect(executor.shouldRetry("Element not found")).toBe(false);
  });

  it("respects noRetryOn filter", async () => {
    const executor = new RetryExecutor({
      maxRetries: 3,
      strategy: "immediate",
      noRetryOn: ["auth"],
    });

    expect(executor.shouldRetry("auth required")).toBe(false);
    expect(executor.shouldRetry("timeout")).toBe(true);
  });

  it("noRetryOn takes precedence over retryOn", () => {
    const executor = new RetryExecutor({ retryOn: ["error"], noRetryOn: ["fatal error"] });

    expect(executor.shouldRetry("some error")).toBe(true);
    expect(executor.shouldRetry("fatal error occurred")).toBe(false);
  });

  it("tracks total delay", async () => {
    let callCount = 0;
    const executor = new RetryExecutor({ maxRetries: 2, strategy: "immediate" });
    const result = await executor.execute(async () => {
      callCount++;
      if (callCount < 3) throw new Error("fail");
      return "ok";
    });

    expect(result.success).toBe(true);
    expect(result.totalDelayMs).toBe(0); // immediate strategy
  });

  it("RETRY_PRESETS are defined", () => {
    expect(RETRY_PRESETS.none.maxRetries).toBe(0);
    expect(RETRY_PRESETS.quick.maxRetries).toBe(1);
    expect(RETRY_PRESETS.standard.maxRetries).toBe(2);
    expect(RETRY_PRESETS.aggressive.maxRetries).toBe(3);
    expect(RETRY_PRESETS.patient.maxRetries).toBe(5);
    expect(RETRY_PRESETS.ci.jitter).toBe(0);
  });
});
