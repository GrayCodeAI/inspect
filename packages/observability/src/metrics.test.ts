import { describe, it, expect, beforeEach } from "vitest";
import { MetricsCollector } from "./metrics.js";

describe("MetricsCollector", () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe("track", () => {
    it("records a metric entry", () => {
      const entry = collector.track("act", "test-model", {
        promptTokens: 100,
        completionTokens: 50,
      });
      expect(entry.fn).toBe("act");
      expect(entry.model).toBe("test-model");
      expect(entry.promptTokens).toBe(100);
      expect(entry.completionTokens).toBe(50);
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    it("defaults optional fields to 0", () => {
      const entry = collector.track("extract", "model", {
        promptTokens: 10,
        completionTokens: 5,
      });
      expect(entry.reasoningTokens).toBe(0);
      expect(entry.cachedInputTokens).toBe(0);
      expect(entry.inferenceTimeMs).toBe(0);
    });

    it("increments call count", () => {
      expect(collector.callCount).toBe(0);
      collector.track("act", "m", { promptTokens: 1, completionTokens: 1 });
      collector.track("observe", "m", { promptTokens: 1, completionTokens: 1 });
      expect(collector.callCount).toBe(2);
    });
  });

  describe("getTotal", () => {
    it("aggregates across entries", () => {
      collector.track("act", "m", {
        promptTokens: 100,
        completionTokens: 50,
        inferenceTimeMs: 200,
      });
      collector.track("extract", "m", {
        promptTokens: 200,
        completionTokens: 100,
        inferenceTimeMs: 300,
      });

      const total = collector.getTotal();
      expect(total.promptTokens).toBe(300);
      expect(total.completionTokens).toBe(150);
      expect(total.inferenceTimeMs).toBe(500);
    });

    it("returns zeros when empty", () => {
      const total = collector.getTotal();
      expect(total.promptTokens).toBe(0);
      expect(total.completionTokens).toBe(0);
      expect(total.cost).toBe(0);
    });
  });

  describe("getPerFunction", () => {
    it("groups metrics by function type", () => {
      collector.track("act", "m", { promptTokens: 100, completionTokens: 50 });
      collector.track("act", "m", { promptTokens: 200, completionTokens: 100 });
      collector.track("extract", "m", { promptTokens: 50, completionTokens: 25 });

      const perFn = collector.getPerFunction();
      expect(perFn.act.promptTokens).toBe(300);
      expect(perFn.act.completionTokens).toBe(150);
      expect(perFn.extract.promptTokens).toBe(50);
      expect(perFn.observe.promptTokens).toBe(0);
      expect(perFn.agent.promptTokens).toBe(0);
    });
  });

  describe("getPerModel", () => {
    it("groups metrics by model", () => {
      collector.track("act", "model-a", { promptTokens: 100, completionTokens: 50 });
      collector.track("act", "model-b", { promptTokens: 200, completionTokens: 100 });

      const perModel = collector.getPerModel();
      expect(perModel["model-a"].promptTokens).toBe(100);
      expect(perModel["model-b"].promptTokens).toBe(200);
    });
  });

  describe("reset", () => {
    it("clears all entries", () => {
      collector.track("act", "m", { promptTokens: 100, completionTokens: 50 });
      expect(collector.callCount).toBe(1);
      collector.reset();
      expect(collector.callCount).toBe(0);
      expect(collector.getTotal().promptTokens).toBe(0);
    });
  });

  describe("getEntries", () => {
    it("returns a copy of entries", () => {
      collector.track("act", "m", { promptTokens: 100, completionTokens: 50 });
      const entries = collector.getEntries();
      expect(entries).toHaveLength(1);
      // Verify it's a copy
      entries.pop();
      expect(collector.callCount).toBe(1);
    });
  });

  describe("calculateCost", () => {
    it("returns 0 for unknown model", () => {
      const cost = collector.calculateCost("nonexistent-model-xyz", {
        promptTokens: 1000,
        completionTokens: 500,
      });
      expect(cost).toBe(0);
    });
  });

  describe("timer", () => {
    it("measures elapsed time", async () => {
      const timer = MetricsCollector.timer();
      await new Promise((r) => setTimeout(r, 20));
      const elapsed = timer.elapsed();
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });

    it("stop returns elapsed time", async () => {
      const timer = MetricsCollector.timer();
      await new Promise((r) => setTimeout(r, 20));
      const stopped = timer.stop();
      expect(stopped).toBeGreaterThanOrEqual(10);
    });
  });

  describe("measure", () => {
    it("measures async function duration", async () => {
      const { result, durationMs } = await MetricsCollector.measure(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return 42;
      });
      expect(result).toBe(42);
      expect(durationMs).toBeGreaterThanOrEqual(10);
    });
  });
});
