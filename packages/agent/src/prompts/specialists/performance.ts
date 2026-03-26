// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Performance Specialist Prompt
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Performance specialist system prompt supplement.
 * When active, the agent evaluates Core Web Vitals and performance metrics.
 */
export const PERFORMANCE_SPECIALIST_PROMPT = `## Performance Specialist Mode

You are also acting as a performance testing specialist. Evaluate:

### Core Web Vitals
- **LCP (Largest Contentful Paint)**: Should be < 2.5s. Identify the LCP element.
- **INP (Interaction to Next Paint)**: Should be < 200ms. Test interaction responsiveness.
- **CLS (Cumulative Layout Shift)**: Should be < 0.1. Watch for layout shifts during load and interaction.

### Loading Performance
- First Contentful Paint (FCP): < 1.8s
- Time to Interactive (TTI): < 3.8s
- Total Blocking Time (TBT): < 200ms
- Speed Index: < 3.4s

### Resource Analysis
- Count total requests and transferred bytes
- Identify render-blocking resources (CSS, JS in <head>)
- Check for unused CSS/JS (coverage)
- Verify images are properly sized and compressed
- Check for lazy loading on below-fold images
- Identify large third-party scripts

### Network Optimization
- Check HTTP/2 or HTTP/3 is used
- Verify resources are compressed (gzip/brotli)
- Check cache headers (Cache-Control, ETag, Last-Modified)
- Look for redundant requests
- Verify critical resources are preloaded

### Runtime Performance
- Watch for long tasks (> 50ms)
- Check for memory leaks during navigation
- Monitor DOM size (target: < 1500 nodes)
- Check for excessive re-renders
- Watch for layout thrashing (read-write cycles)

### Mobile Performance
- Test on simulated slow 3G
- Check resource sizes for mobile
- Verify adaptive serving (different assets for mobile)
- Test with CPU throttling

### Reporting
For each performance finding:
- **Metric**: which metric is affected
- **Current Value**: measured value
- **Target**: recommended threshold
- **Impact**: estimated user experience impact
- **Recommendation**: specific optimization suggestion`;

/**
 * Performance thresholds based on Google's recommendations.
 */
export const PERFORMANCE_THRESHOLDS = {
  /** Core Web Vitals */
  lcp: { good: 2500, needsImprovement: 4000 },
  inp: { good: 200, needsImprovement: 500 },
  cls: { good: 0.1, needsImprovement: 0.25 },

  /** Other metrics (all in ms) */
  fcp: { good: 1800, needsImprovement: 3000 },
  tti: { good: 3800, needsImprovement: 7300 },
  tbt: { good: 200, needsImprovement: 600 },
  speedIndex: { good: 3400, needsImprovement: 5800 },
  ttfb: { good: 800, needsImprovement: 1800 },

  /** Resource budgets */
  maxTotalTransferSize: 1_600_000, // 1.6 MB
  maxJSTransferSize: 300_000,      // 300 KB
  maxCSSTransferSize: 100_000,     // 100 KB
  maxImageSize: 200_000,           // 200 KB per image
  maxDOMNodes: 1500,
  maxRequestCount: 50,
  maxThirdPartyRequests: 10,
} as const;

/**
 * Rate a performance metric against thresholds.
 */
export function rateMetric(
  metric: keyof typeof PERFORMANCE_THRESHOLDS,
  value: number,
): "good" | "needs-improvement" | "poor" {
  const threshold = PERFORMANCE_THRESHOLDS[metric];
  if (typeof threshold === "number") {
    return value <= threshold ? "good" : "poor";
  }

  if (value <= threshold.good) return "good";
  if (value <= threshold.needsImprovement) return "needs-improvement";
  return "poor";
}

/**
 * Build a performance-focused test instruction.
 */
export function buildPerformanceInstruction(
  baseInstruction: string,
  options?: {
    networkThrottle?: "slow-3g" | "fast-3g" | "4g";
    cpuThrottle?: number;
    focusMetrics?: string[];
  },
): string {
  const parts = [baseInstruction];

  parts.push("\nAdditionally, while performing this test, evaluate performance:");
  parts.push("1. Measure page load times and Core Web Vitals");
  parts.push("2. Count network requests and total transfer size");
  parts.push("3. Check for render-blocking resources");
  parts.push("4. Monitor for layout shifts during interactions");
  parts.push("5. Identify slow interactions (> 200ms response time)");

  if (options?.networkThrottle) {
    parts.push(`\nNetwork condition: ${options.networkThrottle}`);
  }

  if (options?.cpuThrottle) {
    parts.push(`CPU throttle: ${options.cpuThrottle}x slowdown`);
  }

  if (options?.focusMetrics?.length) {
    parts.push(`\nFocus on these metrics: ${options.focusMetrics.join(", ")}`);
  }

  return parts.join("\n");
}

/**
 * Generate a performance budget from thresholds.
 */
export function generateBudget(strictness: "relaxed" | "standard" | "strict"): Record<string, number> {
  const multiplier = strictness === "relaxed" ? 1.5 : strictness === "strict" ? 0.7 : 1.0;

  return {
    maxLCP: Math.round(PERFORMANCE_THRESHOLDS.lcp.good * multiplier),
    maxINP: Math.round(PERFORMANCE_THRESHOLDS.inp.good * multiplier),
    maxCLS: +(PERFORMANCE_THRESHOLDS.cls.good * multiplier).toFixed(3),
    maxFCP: Math.round(PERFORMANCE_THRESHOLDS.fcp.good * multiplier),
    maxTBT: Math.round(PERFORMANCE_THRESHOLDS.tbt.good * multiplier),
    maxTransferSize: Math.round(PERFORMANCE_THRESHOLDS.maxTotalTransferSize * multiplier),
    maxJSSize: Math.round(PERFORMANCE_THRESHOLDS.maxJSTransferSize * multiplier),
    maxRequests: Math.round(PERFORMANCE_THRESHOLDS.maxRequestCount * multiplier),
    maxDOMNodes: Math.round(PERFORMANCE_THRESHOLDS.maxDOMNodes * multiplier),
  };
}
