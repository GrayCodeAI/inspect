// ──────────────────────────────────────────────────────────────────────────────
// @inspect/observability - Web Performance Metrics (Core Web Vitals)
// ──────────────────────────────────────────────────────────────────────────────

import type { PerformanceMetric, MetricRating } from "@inspect/shared";

/** Web vital metric name */
export type WebVitalName = "FCP" | "LCP" | "CLS" | "INP" | "TTFB";

/** Thresholds for Core Web Vitals ratings (good / needs-improvement boundary) */
export const WEB_VITAL_THRESHOLDS: Record<
  WebVitalName,
  { good: number; poor: number; unit: string }
> = {
  /** First Contentful Paint: good < 1.8s, poor > 3.0s */
  FCP: { good: 1800, poor: 3000, unit: "ms" },
  /** Largest Contentful Paint: good < 2.5s, poor > 4.0s */
  LCP: { good: 2500, poor: 4000, unit: "ms" },
  /** Cumulative Layout Shift: good < 0.1, poor > 0.25 */
  CLS: { good: 0.1, poor: 0.25, unit: "" },
  /** Interaction to Next Paint: good < 200ms, poor > 500ms */
  INP: { good: 200, poor: 500, unit: "ms" },
  /** Time to First Byte: good < 800ms, poor > 1800ms */
  TTFB: { good: 800, poor: 1800, unit: "ms" },
};

/** JavaScript to inject into a page to collect web-vitals */
const WEB_VITALS_INJECTION_SCRIPT = `
(function() {
  const metrics = {};

  // Helper to observe performance entries
  function observe(type, callback) {
    try {
      const observer = new PerformanceObserver(function(list) {
        const entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          callback(entries[i]);
        }
      });
      observer.observe({ type: type, buffered: true });
      return observer;
    } catch(e) {
      return null;
    }
  }

  // FCP - First Contentful Paint
  observe('paint', function(entry) {
    if (entry.name === 'first-contentful-paint') {
      metrics.FCP = entry.startTime;
    }
  });

  // LCP - Largest Contentful Paint
  observe('largest-contentful-paint', function(entry) {
    metrics.LCP = entry.startTime;
  });

  // CLS - Cumulative Layout Shift
  var clsValue = 0;
  observe('layout-shift', function(entry) {
    if (!entry.hadRecentInput) {
      clsValue += entry.value;
      metrics.CLS = clsValue;
    }
  });

  // INP - Interaction to Next Paint (approximation using event timing)
  var maxINP = 0;
  observe('event', function(entry) {
    var duration = entry.duration;
    if (duration > maxINP) {
      maxINP = duration;
      metrics.INP = duration;
    }
  });

  // TTFB - Time to First Byte
  observe('navigation', function(entry) {
    metrics.TTFB = entry.responseStart;
  });

  // Expose metrics globally for retrieval
  window.__INSPECT_WEB_VITALS__ = metrics;
})();
`;

/** Script to retrieve collected metrics */
const WEB_VITALS_RETRIEVAL_SCRIPT = `
(function() {
  return window.__INSPECT_WEB_VITALS__ || {};
})();
`;

/**
 * Page-like interface for injecting scripts and evaluating JS.
 * Compatible with Playwright Page objects.
 */
export interface PageLike {
  evaluate<T>(script: string | (() => T)): Promise<T>;
  addInitScript(script: string): Promise<void>;
  url(): string;
}

/**
 * PerformanceMetrics measures Core Web Vitals (FCP, LCP, CLS, INP, TTFB)
 * by injecting measurement scripts into browser pages.
 */
export class PerformanceMetrics {
  private injectedPages: WeakSet<PageLike> = new WeakSet();

  /**
   * Inject the web-vitals measurement script into a page.
   * Should be called before navigation for best results.
   *
   * @param page - Playwright-compatible page object
   */
  async inject(page: PageLike): Promise<void> {
    if (this.injectedPages.has(page)) return;

    await page.addInitScript(WEB_VITALS_INJECTION_SCRIPT);
    this.injectedPages.add(page);
  }

  /**
   * Measure Core Web Vitals on a page.
   * Injects the measurement script if not already injected,
   * then retrieves the collected metrics.
   *
   * @param page - Playwright-compatible page object
   * @returns Array of performance metrics with ratings
   */
  async measure(page: PageLike): Promise<PerformanceMetric[]> {
    // Inject if not already done
    if (!this.injectedPages.has(page)) {
      try {
        await page.evaluate(WEB_VITALS_INJECTION_SCRIPT);
        this.injectedPages.add(page);
      } catch {
        // Page might be in a state where injection fails
      }
    }

    // Wait a short time for metrics to settle
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Retrieve metrics
    let rawMetrics: Record<string, number>;
    try {
      rawMetrics = await page.evaluate(WEB_VITALS_RETRIEVAL_SCRIPT) as Record<string, number>;
    } catch {
      return [];
    }

    if (!rawMetrics || typeof rawMetrics !== "object") {
      return [];
    }

    const results: PerformanceMetric[] = [];

    for (const [name, value] of Object.entries(rawMetrics)) {
      if (typeof value !== "number" || !isFinite(value)) continue;
      if (!(name in WEB_VITAL_THRESHOLDS)) continue;

      const vitalName = name as WebVitalName;
      const thresholds = WEB_VITAL_THRESHOLDS[vitalName];
      const rating = rateMetric(value, thresholds.good, thresholds.poor);

      results.push({
        value,
        rating,
        displayValue: formatMetricValue(value, vitalName),
      });
    }

    return results;
  }

  /**
   * Measure performance on a page using the Performance API directly
   * (fallback for when web-vitals injection is not possible).
   *
   * @param page - Playwright-compatible page object
   * @returns Array of available performance metrics
   */
  async measureFallback(page: PageLike): Promise<PerformanceMetric[]> {
    const results: PerformanceMetric[] = [];

    try {
      const timing = await page.evaluate(`
        (function() {
          var nav = performance.getEntriesByType('navigation')[0];
          var paints = performance.getEntriesByType('paint');
          var fcp = null;
          for (var i = 0; i < paints.length; i++) {
            if (paints[i].name === 'first-contentful-paint') {
              fcp = paints[i].startTime;
            }
          }
          return {
            ttfb: nav ? nav.responseStart : null,
            fcp: fcp,
            domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
            load: nav ? nav.loadEventEnd : null
          };
        })();
      `) as {
        ttfb: number | null;
        fcp: number | null;
        domContentLoaded: number | null;
        load: number | null;
      };

      if (timing.ttfb !== null) {
        const thresholds = WEB_VITAL_THRESHOLDS.TTFB;
        results.push({
          value: timing.ttfb,
          rating: rateMetric(timing.ttfb, thresholds.good, thresholds.poor),
          displayValue: formatMetricValue(timing.ttfb, "TTFB"),
        });
      }

      if (timing.fcp !== null) {
        const thresholds = WEB_VITAL_THRESHOLDS.FCP;
        results.push({
          value: timing.fcp,
          rating: rateMetric(timing.fcp, thresholds.good, thresholds.poor),
          displayValue: formatMetricValue(timing.fcp, "FCP"),
        });
      }
    } catch {
      // Performance API might not be available
    }

    return results;
  }

  /**
   * Rate a single metric value.
   *
   * @param name - Metric name
   * @param value - Metric value
   * @returns The rating
   */
  rate(name: WebVitalName, value: number): MetricRating {
    const thresholds = WEB_VITAL_THRESHOLDS[name];
    return rateMetric(value, thresholds.good, thresholds.poor);
  }
}

/**
 * Rate a metric value against good/poor thresholds.
 */
function rateMetric(
  value: number,
  goodThreshold: number,
  poorThreshold: number,
): MetricRating {
  if (value <= goodThreshold) return "good";
  if (value >= poorThreshold) return "poor";
  return "needs-improvement";
}

/**
 * Format a metric value for display.
 */
function formatMetricValue(value: number, name: WebVitalName): string {
  if (name === "CLS") {
    return value.toFixed(3);
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} s`;
  }

  return `${Math.round(value)} ms`;
}
