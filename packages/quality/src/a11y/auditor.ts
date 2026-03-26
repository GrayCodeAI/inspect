// ============================================================================
// @inspect/quality - Accessibility Auditor
// ============================================================================

import type {
  A11yReport,
  A11yViolation,
  A11yViolationNode,
  A11yCheckResult,
  A11yImpact,
} from "@inspect/shared";
import { createTimer, generateId } from "@inspect/shared";
import { ALL_A11Y_RULES, type A11yRuleDefinition } from "./rules.js";

/** Page-like interface (Playwright Page compatible) */
interface PageHandle {
  url(): string;
  evaluate<R>(fn: string | ((...args: unknown[]) => R), ...args: unknown[]): Promise<R>;
  addScriptTag(options: { url?: string; content?: string }): Promise<void>;
  waitForFunction(fn: string | (() => boolean), options?: { timeout?: number }): Promise<void>;
}

/** Options for accessibility audit */
export interface A11yAuditOptions {
  /** WCAG standard to audit against */
  standard?: "wcag2a" | "wcag2aa" | "wcag2aaa" | "wcag21aa" | "wcag22aa" | "section508";
  /** Specific axe-core rule tags to include */
  tags?: string[];
  /** Specific rule IDs to include */
  rules?: string[];
  /** Rule IDs to disable */
  disableRules?: string[];
  /** CSS selector to scope the audit to */
  context?: string;
  /** Custom rules to add */
  customRules?: A11yRuleDefinition[];
  /** axe-core CDN URL override */
  axeCdnUrl?: string;
  /** Locale for axe-core messages */
  locale?: string;
  /** Timeout for axe analysis in ms */
  timeout?: number;
  /** Whether to include passes in the report */
  includePasses?: boolean;
  /** Whether to include incomplete results */
  includeIncomplete?: boolean;
  /** Whether to include inapplicable results */
  includeInapplicable?: boolean;
}

/** Supported locales for axe-core */
const SUPPORTED_LOCALES = [
  "da", "de", "el", "es", "eu", "fr", "he", "it",
  "ja", "ko", "nl", "no_NB", "pl", "pt_BR", "zh_CN", "zh_TW",
] as const;

const DEFAULT_AXE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js";
const DEFAULT_TIMEOUT = 30_000;

/**
 * AccessibilityAuditor injects axe-core into a page and runs
 * WCAG-based accessibility audits with scoring.
 */
export class AccessibilityAuditor {
  private readonly axeCdnUrl: string;

  constructor(options?: { axeCdnUrl?: string }) {
    this.axeCdnUrl = options?.axeCdnUrl ?? DEFAULT_AXE_CDN;
  }

  /**
   * Run an accessibility audit on a page.
   * Injects axe-core via CDN and executes axe.run() with the given options.
   */
  async audit(page: PageHandle, options: A11yAuditOptions = {}): Promise<A11yReport> {
    const timer = createTimer();
    const url = page.url();
    const standard = options.standard ?? "wcag2aa";
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    // Inject axe-core into the page
    await this.injectAxe(page, options.locale);

    // Build axe configuration
    const axeConfig = this.buildAxeConfig(options);

    // Run axe-core
    const rawResults = await Promise.race([
      page.evaluate(`
        (function() {
          var config = ${JSON.stringify(axeConfig)};
          var context = ${options.context ? JSON.stringify(options.context) : "document"};
          return new Promise(function(resolve, reject) {
            window.axe.run(context, config).then(resolve).catch(reject);
          });
        })()
      `) as Promise<AxeRawResults>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`axe-core audit timed out after ${timeout}ms`)), timeout)
      ),
    ]);

    // Transform results
    const violations = this.transformResults(rawResults.violations ?? []);
    const passes = options.includePasses !== false
      ? this.transformResults(rawResults.passes ?? [])
      : [];
    const incomplete = options.includeIncomplete !== false
      ? this.transformResults(rawResults.incomplete ?? [])
      : [];
    const inapplicable = options.includeInapplicable !== false
      ? this.transformResults(rawResults.inapplicable ?? [])
      : [];

    // Calculate score
    const score = this.calculateScore(violations, passes);

    // Get test environment
    const testEnv = await page.evaluate(`
      (function() {
        return {
          userAgent: navigator.userAgent,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          orientation: screen.orientation ? screen.orientation.type : undefined
        };
      })()
    `) as { userAgent: string; windowWidth: number; windowHeight: number; orientation?: string };

    return {
      violations,
      passes,
      incomplete,
      inapplicable,
      score,
      standard,
      testEnvironment: testEnv,
      timestamp: Date.now(),
      url,
    };
  }

  /**
   * Quick audit meant to be called after each test step.
   * Only returns violations, no passes/incomplete/inapplicable.
   */
  async auditAfterStep(page: PageHandle): Promise<A11yReport> {
    return this.audit(page, {
      includePasses: false,
      includeIncomplete: false,
      includeInapplicable: false,
      standard: "wcag2aa",
    });
  }

  /**
   * Audit multiple URLs in sequence (for sitemap-based auditing).
   * Delegates to SitemapAuditor for parallel execution.
   */
  async auditSitemap(
    urls: string[],
    page: PageHandle,
    options: A11yAuditOptions = {},
  ): Promise<Map<string, A11yReport>> {
    const results = new Map<string, A11yReport>();

    for (const url of urls) {
      try {
        // Navigate to URL - use evaluate to trigger navigation
        await page.evaluate(`window.location.href = ${JSON.stringify(url)}`);
        // Wait for load
        await page.waitForFunction(`document.readyState === 'complete'`, { timeout: 30_000 });
        const report = await this.audit(page, options);
        results.set(url, report);
      } catch (error) {
        // Create an error report for this URL
        results.set(url, {
          violations: [],
          passes: [],
          incomplete: [],
          inapplicable: [],
          score: 0,
          standard: options.standard ?? "wcag2aa",
          timestamp: Date.now(),
          url,
        });
      }
    }

    return results;
  }

  /**
   * Inject axe-core script into the page.
   */
  private async injectAxe(page: PageHandle, locale?: string): Promise<void> {
    // Check if axe is already loaded
    const hasAxe = await page.evaluate(`typeof window.axe !== 'undefined'`) as boolean;
    if (hasAxe) return;

    // Inject axe-core via CDN
    await page.addScriptTag({ url: this.axeCdnUrl });

    // Wait for axe to be available
    await page.waitForFunction(`typeof window.axe !== 'undefined'`, { timeout: 10_000 });

    // Apply locale if specified and supported
    if (locale && SUPPORTED_LOCALES.includes(locale as typeof SUPPORTED_LOCALES[number])) {
      const localeUrl = this.axeCdnUrl.replace("axe.min.js", `locales/${locale}.json`);
      try {
        await page.evaluate(`
          (async function() {
            try {
              var resp = await fetch(${JSON.stringify(localeUrl)});
              var localeData = await resp.json();
              window.axe.configure({ locale: localeData });
            } catch(e) {
              console.warn('Failed to load axe-core locale:', e.message);
            }
          })()
        `);
      } catch {
        // Silently continue without locale
      }
    }
  }

  /**
   * Build the axe-core configuration object from audit options.
   */
  private buildAxeConfig(options: A11yAuditOptions): AxeConfig {
    const config: AxeConfig = {
      runOnly: undefined,
      rules: {},
      resultTypes: ["violations"],
    };

    // Add result types based on include flags
    if (options.includePasses !== false) config.resultTypes!.push("passes");
    if (options.includeIncomplete !== false) config.resultTypes!.push("incomplete");
    if (options.includeInapplicable !== false) config.resultTypes!.push("inapplicable");

    // Set runOnly based on standard/tags
    if (options.tags && options.tags.length > 0) {
      config.runOnly = { type: "tag", values: options.tags };
    } else if (options.rules && options.rules.length > 0) {
      config.runOnly = { type: "rule", values: options.rules };
    } else if (options.standard) {
      const tagMap: Record<string, string[]> = {
        wcag2a: ["wcag2a", "wcag21a"],
        wcag2aa: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        wcag2aaa: ["wcag2a", "wcag2aa", "wcag2aaa", "wcag21a", "wcag21aa", "wcag21aaa"],
        wcag21aa: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        wcag22aa: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        section508: ["section508"],
      };
      const tags = tagMap[options.standard] ?? ["wcag2a", "wcag2aa"];
      config.runOnly = { type: "tag", values: tags };
    }

    // Disable specific rules
    if (options.disableRules) {
      for (const ruleId of options.disableRules) {
        config.rules![ruleId] = { enabled: false };
      }
    }

    return config;
  }

  /**
   * Transform raw axe-core results into our A11yViolation format.
   */
  private transformResults(rawItems: AxeRawViolation[]): A11yViolation[] {
    return rawItems.map((item) => ({
      id: item.id,
      impact: (item.impact as A11yImpact) ?? "minor",
      description: item.description,
      help: item.help,
      helpUrl: item.helpUrl,
      tags: item.tags,
      nodes: (item.nodes ?? []).map((node): A11yViolationNode => ({
        html: node.html,
        target: node.target ?? [],
        xpath: node.xpath?.[0],
        ancestry: node.ancestry,
        failureSummary: node.failureSummary ?? "",
        any: (node.any ?? []) as A11yCheckResult[],
        all: (node.all ?? []) as A11yCheckResult[],
        none: (node.none ?? []) as A11yCheckResult[],
      })),
    }));
  }

  /**
   * Calculate an accessibility score (0-100) based on violations and passes.
   * Higher impact violations reduce the score more.
   */
  private calculateScore(violations: A11yViolation[], passes: A11yViolation[]): number {
    if (violations.length === 0 && passes.length === 0) return 100;
    if (violations.length === 0) return 100;

    const impactWeights: Record<A11yImpact, number> = {
      critical: 10,
      serious: 7,
      moderate: 4,
      minor: 1,
    };

    let totalDeductions = 0;
    for (const violation of violations) {
      const weight = impactWeights[violation.impact] ?? 1;
      const nodeCount = Math.min(violation.nodes.length, 10); // Cap impact per rule
      totalDeductions += weight * nodeCount;
    }

    const totalRules = violations.length + passes.length;
    const maxPossibleDeductions = totalRules * 10 * 10;
    const normalizedDeduction = Math.min(totalDeductions / Math.max(maxPossibleDeductions, 1), 1);

    return Math.round(Math.max(0, (1 - normalizedDeduction) * 100));
  }
}

// ---------------------------------------------------------------------------
// Internal axe-core type interfaces
// ---------------------------------------------------------------------------

interface AxeConfig {
  runOnly?: { type: "tag" | "rule"; values: string[] };
  rules?: Record<string, { enabled: boolean }>;
  resultTypes?: string[];
}

interface AxeRawResults {
  violations?: AxeRawViolation[];
  passes?: AxeRawViolation[];
  incomplete?: AxeRawViolation[];
  inapplicable?: AxeRawViolation[];
}

interface AxeRawViolation {
  id: string;
  impact?: string;
  description: string;
  help: string;
  helpUrl?: string;
  tags: string[];
  nodes: AxeRawNode[];
}

interface AxeRawNode {
  html: string;
  target?: string[];
  xpath?: string[];
  ancestry?: string[];
  failureSummary?: string;
  any?: Array<{ id: string; data?: unknown; relatedNodes?: unknown[]; impact?: A11yImpact; message: string }>;
  all?: Array<{ id: string; data?: unknown; relatedNodes?: unknown[]; impact?: A11yImpact; message: string }>;
  none?: Array<{ id: string; data?: unknown; relatedNodes?: unknown[]; impact?: A11yImpact; message: string }>;
}
