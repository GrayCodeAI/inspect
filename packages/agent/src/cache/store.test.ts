import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ActionCache } from "./action-cache.js";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDir = join(tmpdir(), `inspect-cache-store-test-${Date.now()}`);

describe("ActionCache (store - canonical)", () => {
  let cache: ActionCache;

  beforeEach(async () => {
    cache = new ActionCache({ cacheDir: testDir, ttlMs: 60_000 });
    await cache.ready;
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* cleanup */
    }
  });

  describe("getKey", () => {
    it("produces a 16-character hex string", () => {
      const key = ActionCache.key("click button", "https://example.com");
      expect(key).toMatch(/^[0-9a-f]{16}$/);
    });

    it("produces consistent keys for the same input", () => {
      const key1 = ActionCache.key("click button", "https://example.com");
      const key2 = ActionCache.key("click button", "https://example.com");
      expect(key1).toBe(key2);
    });

    it("produces consistent keys regardless of instruction casing", () => {
      const key1 = ActionCache.key("Click Button", "https://example.com");
      const key2 = ActionCache.key("click button", "https://example.com");
      expect(key1).toBe(key2);
    });

    it("produces different keys for different instructions", () => {
      const key1 = ActionCache.key("click button", "https://example.com");
      const key2 = ActionCache.key("type text", "https://example.com");
      expect(key1).not.toBe(key2);
    });

    it("produces different keys for different URLs", () => {
      const key1 = ActionCache.key("click button", "https://example.com/page1");
      const key2 = ActionCache.key("click button", "https://example.com/page2");
      expect(key1).not.toBe(key2);
    });
  });

  describe("set and get", () => {
    it("roundtrips a cached action", async () => {
      await cache.set("click submit", "https://example.com", { type: "click", target: "Login" });
      const result = await cache.get("click submit", "https://example.com");
      expect(result).not.toBeNull();
      expect(result!.action.type).toBe("click");
      expect(result!.action.target).toBe("Login");
      expect(result!.instruction).toBe("click submit");
    });

    it("returns null for missing keys", async () => {
      expect(await cache.get("nonexistent", "https://example.com")).toBeNull();
    });

    it("increments hitCount on subsequent gets", async () => {
      await cache.set("click", "https://example.com", { type: "click" });
      await cache.get("click", "https://example.com");
      await cache.get("click", "https://example.com");
      const result = await cache.get("click", "https://example.com");
      expect(result!.hitCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe("heal", () => {
    it("updates selector on an existing cache entry", async () => {
      await cache.set("click submit", "https://example.com", {
        type: "click",
        ref: "e5",
        selector: "#old-btn",
      });
      const key = ActionCache.key("click submit", "https://example.com");
      const healed = await cache.heal(key, "#new-btn", "e10");
      expect(healed).toBe(true);

      const result = await cache.get("click submit", "https://example.com");
      expect(result!.action.selector).toBe("#new-btn");
      expect(result!.action.ref).toBe("e10");
      expect(result!.healCount).toBeGreaterThanOrEqual(1);
    });

    it("returns false for non-existent key", async () => {
      expect(await cache.heal("nonexistent_key_abc123ab", "#new")).toBe(false);
    });
  });

  describe("enabled flag", () => {
    it("returns null for get when disabled", async () => {
      const disabled = new ActionCache({ enabled: false });
      await disabled.set("test", "https://example.com", { type: "click" });
      expect(await disabled.get("test", "https://example.com")).toBeNull();
    });
  });

  describe("stats", () => {
    it("reports correct cache size", async () => {
      await cache.set("action1", "https://a.com/x", { type: "click" });
      await cache.set("action2", "https://b.com/x", { type: "type" });
      const stats = cache.getStats();
      expect(stats.size).toBe(2);
    });
  });

  describe("clear", () => {
    it("removes all entries from memory", async () => {
      await cache.set("action1", "https://a.com/x", { type: "click" });
      await cache.clear();
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
    });
  });
});
