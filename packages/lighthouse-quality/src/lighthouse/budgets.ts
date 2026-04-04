// ============================================================================
// @inspect/quality - Lighthouse Performance Budgets
// ============================================================================

import type { LighthouseReport, PerformanceMetric } from "@inspect/shared";

/** A single budget threshold */
export interface BudgetThreshold {
  /** Metric name (e.g., "FCP", "LCP", "TBT", "CLS", "SI", "TTI", "performance", "seo") */
  metric: string;
  /** Maximum allowed value (ms for timing metrics, score 0-100 for categories) */
  maxValue: number;
  /** Budget severity: "error" blocks, "warning" just reports */
  severity?: "error" | "warning";
  /** Human-readable label */
  label?: string;
}

/** Budget assertion result */
export interface BudgetAssertionResult {
  /** Whether the metric passed */
  passed: boolean;
  /** Metric name */
  metric: string;
  /** Actual value */
  actual: number;
  /** Budget limit */
  budget: number;
  /** How much over budget (negative means under) */
  overage: number;
  /** Severity of the assertion */
  severity: "error" | "warning";
  /** Human-readable summary */
  message: string;
}

/** Overall budget check result */
export interface BudgetCheckResult {
  /** Whether all error-level budgets passed */
  passed: boolean;
  /** Individual assertion results */
  assertions: BudgetAssertionResult[];
  /** Number of errors */
  errorCount: number;
  /** Number of warnings */
  warningCount: number;
}

/** Common preset budgets */
export const BUDGET_PRESETS = {
  /** Strict mobile-first budgets */
  strict: [
    { metric: "FCP", maxValue: 1800, severity: "error" as const, label: "First Contentful Paint" },
    {
      metric: "LCP",
      maxValue: 2500,
      severity: "error" as const,
      label: "Largest Contentful Paint",
    },
    { metric: "CLS", maxValue: 0.1, severity: "error" as const, label: "Cumulative Layout Shift" },
    { metric: "TBT", maxValue: 200, severity: "error" as const, label: "Total Blocking Time" },
    { metric: "SI", maxValue: 3400, severity: "warning" as const, label: "Speed Index" },
    { metric: "TTI", maxValue: 3800, severity: "warning" as const, label: "Time to Interactive" },
    { metric: "performance", maxValue: 90, severity: "error" as const, label: "Performance Score" },
  ] as BudgetThreshold[],

  /** Relaxed budgets for complex apps */
  relaxed: [
    { metric: "FCP", maxValue: 3000, severity: "error" as const, label: "First Contentful Paint" },
    {
      metric: "LCP",
      maxValue: 4000,
      severity: "error" as const,
      label: "Largest Contentful Paint",
    },
    {
      metric: "CLS",
      maxValue: 0.25,
      severity: "warning" as const,
      label: "Cumulative Layout Shift",
    },
    { metric: "TBT", maxValue: 600, severity: "warning" as const, label: "Total Blocking Time" },
    { metric: "SI", maxValue: 5800, severity: "warning" as const, label: "Speed Index" },
    { metric: "performance", maxValue: 50, severity: "error" as const, label: "Performance Score" },
  ] as BudgetThreshold[],

  /** Core Web Vitals only */
  coreWebVitals: [
    {
      metric: "LCP",
      maxValue: 2500,
      severity: "error" as const,
      label: "Largest Contentful Paint",
    },
    { metric: "CLS", maxValue: 0.1, severity: "error" as const, label: "Cumulative Layout Shift" },
    {
      metric: "TBT",
      maxValue: 200,
      severity: "error" as const,
      label: "Total Blocking Time (proxy for INP)",
    },
  ] as BudgetThreshold[],
} as const;

/**
 * BudgetManager checks Lighthouse reports against performance budgets
 * and returns pass/fail assertions.
 */
export class BudgetManager {
  private budgets: BudgetThreshold[] = [];

  constructor(budgets?: BudgetThreshold[]) {
    if (budgets) this.budgets = budgets;
  }

  /**
   * Set the budgets to check against.
   */
  setBudgets(budgets: BudgetThreshold[]): void {
    this.budgets = budgets;
  }

  /**
   * Load a preset budget configuration.
   */
  usePreset(preset: keyof typeof BUDGET_PRESETS): void {
    this.budgets = [...BUDGET_PRESETS[preset]];
  }

  /**
   * Add a single budget threshold.
   */
  addBudget(threshold: BudgetThreshold): void {
    this.budgets.push(threshold);
  }

  /**
   * Assert that a Lighthouse report meets the configured budgets.
   */
  assertBudgets(report: LighthouseReport): BudgetCheckResult {
    const assertions: BudgetAssertionResult[] = [];

    for (const budget of this.budgets) {
      const actual = this.getMetricValue(report, budget.metric);
      if (actual === null) continue;

      const severity = budget.severity ?? "error";
      const isScoreMetric = this.isScoreMetric(budget.metric);

      // For scores, higher is better (actual must be >= maxValue)
      // For timing/size metrics, lower is better (actual must be <= maxValue)
      const passed = isScoreMetric ? actual >= budget.maxValue : actual <= budget.maxValue;

      const overage = isScoreMetric
        ? budget.maxValue - actual // negative means above budget (good)
        : actual - budget.maxValue; // positive means over budget (bad)

      const label = budget.label ?? budget.metric;
      const _unit = this.getMetricUnit(budget.metric);
      const message = passed
        ? `${label}: ${this.formatValue(actual, budget.metric)} (budget: ${this.formatValue(budget.maxValue, budget.metric)})`
        : `${label}: ${this.formatValue(actual, budget.metric)} exceeds budget of ${this.formatValue(budget.maxValue, budget.metric)} by ${this.formatValue(Math.abs(overage), budget.metric)}`;

      assertions.push({
        passed,
        metric: budget.metric,
        actual,
        budget: budget.maxValue,
        overage,
        severity,
        message,
      });
    }

    const errorCount = assertions.filter((a) => !a.passed && a.severity === "error").length;
    const warningCount = assertions.filter((a) => !a.passed && a.severity === "warning").length;

    return {
      passed: errorCount === 0,
      assertions,
      errorCount,
      warningCount,
    };
  }

  /**
   * Get the numeric value of a metric from a Lighthouse report.
   */
  private getMetricValue(report: LighthouseReport, metric: string): number | null {
    // Category scores
    switch (metric) {
      case "performance":
        return report.scores.performance;
      case "accessibility":
        return report.scores.accessibility;
      case "best-practices":
      case "bestPractices":
        return report.scores.bestPractices;
      case "seo":
        return report.scores.seo;
      case "pwa":
        return report.scores.pwa ?? null;
    }

    // Performance metrics
    const metricMap: Record<string, PerformanceMetric | undefined> = {
      FCP: report.metrics.FCP,
      LCP: report.metrics.LCP,
      CLS: report.metrics.CLS,
      TBT: report.metrics.TBT,
      SI: report.metrics.SI,
      TTI: report.metrics.TTI,
      INP: report.metrics.INP,
      TTFB: report.metrics.TTFB,
    };

    const m = metricMap[metric];
    return m?.value ?? null;
  }

  /**
   * Check if a metric is a score (higher is better).
   */
  private isScoreMetric(metric: string): boolean {
    return [
      "performance",
      "accessibility",
      "best-practices",
      "bestPractices",
      "seo",
      "pwa",
    ].includes(metric);
  }

  /**
   * Get the display unit for a metric.
   */
  private getMetricUnit(metric: string): string {
    if (this.isScoreMetric(metric)) return "";
    if (metric === "CLS") return "";
    return "ms";
  }

  /**
   * Format a metric value for display.
   */
  private formatValue(value: number, metric: string): string {
    if (this.isScoreMetric(metric)) return `${value}`;
    if (metric === "CLS") return value.toFixed(3);
    if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
    return `${Math.round(value)}ms`;
  }
}
