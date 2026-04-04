import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Budget {
  /** Lighthouse performance score minimum (0-100) */
  performance?: number;
  /** Lighthouse accessibility score minimum (0-100) */
  accessibility?: number;
  /** Lighthouse SEO score minimum (0-100) */
  seo?: number;
  /** Lighthouse best practices score minimum (0-100) */
  bestPractices?: number;
  /** Maximum a11y violations allowed */
  maxA11yViolations?: number;
  /** Maximum visual diff percentage allowed */
  maxVisualDiff?: number;
  /** Maximum security findings allowed */
  maxSecurityFindings?: number;
  /** Maximum test step failures allowed (0 = strict) */
  maxFailures?: number;
  /** Maximum test duration in ms */
  maxDuration?: number;
}

const DEFAULT_BUDGETS: Budget = {
  performance: 80,
  accessibility: 90,
  maxA11yViolations: 0,
  maxVisualDiff: 0.1,
  maxSecurityFindings: 0,
  maxFailures: 0,
};

/**
 * Load budget from a file or return defaults.
 */
export function loadBudget(budgetPath?: string): Budget {
  if (!budgetPath) {
    // Check for default budget file
    const defaults = ["inspect.budget.json", ".inspect/budget.json"];
    for (const f of defaults) {
      const p = resolve(process.cwd(), f);
      if (existsSync(p)) {
        return { ...DEFAULT_BUDGETS, ...JSON.parse(readFileSync(p, "utf-8")) };
      }
    }
    return DEFAULT_BUDGETS;
  }

  const fullPath = resolve(budgetPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Budget file not found: ${fullPath}`);
  }

  return { ...DEFAULT_BUDGETS, ...JSON.parse(readFileSync(fullPath, "utf-8")) };
}

/**
 * Check results against a budget and return violations.
 */
export function checkBudget(
  budget: Budget,
  results: {
    testFailures?: number;
    duration?: number;
    lighthouseScores?: Record<string, number>;
    a11yViolations?: number;
    visualDiff?: number;
    securityFindings?: number;
  },
): Array<{ metric: string; budget: number | string; actual: number | string; passed: boolean }> {
  const checks: Array<{
    metric: string;
    budget: number | string;
    actual: number | string;
    passed: boolean;
  }> = [];

  if (budget.maxFailures !== undefined && results.testFailures !== undefined) {
    checks.push({
      metric: "Test failures",
      budget: `\u2264 ${budget.maxFailures}`,
      actual: String(results.testFailures),
      passed: results.testFailures <= budget.maxFailures,
    });
  }

  if (budget.maxDuration !== undefined && results.duration !== undefined) {
    checks.push({
      metric: "Duration",
      budget: `\u2264 ${budget.maxDuration}ms`,
      actual: `${results.duration}ms`,
      passed: results.duration <= budget.maxDuration,
    });
  }

  if (results.lighthouseScores) {
    if (budget.performance !== undefined && results.lighthouseScores.performance !== undefined) {
      checks.push({
        metric: "LH Performance",
        budget: `\u2265 ${budget.performance}`,
        actual: String(results.lighthouseScores.performance),
        passed: results.lighthouseScores.performance >= budget.performance,
      });
    }
    if (
      budget.accessibility !== undefined &&
      results.lighthouseScores.accessibility !== undefined
    ) {
      checks.push({
        metric: "LH Accessibility",
        budget: `\u2265 ${budget.accessibility}`,
        actual: String(results.lighthouseScores.accessibility),
        passed: results.lighthouseScores.accessibility >= budget.accessibility,
      });
    }
  }

  if (budget.maxA11yViolations !== undefined && results.a11yViolations !== undefined) {
    checks.push({
      metric: "A11y violations",
      budget: `\u2264 ${budget.maxA11yViolations}`,
      actual: String(results.a11yViolations),
      passed: results.a11yViolations <= budget.maxA11yViolations,
    });
  }

  if (budget.maxVisualDiff !== undefined && results.visualDiff !== undefined) {
    checks.push({
      metric: "Visual diff %",
      budget: `\u2264 ${budget.maxVisualDiff}%`,
      actual: `${results.visualDiff}%`,
      passed: results.visualDiff <= budget.maxVisualDiff,
    });
  }

  if (budget.maxSecurityFindings !== undefined && results.securityFindings !== undefined) {
    checks.push({
      metric: "Security findings",
      budget: `\u2264 ${budget.maxSecurityFindings}`,
      actual: String(results.securityFindings),
      passed: results.securityFindings <= budget.maxSecurityFindings,
    });
  }

  return checks;
}
