import { describe, it, expect } from "vitest";
import { PerformanceMetrics, WEB_VITAL_THRESHOLDS } from "./performance.js";

describe("PerformanceMetrics", () => {
  const perf = new PerformanceMetrics();

  describe("WEB_VITAL_THRESHOLDS", () => {
    it("defines thresholds for all core web vitals", () => {
      expect(WEB_VITAL_THRESHOLDS.FCP).toBeDefined();
      expect(WEB_VITAL_THRESHOLDS.LCP).toBeDefined();
      expect(WEB_VITAL_THRESHOLDS.CLS).toBeDefined();
      expect(WEB_VITAL_THRESHOLDS.INP).toBeDefined();
      expect(WEB_VITAL_THRESHOLDS.TTFB).toBeDefined();
    });

    it("good < poor for all metrics", () => {
      for (const [, t] of Object.entries(WEB_VITAL_THRESHOLDS)) {
        expect(t.good).toBeLessThan(t.poor);
      }
    });
  });

  describe("rate", () => {
    it("rates FCP under good threshold as good", () => {
      expect(perf.rate("FCP", 1000)).toBe("good");
    });

    it("rates FCP over poor threshold as poor", () => {
      expect(perf.rate("FCP", 5000)).toBe("poor");
    });

    it("rates FCP between thresholds as needs-improvement", () => {
      expect(perf.rate("FCP", 2500)).toBe("needs-improvement");
    });

    it("rates LCP correctly", () => {
      expect(perf.rate("LCP", 1500)).toBe("good");
      expect(perf.rate("LCP", 3000)).toBe("needs-improvement");
      expect(perf.rate("LCP", 5000)).toBe("poor");
    });

    it("rates CLS correctly", () => {
      expect(perf.rate("CLS", 0.05)).toBe("good");
      expect(perf.rate("CLS", 0.15)).toBe("needs-improvement");
      expect(perf.rate("CLS", 0.3)).toBe("poor");
    });

    it("rates INP correctly", () => {
      expect(perf.rate("INP", 100)).toBe("good");
      expect(perf.rate("INP", 300)).toBe("needs-improvement");
      expect(perf.rate("INP", 600)).toBe("poor");
    });

    it("rates TTFB correctly", () => {
      expect(perf.rate("TTFB", 500)).toBe("good");
      expect(perf.rate("TTFB", 1000)).toBe("needs-improvement");
      expect(perf.rate("TTFB", 2000)).toBe("poor");
    });

    it("rates boundary values correctly", () => {
      // At good threshold = good (<=)
      expect(perf.rate("FCP", 1800)).toBe("good");
      // At poor threshold = poor (>=)
      expect(perf.rate("FCP", 3000)).toBe("poor");
    });
  });
});
