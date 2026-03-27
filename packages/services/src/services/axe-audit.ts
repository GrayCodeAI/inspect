// ──────────────────────────────────────────────────────────────────────────────
// packages/services/src/services/axe-audit.ts - axe-core Deep Integration Service
// ──────────────────────────────────────────────────────────────────────────────

/** WCAG 2.2 rule definition */
export interface AxeRule {
  id: string;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  impact: "minor" | "moderate" | "serious" | "critical";
  enabled: boolean;
}

/** axe-core audit result */
export interface AxeResult {
  violations: AxeViolation[];
  passes: AxePass[];
  incomplete: AxeViolation[];
  inapplicable: AxeRule[];
  timestamp: number;
  url: string;
}

/** Accessibility violation */
export interface AxeViolation {
  id: string;
  description: string;
  help: string;
  helpUrl: string;
  impact: "minor" | "moderate" | "serious" | "critical";
  tags: string[];
  nodes: AxeNode[];
}

/** Accessibility pass */
export interface AxePass {
  id: string;
  description: string;
  nodes: number;
}

/** Affected DOM node */
export interface AxeNode {
  html: string;
  target: string[];
  failureSummary: string;
  element?: string;
}

/** axe-core CDN script for injection */
const AXE_CDN_SCRIPT = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js";

/**
 * axe-core Deep Integration Service.
 * Embeds axe-core via CDN for full WCAG 2.2 rule evaluation with iframe support.
 *
 * Usage:
 * ```ts
 * const service = new AxeAuditService();
 * const results = await service.runAudit(page);
 * ```
 */
export class AxeAuditService {
  private config: AxeAuditConfig;

  constructor(config: Partial<AxeAuditConfig> = {}) {
    this.config = {
      wcagLevel: config.wcagLevel ?? "AA",
      runOnly: config.runOnly ?? ["wcag2a", "wcag2aa", "wcag22aa"],
      iframes: config.iframes ?? true,
      shadowDom: config.shadowDom ?? true,
      rules: config.rules ?? {},
      reporter: config.reporter ?? "v2",
    };
  }

  /**
   * Get the axe-core injection script.
   */
  getInjectionScript(): string {
    return `
      (async function() {
        if (typeof axe === 'undefined') {
          const script = document.createElement('script');
          script.src = '${AXE_CDN_SCRIPT}';
          document.head.appendChild(script);
          await new Promise((resolve) => { script.onload = resolve; });
        }
        return true;
      })();
    `;
  }

  /**
   * Get the audit execution script.
   */
  getAuditScript(): string {
    const runOnly = JSON.stringify(this.config.runOnly);
    return `
      (async function() {
        if (typeof axe === 'undefined') return { error: 'axe-core not loaded' };
        const results = await axe.run(document, {
          runOnly: ${runOnly},
          resultTypes: ['violations', 'passes', 'incomplete'],
          elementRef: true,
        });
        return JSON.parse(JSON.stringify(results));
      })();
    `;
  }

  /**
   * Get iframe audit script for cross-frame evaluation.
   */
  getIframeAuditScript(): string {
    return `
      (async function() {
        if (typeof axe === 'undefined') return { error: 'axe-core not loaded' };
        const results = await axe.run(document, {
          iframes: true,
          elementRef: true,
        });
        return JSON.parse(JSON.stringify(results));
      })();
    `;
  }

  /**
   * Build axe-core configuration for a specific WCAG level.
   */
  static buildConfig(level: "A" | "AA" | "AAA"): Record<string, unknown> {
    const tags = [`wcag2${level.toLowerCase()}`];
    if (level === "AAA") {
      tags.push("wcag2aaa", "wcag22aaa");
    } else if (level === "AA") {
      tags.push("wcag22aa");
    }
    return {
      runOnly: { type: "tag", values: tags },
      resultTypes: ["violations", "passes", "incomplete"],
      elementRef: true,
    };
  }

  /**
   * Get WCAG 2.2 specific rules.
   */
  static getWCAG22Rules(): AxeRule[] {
    return [
      {
        id: "target-size",
        description: "Ensure interactive elements are at least 24x24 CSS pixels",
        help: "Targets must be large enough",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.9/target-size",
        tags: ["wcag22aa", "cat.sensory"],
        impact: "serious",
        enabled: true,
      },
      {
        id: "focus-not-obscured-minimum",
        description: "Ensure focused elements are not entirely hidden",
        help: "Focused elements must be visible",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.9/focus-not-obscured-minimum",
        tags: ["wcag22aa", "cat.keyboard"],
        impact: "serious",
        enabled: true,
      },
      {
        id: "focus-not-obscured-enhanced",
        description: "Ensure focused elements are not hidden at all",
        help: "Focused elements fully visible",
        helpUrl: "",
        tags: ["wcag22aaa", "cat.keyboard"],
        impact: "moderate",
        enabled: false,
      },
      {
        id: "dragging-movements",
        description: "Ensure drag operations have keyboard alternatives",
        help: "Dragging must have alternatives",
        helpUrl: "",
        tags: ["wcag22aa", "cat.keyboard"],
        impact: "serious",
        enabled: true,
      },
      {
        id: "consistent-help",
        description: "Ensure help mechanisms are in consistent locations",
        help: "Help must be consistent",
        helpUrl: "",
        tags: ["wcag22a", "cat.structure"],
        impact: "moderate",
        enabled: true,
      },
      {
        id: "redundant-entry",
        description: "Ensure previously entered information is not re-requested",
        help: "Avoid redundant data entry",
        helpUrl: "",
        tags: ["wcag22a", "cat.cognitive"],
        impact: "moderate",
        enabled: true,
      },
      {
        id: "accessible-authentication-minimum",
        description: "Ensure cognitive tests are not sole auth method",
        help: "Auth must not rely on cognitive function",
        helpUrl: "",
        tags: ["wcag22aa", "cat.cognitive"],
        impact: "serious",
        enabled: true,
      },
    ];
  }

  /**
   * Analyze results and produce a summary.
   */
  static analyzeResults(results: AxeResult): AxeAnalysis {
    const critical = results.violations.filter((v) => v.impact === "critical");
    const serious = results.violations.filter((v) => v.impact === "serious");
    const moderate = results.violations.filter((v) => v.impact === "moderate");
    const minor = results.violations.filter((v) => v.impact === "minor");

    const totalNodes = results.violations.reduce((sum, v) => sum + v.nodes.length, 0);
    const passedRules = results.passes.length;
    const failedRules = results.violations.length;
    const totalRules = passedRules + failedRules;

    return {
      score: totalRules > 0 ? (passedRules / totalRules) * 100 : 100,
      violations: {
        total: results.violations.length,
        critical: critical.length,
        serious: serious.length,
        moderate: moderate.length,
        minor: minor.length,
        affectedNodes: totalNodes,
      },
      passes: passedRules,
      incomplete: results.incomplete.length,
      wcag22Violations: results.violations.filter((v) => v.tags.some((t) => t.includes("wcag22"))),
      topIssues: critical.concat(serious).slice(0, 5),
    };
  }
}

/** axe-core audit configuration */
export interface AxeAuditConfig {
  wcagLevel: "A" | "AA" | "AAA";
  runOnly: string[];
  iframes: boolean;
  shadowDom: boolean;
  rules: Record<string, { enabled: boolean }>;
  reporter: "v1" | "v2" | "raw";
}

/** axe-core analysis result */
export interface AxeAnalysis {
  score: number;
  violations: {
    total: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    affectedNodes: number;
  };
  passes: number;
  incomplete: number;
  wcag22Violations: AxeViolation[];
  topIssues: AxeViolation[];
}
