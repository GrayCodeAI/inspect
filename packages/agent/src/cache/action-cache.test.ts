import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ActionCache } from "./action-cache.js";
import { existsSync, rmSync} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), `inspect-cache-test-${Date.now()}`);

describe("ActionCache", () => {
  let cache: ActionCache;

  beforeEach(async () => {
    cache = new ActionCache({ cacheDir: testDir, ttlMs: 60_000 });
    await cache.ready;
  });

  afterEach(() => {
    try {
      if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    } catch {
      /* cleanup */
    }
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

  it("stores and retrieves cached actions", async () => {
    await cache.set("Click login", "https://example.com/login", { type: "click", target: "Login" });
    const result = await cache.get("Click login", "https://example.com/login");
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("click");
    expect(result!.action.target).toBe("Login");
  });

  it("returns null for cache miss", async () => {
    const result = await cache.get("Click something", "https://example.com");
    expect(result).toBeNull();
  });

  it("returns null for expired entries", async () => {
    const shortCache = new ActionCache({ cacheDir: testDir, ttlMs: 1 });
    await shortCache.ready;
    await shortCache.set("Click login", "https://example.com/login", { type: "click" });

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* busy wait */
    } // busy wait 5ms

    const result = await shortCache.get("Click login", "https://example.com/login");
    expect(result).toBeNull();
  });

  it("records replay count", async () => {
    await cache.set("Click login", "https://example.com/login", { type: "click" });
    const key = ActionCache.key("Click login", "https://example.com/login");

    await cache.recordReplay(key);
    await cache.recordReplay(key);

    const result = await cache.get("Click login", "https://example.com/login");
    expect(result!.replayCount).toBe(2);
    expect(result!.lastReplayedAt).toBeDefined();
  });

  it("invalidates specific entry", async () => {
    await cache.set("Click login", "https://example.com/login", { type: "click" });
    await cache.invalidate("Click login", "https://example.com/login");
    expect(await cache.get("Click login", "https://example.com/login")).toBeNull();
  });

  it("invalidates all entries for a URL", async () => {
    await cache.set("Click login", "https://example.com/login", { type: "click" });
    await cache.set("Fill email", "https://example.com/login", { type: "type", value: "test" });
    await cache.set("Click home", "https://example.com/home", { type: "click" });

    await cache.invalidateUrl("https://example.com/login");

    expect(await cache.get("Click login", "https://example.com/login")).toBeNull();
    expect(await cache.get("Fill email", "https://example.com/login")).toBeNull();
    expect(await cache.get("Click home", "https://example.com/home")).not.toBeNull();
  });

  it("clears entire cache", async () => {
    await cache.set("A", "https://a.com/x", { type: "click" });
    await cache.set("B", "https://b.com/x", { type: "click" });
    await cache.clear();
    expect(cache.getStats().size).toBe(0);
  });

  it("persists to disk and reloads", async () => {
    await cache.set("Click login", "https://example.com/login", { type: "click", target: "btn" });

    // Create new cache instance from same dir
    const cache2 = new ActionCache({ cacheDir: testDir, ttlMs: 60_000 });
    await cache2.ready;
    const result = await cache2.get("Click login", "https://example.com/login");
    expect(result).not.toBeNull();
    expect(result!.action.target).toBe("btn");
  });

  it("reports stats", async () => {
    await cache.set("A", "https://a.com/x", { type: "click" });
    await cache.set("B", "https://b.com/x", { type: "click" });
    const key = ActionCache.key("A", "https://a.com/x");
    await cache.recordReplay(key);

    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.totalReplays).toBe(1);
  });

  it("disabled cache returns null", async () => {
    const disabled = new ActionCache({ enabled: false });
    await disabled.set("A", "https://a.com/x", { type: "click" });
    expect(await disabled.get("A", "https://a.com/x")).toBeNull();
  });

  it("evicts oldest when max entries reached", async () => {
    const smallCache = new ActionCache({ cacheDir: testDir, maxEntries: 2, ttlMs: 60_000 });
    await smallCache.ready;
    await smallCache.set("A", "https://a.com/x", { type: "click" });
    await smallCache.set("B", "https://b.com/x", { type: "click" });
    await smallCache.set("C", "https://c.com/x", { type: "click" }); // should evict A

    expect(smallCache.getStats().size).toBeLessThanOrEqual(2);
  });

  it("stores snapshot fingerprint", async () => {
    await cache.set("Click login", "https://example.com/login", { type: "click" }, "fp-abc123");
    const result = await cache.get("Click login", "https://example.com/login");
    expect(result!.snapshotFingerprint).toBe("fp-abc123");
  });
});
