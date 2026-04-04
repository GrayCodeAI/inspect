import { describe, it, expect, vi } from "vitest";
import { FallbackManager } from "./fallback.js";

describe("FallbackManager", () => {
  it("uses primary on success", async () => {
    const primary = vi.fn().mockResolvedValue("primary response");
    const fallback = vi.fn().mockResolvedValue("fallback response");
    const mgr = new FallbackManager(primary, fallback);

    const result = await mgr.call([{ role: "user", content: "hi" }]);
    expect(result).toBe("primary response");
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("switches to fallback on retryable error", async () => {
    const primary = vi.fn().mockRejectedValue(new Error("429 rate limit"));
    const fallback = vi.fn().mockResolvedValue("fallback response");
    const mgr = new FallbackManager(primary, fallback);

    const result = await mgr.call([{ role: "user", content: "hi" }]);
    expect(result).toBe("fallback response");
    expect(mgr.getStatus().usingFallback).toBe(true);
  });

  it("does not switch on non-retryable error", async () => {
    const primary = vi.fn().mockRejectedValue(new Error("Invalid API key"));
    const fallback = vi.fn().mockResolvedValue("fallback");
    const mgr = new FallbackManager(primary, fallback);

    await expect(mgr.call([{ role: "user", content: "hi" }])).rejects.toThrow("Invalid API key");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("stays on fallback for subsequent calls", async () => {
    const primary = vi.fn().mockRejectedValue(new Error("timeout"));
    const fallback = vi.fn().mockResolvedValue("fallback");
    const mgr = new FallbackManager(primary, fallback, { cooldownMs: 999999 });

    await mgr.call([{ role: "user", content: "1" }]);
    await mgr.call([{ role: "user", content: "2" }]);

    expect(primary).toHaveBeenCalledTimes(1); // only first call
    expect(fallback).toHaveBeenCalledTimes(2); // both calls
  });

  it("tries primary again after cooldown", async () => {
    let callCount = 0;
    const primary = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("429");
      return "primary recovered";
    });
    const fallback = vi.fn().mockResolvedValue("fallback");
    const mgr = new FallbackManager(primary, fallback, { cooldownMs: 0 }); // instant cooldown

    await mgr.call([{ role: "user", content: "1" }]); // fails → fallback
    const result = await mgr.call([{ role: "user", content: "2" }]); // cooldown expired → try primary

    expect(result).toBe("primary recovered");
  });

  it("rethrows when no fallback configured", async () => {
    const primary = vi.fn().mockRejectedValue(new Error("429"));
    const mgr = new FallbackManager(primary);

    await expect(mgr.call([{ role: "user", content: "hi" }])).rejects.toThrow("429");
  });

  it("reports status correctly", () => {
    const primary = vi.fn();
    const fallback = vi.fn();
    const mgr = new FallbackManager(primary, fallback);

    expect(mgr.getStatus().usingFallback).toBe(false);
    expect(mgr.getStatus().hasFallback).toBe(true);

    mgr.switchToFallback();
    expect(mgr.getStatus().usingFallback).toBe(true);

    mgr.switchToPrimary();
    expect(mgr.getStatus().usingFallback).toBe(false);
  });

  it("detects various retryable errors", async () => {
    const fallback = vi.fn().mockResolvedValue("ok");
    const errors = [
      "429 Too Many Requests",
      "Request timed out",
      "500 Internal Server Error",
      "ECONNREFUSED",
      "fetch failed",
    ];

    for (const err of errors) {
      const primary = vi.fn().mockRejectedValue(new Error(err));
      const mgr = new FallbackManager(primary, fallback);
      const result = await mgr.call([{ role: "user", content: "test" }]);
      expect(result).toBe("ok");
    }
  });
});
