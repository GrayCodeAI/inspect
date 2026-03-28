import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ActionCache } from "./action-cache.js";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), `inspect-cache-test-${Date.now()}`);

describe("ActionCache", () => {
  let cache: ActionCache;

  beforeEach(() => {
    cache = new ActionCache({ cacheDir: testDir, ttlMs: 60_000 });
  });

  afterEach(() => {
    try { if (existsSync(testDir)) rmSync(testDir, { recursive: true }); } catch {}
  });

  it("generates consistent cache keys", () => {
    const key1 = ActionCache.key("Click login", "https://example.com/login");
    const key2 = ActionCache.key("Click login", "https://example.com/login");
    expect(key1).toBe(key2);
    expect(key1.length).toBe(16);
  });

  it("generates different keys for different instructions", () => {
    const key1 = ActionCache.key("Click login", "https://example.com");
    const key2 = ActionCache.key("Click signup", "https://example.com");
    expect(key1).not.toBe(key2);
  });

  it("normalizes URL to pathname for key", () => {
    const key1 = ActionCache.key("Click login", "https://example.com/login?foo=bar");
    const key2 = ActionCache.key("Click login", "https://example.com/login?baz=qux");
    expect(key1).toBe(key2);
  });

  it("stores and retrieves cached actions", () => {
    cache.set("Click login", "https://example.com/login", { type: "click", target: "Login" });
    const result = cache.get("Click login", "https://example.com/login");
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("click");
    expect(result!.action.target).toBe("Login");
  });

  it("returns null for cache miss", () => {
    const result = cache.get("Click something", "https://example.com");
    expect(result).toBeNull();
  });

  it("returns null for expired entries", () => {
    const shortCache = new ActionCache({ cacheDir: testDir, ttlMs: 1 });
    shortCache.set("Click login", "https://example.com/login", { type: "click" });

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) {} // busy wait 5ms

    const result = shortCache.get("Click login", "https://example.com/login");
    expect(result).toBeNull();
  });

  it("records replay count", () => {
    cache.set("Click login", "https://example.com/login", { type: "click" });
    const key = ActionCache.key("Click login", "https://example.com/login");

    cache.recordReplay(key);
    cache.recordReplay(key);

    const result = cache.get("Click login", "https://example.com/login");
    expect(result!.replayCount).toBe(2);
    expect(result!.lastReplayedAt).toBeDefined();
  });

  it("invalidates specific entry", () => {
    cache.set("Click login", "https://example.com/login", { type: "click" });
    cache.invalidate("Click login", "https://example.com/login");
    expect(cache.get("Click login", "https://example.com/login")).toBeNull();
  });

  it("invalidates all entries for a URL", () => {
    cache.set("Click login", "https://example.com/login", { type: "click" });
    cache.set("Fill email", "https://example.com/login", { type: "type", value: "test" });
    cache.set("Click home", "https://example.com/home", { type: "click" });

    cache.invalidateUrl("https://example.com/login");

    expect(cache.get("Click login", "https://example.com/login")).toBeNull();
    expect(cache.get("Fill email", "https://example.com/login")).toBeNull();
    expect(cache.get("Click home", "https://example.com/home")).not.toBeNull();
  });

  it("clears entire cache", () => {
    cache.set("A", "https://a.com/x", { type: "click" });
    cache.set("B", "https://b.com/x", { type: "click" });
    cache.clear();
    expect(cache.getStats().size).toBe(0);
  });

  it("persists to disk and reloads", () => {
    cache.set("Click login", "https://example.com/login", { type: "click", target: "btn" });

    // Create new cache instance from same dir
    const cache2 = new ActionCache({ cacheDir: testDir, ttlMs: 60_000 });
    const result = cache2.get("Click login", "https://example.com/login");
    expect(result).not.toBeNull();
    expect(result!.action.target).toBe("btn");
  });

  it("reports stats", () => {
    cache.set("A", "https://a.com/x", { type: "click" });
    cache.set("B", "https://b.com/x", { type: "click" });
    const key = ActionCache.key("A", "https://a.com/x");
    cache.recordReplay(key);

    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.totalReplays).toBe(1);
  });

  it("disabled cache returns null", () => {
    const disabled = new ActionCache({ enabled: false });
    disabled.set("A", "https://a.com/x", { type: "click" });
    expect(disabled.get("A", "https://a.com/x")).toBeNull();
  });

  it("evicts oldest when max entries reached", () => {
    const smallCache = new ActionCache({ cacheDir: testDir, maxEntries: 2, ttlMs: 60_000 });
    smallCache.set("A", "https://a.com/x", { type: "click" });
    smallCache.set("B", "https://b.com/x", { type: "click" });
    smallCache.set("C", "https://c.com/x", { type: "click" }); // should evict A

    expect(smallCache.getStats().size).toBeLessThanOrEqual(2);
  });

  it("stores snapshot fingerprint", () => {
    cache.set("Click login", "https://example.com/login", { type: "click" }, "fp-abc123");
    const result = cache.get("Click login", "https://example.com/login");
    expect(result!.snapshotFingerprint).toBe("fp-abc123");
  });
});
