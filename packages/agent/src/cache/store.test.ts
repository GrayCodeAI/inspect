import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ActionCache } from "./store.js";
import { rmSync } from "node:fs";

describe("ActionCache", () => {
  let cache: ActionCache;
  const projectRoot = "/tmp/inspect-test-cache-" + Date.now();

  beforeEach(async () => {
    cache = new ActionCache({ projectRoot, ttl: 60_000 });
    await cache.init();
  });

  afterEach(() => {
    try {
      rmSync(projectRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("getKey", () => {
    it("produces a 24-character hex string", () => {
      const key = cache.getKey("click button", "https://example.com");
      expect(key).toMatch(/^[0-9a-f]{24}$/);
    });

    it("produces consistent keys for the same input", () => {
      const key1 = cache.getKey("click button", "https://example.com");
      const key2 = cache.getKey("click button", "https://example.com");
      expect(key1).toBe(key2);
    });

    it("produces consistent keys regardless of instruction casing", () => {
      const key1 = cache.getKey("Click Button", "https://example.com");
      const key2 = cache.getKey("click button", "https://example.com");
      expect(key1).toBe(key2);
    });

    it("produces different keys for different instructions", () => {
      const key1 = cache.getKey("click button", "https://example.com");
      const key2 = cache.getKey("type text", "https://example.com");
      expect(key1).not.toBe(key2);
    });

    it("produces different keys for different URLs", () => {
      const key1 = cache.getKey("click button", "https://example.com/page1");
      const key2 = cache.getKey("click button", "https://example.com/page2");
      expect(key1).not.toBe(key2);
    });

    it("produces consistent keys with variables in sorted order", () => {
      const key1 = cache.getKey("click", "https://example.com", { a: "1", b: "2" });
      const key2 = cache.getKey("click", "https://example.com", { b: "2", a: "1" });
      expect(key1).toBe(key2);
    });
  });

  describe("set and get", () => {
    it("roundtrips a cached action", async () => {
      const key = cache.getKey("click submit", "https://example.com");
      await cache.set(key, { type: "click", ref: "e5" }, {
        instruction: "click submit",
        url: "https://example.com",
        selector: "#submit-btn",
        success: true,
      });

      const result = await cache.get(key);
      expect(result).not.toBeNull();
      expect(result!.action.type).toBe("click");
      expect(result!.action.ref).toBe("e5");
      expect(result!.action.selector).toBe("#submit-btn");
      expect(result!.instruction).toBe("click submit");
      expect(result!.success).toBe(true);
    });

    it("returns null for missing keys", async () => {
      expect(await cache.get("nonexistent_key_abc123ab")).toBeNull();
    });

    it("increments hitCount on subsequent gets", async () => {
      const key = cache.getKey("click", "https://example.com");
      await cache.set(key, { type: "click" }, {
        instruction: "click",
        url: "https://example.com",
      });

      await cache.get(key);
      await cache.get(key);
      const result = await cache.get(key);
      expect(result!.hitCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe("heal", () => {
    it("updates selector on an existing cache entry", async () => {
      const key = cache.getKey("click submit", "https://example.com");
      await cache.set(key, { type: "click", ref: "e5", selector: "#old-btn" }, {
        instruction: "click submit",
        url: "https://example.com",
      });

      const healed = await cache.heal(key, "#new-btn", "e10");
      expect(healed).toBe(true);

      const result = await cache.get(key);
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
      const disabled = new ActionCache({ projectRoot, enabled: false });
      const key = "somekey";
      await disabled.set(key, { type: "click" }, {
        instruction: "test",
        url: "https://example.com",
      });
      expect(await disabled.get(key)).toBeNull();
    });
  });

  describe("stats", () => {
    it("reports correct memory entries", async () => {
      const key1 = cache.getKey("action1", "https://example.com");
      const key2 = cache.getKey("action2", "https://example.com");
      await cache.set(key1, { type: "click" }, { instruction: "action1", url: "https://example.com" });
      await cache.set(key2, { type: "type" }, { instruction: "action2", url: "https://example.com" });

      const stats = await cache.stats();
      expect(stats.memoryEntries).toBe(2);
      expect(stats.totalEntries).toBeGreaterThanOrEqual(2);
    });
  });

  describe("clear", () => {
    it("removes all entries from memory", async () => {
      const key = cache.getKey("action1", "https://example.com");
      await cache.set(key, { type: "click" }, { instruction: "action1", url: "https://example.com" });
      await cache.clear();
      const stats = await cache.stats();
      expect(stats.memoryEntries).toBe(0);
    });
  });
});
