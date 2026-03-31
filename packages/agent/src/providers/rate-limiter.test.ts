import { describe, it, expect, vi, afterEach } from "vitest";
import { RateLimiter, RATE_LIMIT_PRESETS } from "./rate-limiter.js";

describe("RateLimiter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows requests within limits", async () => {
    const limiter = new RateLimiter({ requestsPerMinute: 10, maxConcurrent: 5 });

    await limiter.acquire();
    limiter.release();

    const status = limiter.getStatus();
    expect(status.activeRequests).toBe(0);
    expect(status.requestsInWindow).toBe(1);
    limiter.destroy();
  });

  it("tracks active concurrent requests", async () => {
    const limiter = new RateLimiter({ maxConcurrent: 3 });

    await limiter.acquire();
    await limiter.acquire();

    expect(limiter.getStatus().activeRequests).toBe(2);

    limiter.release();
    expect(limiter.getStatus().activeRequests).toBe(1);

    limiter.release();
    expect(limiter.getStatus().activeRequests).toBe(0);
    limiter.destroy();
  });

  it("records token usage", async () => {
    const limiter = new RateLimiter();

    await limiter.acquire();
    limiter.recordTokens(500);
    limiter.release();

    expect(limiter.getStatus().tokensInWindow).toBe(500);
    limiter.destroy();
  });

  it("queues requests when concurrency limit reached", async () => {
    const limiter = new RateLimiter({ maxConcurrent: 1, queueTimeoutMs: 5000 });

    // Take the only slot
    await limiter.acquire();
    expect(limiter.getStatus().activeRequests).toBe(1);

    // Second acquire should queue
    let resolved = false;
    const _p = limiter.acquire().then(() => { resolved = true; });

    // Not resolved yet
    await new Promise((r) => setTimeout(r, 100));
    expect(resolved).toBe(false);
    expect(limiter.getStatus().queueLength).toBe(1);

    // Release first slot — should drain queue
    limiter.release();
    await new Promise((r) => setTimeout(r, 600));
    expect(resolved).toBe(true);

    limiter.release();
    limiter.destroy();
  });

  it("reports availability correctly", async () => {
    const limiter = new RateLimiter({ requestsPerMinute: 2, maxConcurrent: 5 });

    expect(limiter.getStatus().available).toBe(true);

    await limiter.acquire();
    limiter.release();
    await limiter.acquire();
    limiter.release();

    // 2 requests used, at limit
    expect(limiter.getStatus().available).toBe(false);
    limiter.destroy();
  });

  it("destroy rejects queued requests", async () => {
    const limiter = new RateLimiter({ maxConcurrent: 1 });

    await limiter.acquire();

    const p = limiter.acquire().catch((err: Error) => err.message);
    await new Promise((r) => setTimeout(r, 50));

    limiter.destroy();
    const errorMsg = await p;
    expect(errorMsg).toContain("destroyed");
  });

  it("has presets for known providers", () => {
    expect(RATE_LIMIT_PRESETS.anthropic).toBeDefined();
    expect(RATE_LIMIT_PRESETS.openai).toBeDefined();
    expect(RATE_LIMIT_PRESETS.gemini).toBeDefined();
    expect(RATE_LIMIT_PRESETS.deepseek).toBeDefined();
    expect(RATE_LIMIT_PRESETS.ollama).toBeDefined();

    expect(RATE_LIMIT_PRESETS.anthropic.requestsPerMinute).toBe(50);
    expect(RATE_LIMIT_PRESETS.ollama.requestsPerMinute).toBe(Infinity);
  });

  it("release does not go below zero", () => {
    const limiter = new RateLimiter();
    limiter.release();
    limiter.release();
    expect(limiter.getStatus().activeRequests).toBe(0);
    limiter.destroy();
  });
});
