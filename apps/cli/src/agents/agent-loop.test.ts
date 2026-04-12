// ============================================================================
// Agent Loop Integration Tests
//
// Tests the wiring of: ActionCache, LoopDetector, SpeculativePlanner,
// DOMDiff (two-step), AnnotatedScreenshot (vision fallback)
// ============================================================================

import { describe, it, expect } from "vitest";
import { ActionLoopDetector, ActionCache } from "@inspect/agent";
import { SyncSpeculativePlanner as SpeculativePlanner, RunCache } from "@inspect/core";

// ---------------------------------------------------------------------------
// ActionCache integration
// ---------------------------------------------------------------------------

describe("ActionCache wiring", () => {
  it("caches action by instruction+url hash", async () => {
    const cache = new ActionCache({ enabled: true });
    await cache.ready;
    const key = ActionCache.key("click Play", "https://example.com");
    expect(key).toBeTypeOf("string");
    expect(key.length).toBeGreaterThan(0);

    await cache.set("click Play", "https://example.com", {
      type: "click",
      target: "Play",
      description: 'Click "Play"',
    });

    const hit = await cache.get("click Play", "https://example.com");
    expect(hit).not.toBeNull();
    expect(hit!.action.type).toBe("click");
    expect(hit!.action.target).toBe("Play");
  });

  it("returns null on cache miss", async () => {
    const cache = new ActionCache({ enabled: true });
    await cache.ready;
    const hit = await cache.get("nonexistent", "https://example.com");
    expect(hit).toBeNull();
  });

  it("tracks replay count", async () => {
    const cache = new ActionCache({ enabled: true });
    await cache.ready;
    const key = ActionCache.key("click Submit", "https://example.com");

    await cache.set("click Submit", "https://example.com", {
      type: "click",
      target: "Submit",
    });

    await cache.recordReplay(key);
    await cache.recordReplay(key);

    const entry = await cache.get("click Submit", "https://example.com");
    expect(entry!.replayCount).toBe(2);
  });

  it("skips caching when disabled", async () => {
    const cache = new ActionCache({ enabled: false });
    await cache.ready;
    await cache.set("click X", "https://example.com", { type: "click" });
    const hit = await cache.get("click X", "https://example.com");
    expect(hit).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LoopDetector integration
// ---------------------------------------------------------------------------

describe("LoopDetector wiring", () => {
  it("detects repetitive actions", () => {
    const detector = new ActionLoopDetector({ threshold: 3, maxNudges: 2 });

    detector.record("click", "Play", "https://example.com");
    detector.record("click", "Play", "https://example.com");
    detector.record("click", "Play", "https://example.com");

    const nudge = detector.check();
    expect(nudge.detected).toBe(true);
    expect(nudge.message).toBeTruthy();
    expect(nudge.forceStop).toBe(false);
  });

  it("does not detect with varied actions", () => {
    const detector = new ActionLoopDetector({ threshold: 3 });

    detector.record("click", "Play", "https://example.com");
    detector.record("click", "Submit", "https://example.com");
    detector.record("fill", "Email", "https://example.com");

    const nudge = detector.check();
    expect(nudge.detected).toBe(false);
  });

  it("force-stops after max nudges exceeded", () => {
    const detector = new ActionLoopDetector({ threshold: 2, maxNudges: 1 });

    // First loop
    detector.record("click", "X", "https://example.com");
    detector.record("click", "X", "https://example.com");
    detector.check(); // nudge 1

    // Second loop
    detector.record("click", "X", "https://example.com");
    detector.record("click", "X", "https://example.com");
    const nudge = detector.check();
    expect(nudge.forceStop).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SpeculativePlanner integration
// ---------------------------------------------------------------------------

describe("SpeculativePlanner wiring", () => {
  it("stores and retrieves pre-computed plan", () => {
    const planner = new SpeculativePlanner();

    planner.precompute(2, "snapshot text", "pre-built prompt", "https://example.com/page");
    const plan = planner.get(2, "https://example.com/page");

    expect(plan).not.toBeNull();
    expect(plan!.prompt).toBe("pre-built prompt");
    expect(plan!.snapshot).toBe("snapshot text");
  });

  it("discards plan when URL path changes", () => {
    const planner = new SpeculativePlanner();

    planner.precompute(2, "snap", "prompt", "https://example.com/page-a");
    const plan = planner.get(2, "https://example.com/page-b");

    expect(plan).toBeNull();
  });

  it("returns null for non-existent step", () => {
    const planner = new SpeculativePlanner();
    const plan = planner.get(99, "https://example.com");
    expect(plan).toBeNull();
  });

  it("tracks stats correctly", () => {
    const planner = new SpeculativePlanner();

    planner.precompute(1, "s", "p", "https://example.com/a");
    planner.precompute(2, "s", "p", "https://example.com/a");
    planner.get(1, "https://example.com/a"); // used
    planner.get(2, "https://example.com/b"); // discarded

    const stats = planner.getStats();
    expect(stats.generated).toBe(2);
    expect(stats.used).toBe(1);
    expect(stats.discarded).toBe(1);
    expect(stats.estimatedTimeSavedMs).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// RunCache integration
// ---------------------------------------------------------------------------

describe("RunCache wiring", () => {
  it("generates deterministic keys", () => {
    const key1 = RunCache.key("https://example.com", "test login", "desktop");
    const key2 = RunCache.key("https://example.com", "test login", "desktop");
    expect(key1).toBe(key2);
  });

  it("different inputs produce different keys", () => {
    const key1 = RunCache.key("https://example.com/page-a", "test", "desktop");
    const key2 = RunCache.key("https://example.com/page-b", "test", "desktop");
    expect(key1).not.toBe(key2);
  });
});

// ---------------------------------------------------------------------------
// Integration: agent prompt includes loop nudge
// ---------------------------------------------------------------------------

describe("Agent loop prompt integration", () => {
  it("loop nudge message is suitable for LLM injection", () => {
    const detector = new ActionLoopDetector({ threshold: 2 });

    detector.record("click", "Play", "https://example.com");
    detector.record("click", "Play", "https://example.com");

    const nudge = detector.check();
    expect(nudge.detected).toBe(true);
    // Nudge message should be human-readable for LLM prompt injection
    expect(nudge.message).toContain("Play");
  });
});

// ---------------------------------------------------------------------------
// Integration: cache + loop detector coexist
// ---------------------------------------------------------------------------

describe("Cache + LoopDetector coexistence", () => {
  it("cached actions still get recorded in loop detector", async () => {
    const cache = new ActionCache({ enabled: true });
    await cache.ready;
    const detector = new ActionLoopDetector({ threshold: 3 });

    // Simulate: cache hit for same action 3 times
    await cache.set("click Play|https://ex.com", "https://ex.com", {
      type: "click",
      target: "Play",
    });

    for (let i = 0; i < 3; i++) {
      const hit = await cache.get("click Play|https://ex.com", "https://ex.com");
      expect(hit).not.toBeNull();
      // In the real loop, we'd record after each action:
      detector.record("click", "Play", "https://ex.com");
    }

    const nudge = detector.check();
    // Loop detector should catch the repetition even with cached actions
    expect(nudge.detected).toBe(true);
  });
});
