/**
 * Guardrails Framework
 *
 * Safety controls for agent actions including rate limits,
 * content filtering, action whitelisting, and intervention points.
 */

import { EventEmitter } from "events";

export interface GuardrailsConfig {
  /** Rate limit: max actions per minute */
  maxActionsPerMinute: number;
  /** Rate limit: max tokens per request */
  maxTokensPerRequest: number;
  /** Max cost per session ($) */
  maxCostPerSession: number;
  /** Max execution time (ms) */
  maxExecutionTime: number;
  /** Allowed domains (empty = all) */
  allowedDomains: string[];
  /** Blocked domains */
  blockedDomains: string[];
  /** Allowed actions */
  allowedActions: string[];
  /** Require human confirmation for risky actions */
  confirmRiskyActions: boolean;
  /** Risky action patterns */
  riskyPatterns: RiskyPattern[];
  /** Content filters */
  contentFilters: ContentFilter[];
  /** On violation handler */
  onViolation?: (violation: Violation) => Promise<ViolationAction>;
  /** On intervention request */
  onIntervention?: (context: InterventionContext) => Promise<boolean>;
}

export interface RiskyPattern {
  name: string;
  pattern: RegExp | string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
}

export interface ContentFilter {
  type: "prompt" | "response" | "action";
  blocklist: string[];
  allowlist?: string[];
}

export interface Violation {
  type: ViolationType;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  context: Record<string, unknown>;
  timestamp: number;
}

export type ViolationType =
  | "rate_limit"
  | "domain"
  | "action"
  | "content"
  | "cost"
  | "time"
  | "security";

export type ViolationAction = "allow" | "block" | "warn" | "confirm";

export interface InterventionContext {
  action: string;
  params: Record<string, unknown>;
  riskLevel: "low" | "medium" | "high";
  reason: string;
}

export interface ActionRequest {
  action: string;
  params: Record<string, unknown>;
  estimatedCost?: number;
  estimatedTokens?: number;
}

export interface GuardrailsDecision {
  allowed: boolean;
  action: "allow" | "block" | "confirm" | "warn";
  reason?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  warnings?: string[];
}

export interface SessionStats {
  sessionId: string;
  startTime: number;
  actionsCount: number;
  totalCost: number;
  totalTokens: number;
  violations: Violation[];
  blockedRequests: number;
  confirmedRequests: number;
}

export const DEFAULT_GUARDRAILS_CONFIG: GuardrailsConfig = {
  maxActionsPerMinute: 30,
  maxTokensPerRequest: 100000,
  maxCostPerSession: 10,
  maxExecutionTime: 600000, // 10 minutes
  allowedDomains: [],
  blockedDomains: [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "[::1]",
    "file://",
  ],
  allowedActions: [],
  confirmRiskyActions: true,
  riskyPatterns: [
    {
      name: "delete",
      pattern: /delete|remove|clear.*all|drop/i,
      severity: "high",
      description: "Destructive action detected",
    },
    {
      name: "payment",
      pattern: /purchase|buy|pay|checkout|credit.?card/i,
      severity: "critical",
      description: "Payment action detected",
    },
    {
      name: "password",
      pattern: /password|secret|key|token|credential/i,
      severity: "high",
      description: "Sensitive data handling",
    },
    {
      name: "admin",
      pattern: /admin|settings|configuration|permission/i,
      severity: "medium",
      description: "Administrative action detected",
    },
  ],
  contentFilters: [
    {
      type: "prompt",
      blocklist: [
        "ignore previous instructions",
        "disregard safety",
        "DAN mode",
        "jailbreak",
      ],
    },
  ],
};

/**
 * Guardrails Framework
 *
 * Provides comprehensive safety controls for agent execution.
 */
export class GuardrailsFramework extends EventEmitter {
  private config: GuardrailsConfig;
  private sessionStats: Map<string, SessionStats> = new Map();
  private actionTimestamps: Map<string, number[]> = new Map();
  private blockedDomainsSet: Set<string>;
  private allowedDomainsSet: Set<string>;

  constructor(config: Partial<GuardrailsConfig> = {}) {
    super();
    this.config = { ...DEFAULT_GUARDRAILS_CONFIG, ...config };
    this.blockedDomainsSet = new Set(this.config.blockedDomains);
    this.allowedDomainsSet = new Set(this.config.allowedDomains);
  }

  /**
   * Initialize a new session
   */
  initializeSession(sessionId: string): SessionStats {
    const stats: SessionStats = {
      sessionId,
      startTime: Date.now(),
      actionsCount: 0,
      totalCost: 0,
      totalTokens: 0,
      violations: [],
      blockedRequests: 0,
      confirmedRequests: 0,
    };

    this.sessionStats.set(sessionId, stats);
    this.actionTimestamps.set(sessionId, []);

    return stats;
  }

  /**
   * Evaluate action against guardrails
   */
  async evaluateAction(
    sessionId: string,
    request: ActionRequest
  ): Promise<GuardrailsDecision> {
    const violations: Violation[] = [];
    const warnings: string[] = [];

    // Check rate limit
    const rateViolation = this.checkRateLimit(sessionId);
    if (rateViolation) {
      violations.push(rateViolation);
    }

    // Check domain restrictions
    const domainViolation = this.checkDomain(request.params.url as string);
    if (domainViolation) {
      violations.push(domainViolation);
    }

    // Check action whitelist
    const actionViolation = this.checkAction(request.action);
    if (actionViolation) {
      violations.push(actionViolation);
    }

    // Check cost limit
    const costViolation = this.checkCost(sessionId, request.estimatedCost || 0);
    if (costViolation) {
      violations.push(costViolation);
    }

    // Check risky patterns
    const { violations: riskViolations, warnings: riskWarnings } =
      this.checkRiskyPatterns(request);
    violations.push(...riskViolations);
    warnings.push(...riskWarnings);

    // Check execution time
    const timeViolation = this.checkExecutionTime(sessionId);
    if (timeViolation) {
      violations.push(timeViolation);
    }

    // Sort violations by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    violations.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );

    // Handle violations
    if (violations.length > 0) {
      const critical = violations.find((v) => v.severity === "critical");
      if (critical) {
        return this.handleViolation(sessionId, critical, violations, warnings);
      }

      const high = violations.find((v) => v.severity === "high");
      if (high && this.config.confirmRiskyActions) {
        return this.handleViolation(sessionId, high, violations, warnings);
      }
    }

    // Update stats
    this.updateStats(sessionId, request);

    return {
      allowed: true,
      action: "allow",
      warnings: warnings.length > 0 ? warnings : undefined,
      riskLevel: violations.length > 0 ? violations[0].severity : "low",
    };
  }

  /**
   * Check rate limit
   */
  private checkRateLimit(sessionId: string): Violation | null {
    const timestamps = this.actionTimestamps.get(sessionId);
    if (!timestamps) return null;

    const oneMinuteAgo = Date.now() - 60000;
    const recentActions = timestamps.filter((t) => t > oneMinuteAgo);

    if (recentActions.length >= this.config.maxActionsPerMinute) {
      return {
        type: "rate_limit",
        severity: "medium",
        message: `Rate limit exceeded: ${recentActions.length} actions in the last minute`,
        context: { recentActions: recentActions.length },
        timestamp: Date.now(),
      };
    }

    return null;
  }

  /**
   * Check domain restrictions
   */
  private checkDomain(url?: string): Violation | null {
    if (!url) return null;

    try {
      const domain = new URL(url).hostname;

      // Check blocked domains
      if (this.blockedDomainsSet.has(domain)) {
        return {
          type: "domain",
          severity: "high",
          message: `Domain ${domain} is blocked`,
          context: { domain, url },
          timestamp: Date.now(),
        };
      }

      // Check allowed domains (if whitelist is defined)
      if (
        this.allowedDomainsSet.size > 0 &&
        !this.allowedDomainsSet.has(domain)
      ) {
        return {
          type: "domain",
          severity: "high",
          message: `Domain ${domain} is not in allowed list`,
          context: { domain, url },
          timestamp: Date.now(),
        };
      }
    } catch {
      // Invalid URL
    }

    return null;
  }

  /**
   * Check action whitelist
   */
  private checkAction(action: string): Violation | null {
    if (this.config.allowedActions.length === 0) return null;

    if (!this.config.allowedActions.includes(action)) {
      return {
        type: "action",
        severity: "high",
        message: `Action ${action} is not allowed`,
        context: { action },
        timestamp: Date.now(),
      };
    }

    return null;
  }

  /**
   * Check cost limit
   */
  private checkCost(sessionId: string, estimatedCost: number): Violation | null {
    const stats = this.sessionStats.get(sessionId);
    if (!stats) return null;

    const projectedCost = stats.totalCost + estimatedCost;

    if (projectedCost > this.config.maxCostPerSession) {
      return {
        type: "cost",
        severity: "high",
        message: `Cost limit would be exceeded: $${projectedCost.toFixed(2)} > $${this.config.maxCostPerSession}`,
        context: { projectedCost, limit: this.config.maxCostPerSession },
        timestamp: Date.now(),
      };
    }

    return null;
  }

  /**
   * Check for risky patterns
   */
  private checkRiskyPatterns(request: ActionRequest): {
    violations: Violation[];
    warnings: string[];
  } {
    const violations: Violation[] = [];
    const warnings: string[] = [];

    const textToCheck = JSON.stringify(request).toLowerCase();

    for (const pattern of this.config.riskyPatterns) {
      const regex =
        pattern.pattern instanceof RegExp
          ? pattern.pattern
          : new RegExp(pattern.pattern, "i");

      if (regex.test(textToCheck)) {
        if (pattern.severity === "critical" || pattern.severity === "high") {
          violations.push({
            type: "security",
            severity: pattern.severity,
            message: pattern.description,
            context: { pattern: pattern.name, action: request.action },
            timestamp: Date.now(),
          });
        } else {
          warnings.push(pattern.description);
        }
      }
    }

    return { violations, warnings };
  }

  /**
   * Check execution time limit
   */
  private checkExecutionTime(sessionId: string): Violation | null {
    const stats = this.sessionStats.get(sessionId);
    if (!stats) return null;

    const elapsed = Date.now() - stats.startTime;

    if (elapsed > this.config.maxExecutionTime) {
      return {
        type: "time",
        severity: "high",
        message: `Execution time limit exceeded: ${elapsed}ms > ${this.config.maxExecutionTime}ms`,
        context: { elapsed, limit: this.config.maxExecutionTime },
        timestamp: Date.now(),
      };
    }

    return null;
  }

  /**
   * Handle violation
   */
  private async handleViolation(
    sessionId: string,
    primary: Violation,
    all: Violation[],
    warnings: string[]
  ): Promise<GuardrailsDecision> {
    const stats = this.sessionStats.get(sessionId);
    if (stats) {
      stats.violations.push(...all);
      stats.blockedRequests++;
    }

    // Call custom handler if configured
    if (this.config.onViolation) {
      const action = await this.config.onViolation(primary);

      if (action === "allow") {
        return {
          allowed: true,
          action: "allow",
          warnings: [`Override: ${primary.message}`, ...warnings],
          riskLevel: primary.severity,
        };
      }

      if (action === "warn") {
        return {
          allowed: true,
          action: "warn",
          warnings: [primary.message, ...warnings],
          riskLevel: primary.severity,
        };
      }

      if (action === "confirm") {
        return {
          allowed: false,
          action: "confirm",
          reason: primary.message,
          riskLevel: primary.severity,
          warnings,
        };
      }
    }

    // Default behavior based on severity
    if (primary.severity === "critical") {
      return {
        allowed: false,
        action: "block",
        reason: primary.message,
        riskLevel: "high",
        warnings,
      };
    }

    if (primary.severity === "high" && this.config.confirmRiskyActions) {
      return {
        allowed: false,
        action: "confirm",
        reason: primary.message,
        riskLevel: "high",
        warnings,
      };
    }

    return {
      allowed: false,
      action: "block",
      reason: primary.message,
      riskLevel: primary.severity,
      warnings,
    };
  }

  /**
   * Update session stats
   */
  private updateStats(sessionId: string, request: ActionRequest): void {
    const stats = this.sessionStats.get(sessionId);
    const timestamps = this.actionTimestamps.get(sessionId);

    if (stats) {
      stats.actionsCount++;
      stats.totalCost += request.estimatedCost || 0;
      stats.totalTokens += request.estimatedTokens || 0;
    }

    if (timestamps) {
      timestamps.push(Date.now());
    }
  }

  /**
   * Request human confirmation
   */
  async requestConfirmation(
    context: InterventionContext
  ): Promise<boolean> {
    if (this.config.onIntervention) {
      return this.config.onIntervention(context);
    }

    // Default: deny
    return false;
  }

  /**
   * Filter content
   */
  filterContent(type: "prompt" | "response" | "action", content: string): {
    allowed: boolean;
    filtered: string;
    matchedFilters: string[];
  } {
    const filters = this.config.contentFilters.filter((f) => f.type === type);
    const matchedFilters: string[] = [];
    let filtered = content;

    for (const filter of filters) {
      for (const blocked of filter.blocklist) {
        if (content.toLowerCase().includes(blocked.toLowerCase())) {
          matchedFilters.push(blocked);
        }
      }
    }

    // Replace blocked terms
    if (matchedFilters.length > 0) {
      for (const term of matchedFilters) {
        filtered = filtered.replace(new RegExp(term, "gi"), "[FILTERED]");
      }
    }

    return {
      allowed: matchedFilters.length === 0,
      filtered,
      matchedFilters,
    };
  }

  /**
   * Get session stats
   */
  getSessionStats(sessionId: string): SessionStats | undefined {
    return this.sessionStats.get(sessionId);
  }

  /**
   * Get all sessions stats
   */
  getAllStats(): SessionStats[] {
    return Array.from(this.sessionStats.values());
  }

  /**
   * End session
   */
  endSession(sessionId: string): SessionStats | undefined {
    const stats = this.sessionStats.get(sessionId);
    if (stats) {
      this.sessionStats.delete(sessionId);
      this.actionTimestamps.delete(sessionId);
      this.emit("session:ended", stats);
    }
    return stats;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GuardrailsConfig>): void {
    this.config = { ...this.config, ...config };
    this.blockedDomainsSet = new Set(this.config.blockedDomains);
    this.allowedDomainsSet = new Set(this.config.allowedDomains);
  }
}

/**
 * Convenience function
 */
export function createGuardrails(
  config?: Partial<GuardrailsConfig>
): GuardrailsFramework {
  return new GuardrailsFramework(config);
}
