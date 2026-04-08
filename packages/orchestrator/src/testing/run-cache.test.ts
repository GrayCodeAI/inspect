import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { RunCache, CachedTestRun, CachedStep } from "./run-cache.js";

describe("RunCache", () => {
  let cache: RunCache;

  beforeEach(() => {
    cache = new RunCache({ maxEntries: 100 });
  });

  describe("get", () => {
    it("should return undefined if no cached run exists for the key", async () => {
      const result = await Effect.runPromise(cache.get("nonexistent"));
      expect(result).toBeUndefined();
    });

    it("should return the cached run for the given key", async () => {
      const key = "test-run-1";
      const run: CachedTestRun = {
        status: "completed",
        steps: [],
        totalDuration: 1000,
        tokenCount: 200,
        agent: "claude",
        device: "desktop",
        timestamp: Date.now(),
        error: null,
        recordingPath: null,
        replayViewerPath: null,
      };

      await Effect.runPromise(cache.set(key, run));

      const cached = await Effect.runPromise(cache.get(key));
      expect(cached).toEqual(run);
    });
  });

  describe("set", () => {
    it("should store a run in the cache", async () => {
      const key = "test-run-1";
      const run: CachedTestRun = {
        status: "completed",
        steps: [],
        totalDuration: 1000,
        tokenCount: 200,
        agent: "claude",
        device: "desktop",
        timestamp: Date.now(),
        error: null,
        recordingPath: null,
        replayViewerPath: null,
      };

      await Effect.runPromise(cache.set(key, run));

      const cached = await Effect.runPromise(cache.get(key));
      expect(cached).toEqual(run);
    });

    it("should respect maxEntries limit and evict old entries", async () => {
      // Create a cache with maxEntries = 2
      const smallCache = new RunCache({ maxEntries: 2 });

      await Effect.runPromise(
        smallCache.set("key1", {
          status: "completed",
          steps: [],
          totalDuration: 100,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 1000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );
      await Effect.runPromise(
        smallCache.set("key2", {
          status: "completed",
          steps: [],
          totalDuration: 200,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 2000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );
      await Effect.runPromise(
        smallCache.set("key3", {
          status: "completed",
          steps: [],
          totalDuration: 300,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 3000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );

      // key1 should be evicted
      const result1 = await Effect.runPromise(smallCache.get("key1"));
      expect(result1).toBeUndefined();

      // key2 and key3 should exist
      const result2 = await Effect.runPromise(smallCache.get("key2"));
      expect(result2).toBeDefined();
      const result3 = await Effect.runPromise(smallCache.get("key3"));
      expect(result3).toBeDefined();
    });

    it("should update existing entry and reset its position", async () => {
      const cacheWithUpdate = new RunCache({ maxEntries: 2 });

      await Effect.runPromise(
        cacheWithUpdate.set("key1", {
          status: "completed",
          steps: [],
          totalDuration: 100,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 1000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );
      await Effect.runPromise(
        cacheWithUpdate.set("key2", {
          status: "completed",
          steps: [],
          totalDuration: 200,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 2000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );

      // Update key1 - it should become most recent and key2 should be least recent
      await Effect.runPromise(
        cacheWithUpdate.set("key1", {
          status: "completed",
          steps: [],
          totalDuration: 150,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 3000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );

      // key2 should still exist (under maxEntries)
      const result2 = await Effect.runPromise(cacheWithUpdate.get("key2"));
      expect(result2).toBeDefined();

      // Now add key3 - key2 should be evicted because it's least recently used
      await Effect.runPromise(
        cacheWithUpdate.set("key3", {
          status: "completed",
          steps: [],
          totalDuration: 300,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 4000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );

      const result2After = await Effect.runPromise(cacheWithUpdate.get("key2"));
      expect(result2After).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("should remove a specific entry from the cache", async () => {
      const key = "test-run-1";
      await Effect.runPromise(
        cache.set(key, {
          status: "completed",
          steps: [],
          totalDuration: 100,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: Date.now(),
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );

      const initial = await Effect.runPromise(cache.get(key));
      expect(initial).toBeDefined();

      await Effect.runPromise(cache.delete(key));

      const afterDelete = await Effect.runPromise(cache.get(key));
      expect(afterDelete).toBeUndefined();
    });

    it("should return true if entry existed, false otherwise", async () => {
      const result1 = await Effect.runPromise(cache.delete("nonexistent"));
      expect(result1).toBe(false);

      await Effect.runPromise(
        cache.set("key1", {
          status: "completed",
          steps: [],
          totalDuration: 100,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: Date.now(),
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );

      const result2 = await Effect.runPromise(cache.delete("key1"));
      expect(result2).toBe(true);
    });
  });

  describe("clear", () => {
    it("should remove all entries from the cache", async () => {
      await Effect.runPromise(
        cache.set("key1", {
          status: "completed",
          steps: [],
          totalDuration: 100,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 1000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );
      await Effect.runPromise(
        cache.set("key2", {
          status: "completed",
          steps: [],
          totalDuration: 200,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 2000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );

      await Effect.runPromise(cache.clear());

      const result1 = await Effect.runPromise(cache.get("key1"));
      expect(result1).toBeUndefined();
      const result2 = await Effect.runPromise(cache.get("key2"));
      expect(result2).toBeUndefined();
      expect(cache.size).toEqual(0);
    });
  });

  describe("size", () => {
    it("should return the number of entries in the cache", async () => {
      expect(cache.size).toEqual(0);

      await Effect.runPromise(
        cache.set("key1", {
          status: "completed",
          steps: [],
          totalDuration: 100,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 1000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );
      expect(cache.size).toEqual(1);

      await Effect.runPromise(
        cache.set("key2", {
          status: "completed",
          steps: [],
          totalDuration: 200,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 2000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );
      expect(cache.size).toEqual(2);

      await Effect.runPromise(cache.delete("key1"));
      expect(cache.size).toEqual(1);
    });
  });

  describe("keys", () => {
    it("should return all keys in the cache", async () => {
      await Effect.runPromise(
        cache.set("key1", {
          status: "completed",
          steps: [],
          totalDuration: 100,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 1000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );
      await Effect.runPromise(
        cache.set("key2", {
          status: "completed",
          steps: [],
          totalDuration: 200,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 2000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );

      const keys = await Effect.runPromise(cache.keys());
      expect(keys).toHaveLength(2);
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
    });
  });

  describe("values", () => {
    it("should return all values in the cache", async () => {
      const run1: CachedTestRun = {
        status: "completed",
        steps: [],
        totalDuration: 100,
        tokenCount: 0,
        agent: "claude",
        device: "desktop",
        timestamp: 1000,
        error: null,
        recordingPath: null,
        replayViewerPath: null,
      };
      const run2: CachedTestRun = {
        status: "completed",
        steps: [],
        totalDuration: 200,
        tokenCount: 0,
        agent: "claude",
        device: "desktop",
        timestamp: 2000,
        error: null,
        recordingPath: null,
        replayViewerPath: null,
      };

      await Effect.runPromise(cache.set("key1", run1));
      await Effect.runPromise(cache.set("key2", run2));

      const values = await Effect.runPromise(cache.values());
      expect(values).toHaveLength(2);
      expect(values[0]).toEqual(run1);
      expect(values[1]).toEqual(run2);
    });
  });

  describe("contains", () => {
    it("should return true if key exists in cache", async () => {
      await Effect.runPromise(
        cache.set("key1", {
          status: "completed",
          steps: [],
          totalDuration: 100,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: Date.now(),
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );

      const exists = await Effect.runPromise(cache.contains("key1"));
      expect(exists).toBe(true);

      const notExists = await Effect.runPromise(cache.contains("key2"));
      expect(notExists).toBe(false);
    });
  });

  describe("peek", () => {
    it("should return the value for a key without promoting it", async () => {
      const cacheWithPromotion = new RunCache({ maxEntries: 2 });

      await Effect.runPromise(
        cacheWithUpdate.set("key1", {
          status: "completed",
          steps: [],
          totalDuration: 100,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 1000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );
      await Effect.runPromise(
        cacheWithUpdate.set("key2", {
          status: "completed",
          steps: [],
          totalDuration: 200,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 2000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );

      // Peek at key1 - should not affect its position
      const value = await Effect.runPromise(cacheWithUpdate.peek("key1"));
      expect(value).toBeDefined();

      // Add key3 - key2 should be evicted (least recently used), not key1
      await Effect.runPromise(
        cacheWithUpdate.set("key3", {
          status: "completed",
          steps: [],
          totalDuration: 300,
          tokenCount: 0,
          agent: "claude",
          device: "desktop",
          timestamp: 3000,
          error: null,
          recordingPath: null,
          replayViewerPath: null,
        }),
      );

      const result2 = await Effect.runPromise(cacheWithUpdate.get("key2"));
      expect(result2).toBeUndefined(); // key2 should be evicted
    });
  });
});
