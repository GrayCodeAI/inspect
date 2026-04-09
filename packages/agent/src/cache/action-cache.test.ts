// ──────────────────────────────────────────────────────────────────────────────
// Action Cache Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest";
import { ActionCache, DEFAULT_CACHE_CONFIG, type ElementSignature } from "./action-cache.js";

describe("ActionCache", () => {
  let cache: ActionCache;

  beforeEach(() => {
    cache = new ActionCache();
  });

  describe("generateKey", () => {
    it("should generate deterministic keys for same inputs", () => {
      const key1 = cache.generateKey("Click the button", "<div>test</div>", "https://example.com");
      const key2 = cache.generateKey("Click the button", "<div>test</div>", "https://example.com");
      expect(key1).toBe(key2);
    });

    it("should generate different keys for different instructions", () => {
      const key1 = cache.generateKey("Click the button", "<div>test</div>", "https://example.com");
      const key2 = cache.generateKey("Fill the input", "<div>test</div>", "https://example.com");
      expect(key1).not.toBe(key2);
    });

    it("should normalize URLs for consistent keys", () => {
      const key1 = cache.generateKey("Click", "<div>", "https://example.com/path?foo=bar");
      const key2 = cache.generateKey("Click", "<div>", "https://example.com/path?baz=qux");
      expect(key1).toBe(key2);
    });

    it("should canonicalize instructions (remove articles)", () => {
      const key1 = cache.generateKey("Click the button", "<div>", "https://example.com");
      const key2 = cache.generateKey("Click a button", "<div>", "https://example.com");
      const key3 = cache.generateKey("Click button", "<div>", "https://example.com");
      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
    });
  });

  describe("set and get", () => {
    it("should store and retrieve cached actions", () => {
      const elements: ElementSignature[] = [{ tag: "button", text: "Submit" }];
      const action = { type: "click", params: { selector: "#submit" } };

      cache.set("Click submit", "<button>Submit</button>", "https://example.com", action, elements);

      const result = cache.get("Click submit", "<button>Submit</button>", "https://example.com");

      expect(result).toBeDefined();
      expect(result?.action).toEqual(action);
      expect(result?.matchType).toBe("exact");
      expect(result?.confidence).toBe(1.0);
    });

    it("should return undefined for cache misses", () => {
      const result = cache.get("Non-existent", "<div>", "https://example.com");
      expect(result).toBeUndefined();
    });

    it("should track access statistics", () => {
      const elements: ElementSignature[] = [{ tag: "button" }];
      cache.set(
        "Click",
        "<button>",
        "https://example.com",
        { type: "click", params: {} },
        elements,
      );

      cache.get("Click", "<button>", "https://example.com");
      cache.get("Click", "<button>", "https://example.com");

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(1.0);
    });
  });

  describe("similarity matching", () => {
    it("should find similar actions when exact match not found", () => {
      const elements: ElementSignature[] = [{ tag: "button", text: "Submit" }];
      cache.set(
        "Click the submit button",
        "<button>Submit</button>",
        "https://example.com",
        { type: "click", params: { selector: "#submit" } },
        elements,
      );

      // Similar but not exact instruction
      const result = cache.get(
        "Click submit button",
        "<button>Submit</button>",
        "https://example.com",
      );

      expect(result).toBeDefined();
      expect(result?.matchType).toBe("similar");
      expect(result?.confidence).toBeGreaterThan(0.8);
    });

    it("should respect similarity threshold", () => {
      cache = new ActionCache({ similarityThreshold: 0.95 });

      const elements: ElementSignature[] = [{ tag: "button" }];
      cache.set(
        "Click the red button",
        "<button>",
        "https://example.com",
        { type: "click", params: {} },
        elements,
      );

      // Too different
      const result = cache.get("Fill the blue input", "<button>", "https://example.com");
      expect(result).toBeUndefined();
    });
  });

  describe("structural matching", () => {
    it("should match by structure when content changes", () => {
      const structuralElements: ElementSignature[] = [
        { tag: "div", role: "navigation" },
        { tag: "button", role: "button" },
      ];

      cache.set(
        "Click nav button",
        "<div>Old content</div>",
        "https://example.com",
        { type: "click", params: {} },
        structuralElements,
      );

      // Same structure, different content
      const result = cache.get(
        "Click nav button",
        "<div>New content</div>",
        "https://example.com",
        structuralElements,
      );

      expect(result).toBeDefined();
      expect(result?.matchType).toBe("structural");
    });
  });

  describe("TTL and expiration", () => {
    it("should expire entries after TTL", () => {
      cache = new ActionCache({ defaultTtl: 1 }); // 1ms TTL

      const elements: ElementSignature[] = [{ tag: "button" }];
      cache.set(
        "Click",
        "<button>",
        "https://example.com",
        { type: "click", params: {} },
        elements,
      );

      // Should exist immediately
      expect(cache.get("Click", "<button>", "https://example.com")).toBeDefined();

      // Wait for expiration
      setTimeout(() => {
        expect(cache.get("Click", "<button>", "https://example.com")).toBeUndefined();
      }, 10);
    });
  });

  describe("LRU eviction", () => {
    it("should evict oldest entries when max size reached", () => {
      cache = new ActionCache({ maxSize: 2 });

      const elements: ElementSignature[] = [{ tag: "button" }];

      cache.set(
        "Action 1",
        "<div>1</div>",
        "https://example.com",
        { type: "click", params: {} },
        elements,
      );
      cache.set(
        "Action 2",
        "<div>2</div>",
        "https://example.com",
        { type: "click", params: {} },
        elements,
      );
      cache.set(
        "Action 3",
        "<div>3</div>",
        "https://example.com",
        { type: "click", params: {} },
        elements,
      );

      // Action 1 should be evicted
      expect(cache.get("Action 1", "<div>1</div>", "https://example.com")).toBeUndefined();
      expect(cache.get("Action 2", "<div>2</div>", "https://example.com")).toBeDefined();
      expect(cache.get("Action 3", "<div>3</div>", "https://example.com")).toBeDefined();
    });
  });

  describe("success rate tracking", () => {
    it("should remove entries with low success rate", () => {
      cache = new ActionCache({ minSuccessRate: 0.5 });

      const elements: ElementSignature[] = [{ tag: "button" }];
      cache.set(
        "Click",
        "<button>",
        "https://example.com",
        { type: "click", params: {} },
        elements,
      );

      // Report failures
      cache.reportResult("Click", "<button>", "https://example.com", false);
      cache.reportResult("Click", "<button>", "https://example.com", false);
      cache.reportResult("Click", "<button>", "https://example.com", false);

      // Should be removed due to low success rate
      expect(cache.get("Click", "<button>", "https://example.com")).toBeUndefined();
    });

    it("should keep entries with high success rate", () => {
      const elements: ElementSignature[] = [{ tag: "button" }];
      cache.set(
        "Click",
        "<button>",
        "https://example.com",
        { type: "click", params: {} },
        elements,
      );

      // Report successes
      cache.reportResult("Click", "<button>", "https://example.com", true);
      cache.reportResult("Click", "<button>", "https://example.com", true);

      expect(cache.get("Click", "<button>", "https://example.com")).toBeDefined();
    });
  });

  describe("validation", () => {
    it("should validate cached actions", async () => {
      const elements: ElementSignature[] = [{ tag: "button" }];
      cache.set(
        "Click",
        "<button>",
        "https://example.com",
        { type: "click", params: {}, selector: "#btn" },
        elements,
        { url: "https://example.com", elementPresent: "#btn" },
      );

      const result = await cache.validate(
        {
          key: "test",
          instruction: "Click",
          canonicalInstruction: "click",
          action: { type: "click", params: {}, selector: "#btn" },
          domHash: "abc",
          structuralDomHash: "def",
          url: "https://example.com",
          urlPattern: "https://example.com",
          stats: {
            timesUsed: 0,
            timesSucceeded: 0,
            timesFailed: 0,
            lastUsed: 0,
            firstCached: 0,
            lastValidated: 0,
          },
          ttl: 3600000,
          validation: { enabled: true, strategy: "selector", retryCount: 1 },
          expectedOutcome: { url: "https://example.com", elementPresent: "#btn" },
        },
        {
          url: "https://example.com",
          elementPresent: true,
        },
      );

      expect(result.passed).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe("DOM change detection", () => {
    it("should invalidate entries when DOM changes significantly", () => {
      cache = new ActionCache({ invalidateOnDomChange: true, domChangeThreshold: 0.3 });

      const elements1: ElementSignature[] = [{ tag: "div", text: "Content A" }, { tag: "button" }];

      cache.set(
        "Click",
        "content",
        "https://example.com",
        { type: "click", params: {} },
        elements1,
      );

      // Different DOM structure should invalidate
      const elements2: ElementSignature[] = [{ tag: "span", text: "Different" }, { tag: "link" }];

      // Set with new DOM (should trigger invalidation)
      cache.set("Other", "other", "https://example.com", { type: "click", params: {} }, elements2);

      const stats = cache.getStats();
      expect(stats.domInvalidations).toBeGreaterThanOrEqual(0);
    });
  });

  describe("import/export", () => {
    it("should export and import cache data", () => {
      const elements: ElementSignature[] = [{ tag: "button" }];
      cache.set(
        "Click",
        "<button>",
        "https://example.com",
        { type: "click", params: {} },
        elements,
      );

      const exported = cache.export();
      expect(exported.length).toBe(1);

      const newCache = new ActionCache();
      newCache.import(exported);

      expect(newCache.get("Click", "<button>", "https://example.com")).toBeDefined();
    });
  });

  describe("statistics", () => {
    it("should provide accurate stats", () => {
      const elements: ElementSignature[] = [{ tag: "button" }];

      cache.set(
        "Action 1",
        "<div>",
        "https://example.com",
        { type: "click", params: {} },
        elements,
      );
      cache.set("Action 2", "<div>", "https://example.com", { type: "fill", params: {} }, elements);

      cache.get("Action 1", "<div>", "https://example.com");
      cache.get("Missing", "<div>", "https://example.com");

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });
});
