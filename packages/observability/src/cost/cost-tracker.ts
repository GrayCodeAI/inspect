/**
 * Cost Tracking
 *
 * Tracks LLM and infrastructure costs with detailed attribution.
 */

import { EventEmitter } from "events";

export interface CostTrackerConfig {
  /** Track by session */
  trackBySession: boolean;
  /** Track by task */
  trackByTask: boolean;
  /** Alert threshold ($) */
  alertThreshold: number;
  /** Daily budget ($) */
  dailyBudget: number;
  /** On cost update */
  onCostUpdate?: (report: CostReport) => void;
  /** On budget alert */
  onBudgetAlert?: (alert: BudgetAlert) => void;
}

export interface CostEntry {
  id: string;
  timestamp: number;
  sessionId?: string;
  taskId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost?: number;
  outputCost?: number;
  totalCost: number;
  cached: boolean;
  metadata: Record<string, unknown>;
}

export interface CostReport {
  period: { start: number; end: number };
  totalCost: number;
  totalTokens: number;
  byProvider: Record<string, { cost: number; tokens: number }>;
  byModel: Record<string, { cost: number; tokens: number }>;
  bySession?: Record<string, number>;
  byTask?: Record<string, number>;
  trend: "up" | "down" | "stable";
  projectedDaily: number;
}

export interface BudgetAlert {
  type: "threshold" | "budget" | "anomaly";
  currentCost: number;
  limit: number;
  percentage: number;
  message: string;
}

// Provider pricing (per 1K tokens)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 0.015, output: 0.075 },
  "claude-sonnet-4-6": { input: 0.003, output: 0.015 },
  "claude-haiku-4-5": { input: 0.00025, output: 0.00125 },
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gemini-pro": { input: 0.0005, output: 0.0015 },
  "gemini-flash": { input: 0.000075, output: 0.0003 },
  "deepseek-chat": { input: 0.00014, output: 0.00028 },
};

export const DEFAULT_COST_TRACKER_CONFIG: CostTrackerConfig = {
  trackBySession: true,
  trackByTask: true,
  alertThreshold: 10,
  dailyBudget: 100,
};

export class CostTracker extends EventEmitter {
  private config: CostTrackerConfig;
  private entries: CostEntry[] = [];

  constructor(config: Partial<CostTrackerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_COST_TRACKER_CONFIG, ...config };
  }

  /**
   * Record a cost entry
   */
  record(entry: Omit<CostEntry, "id" | "timestamp" | "totalCost" | "inputCost" | "outputCost">): CostEntry {
    const pricing = PRICING[entry.model] || { input: 0, output: 0 };

    const inputCost = entry.cached
      ? 0 // Cached inputs are free
      : (entry.inputTokens / 1000) * pricing.input;

    const outputCost = (entry.outputTokens / 1000) * pricing.output;

    const fullEntry: CostEntry = {
      ...entry,
      id: `cost-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
    };

    this.entries.push(fullEntry);

    // Check thresholds
    this.checkThresholds();

    this.emit("cost:recorded", fullEntry);

    return fullEntry;
  }

  /**
   * Quick record helper
   */
  recordUsage(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    options?: { sessionId?: string; taskId?: string; cached?: boolean }
  ): CostEntry {
    return this.record({
      provider,
      model,
      inputTokens,
      outputTokens,
      cached: options?.cached || false,
      sessionId: options?.sessionId,
      taskId: options?.taskId,
      metadata: {},
    });
  }

  /**
   * Generate cost report
   */
  generateReport(since?: number): CostReport {
    const start = since || Date.now() - 86400000; // Default 24 hours
    const end = Date.now();

    const entries = this.entries.filter((e) => e.timestamp >= start);

    const totalCost = entries.reduce((sum, e) => sum + e.totalCost, 0);
    const totalTokens = entries.reduce(
      (sum, e) => sum + e.inputTokens + e.outputTokens,
      0
    );

    // Group by provider
    const byProvider: Record<string, { cost: number; tokens: number }> = {};
    for (const entry of entries) {
      const existing = byProvider[entry.provider] || { cost: 0, tokens: 0 };
      existing.cost += entry.totalCost;
      existing.tokens += entry.inputTokens + entry.outputTokens;
      byProvider[entry.provider] = existing;
    }

    // Group by model
    const byModel: Record<string, { cost: number; tokens: number }> = {};
    for (const entry of entries) {
      const existing = byModel[entry.model] || { cost: 0, tokens: 0 };
      existing.cost += entry.totalCost;
      existing.tokens += entry.inputTokens + entry.outputTokens;
      byModel[entry.model] = existing;
    }

    // Group by session
    const bySession: Record<string, number> = {};
    if (this.config.trackBySession) {
      for (const entry of entries) {
        if (entry.sessionId) {
          bySession[entry.sessionId] = (bySession[entry.sessionId] || 0) + entry.totalCost;
        }
      }
    }

    // Group by task
    const byTask: Record<string, number> = {};
    if (this.config.trackByTask) {
      for (const entry of entries) {
        if (entry.taskId) {
          byTask[entry.taskId] = (byTask[entry.taskId] || 0) + entry.totalCost;
        }
      }
    }

    // Calculate trend
    const midPoint = start + (end - start) / 2;
    const firstHalf = entries.filter((e) => e.timestamp < midPoint);
    const secondHalf = entries.filter((e) => e.timestamp >= midPoint);

    const firstCost = firstHalf.reduce((sum, e) => sum + e.totalCost, 0);
    const secondCost = secondHalf.reduce((sum, e) => sum + e.totalCost, 0);

    let trend: "up" | "down" | "stable" = "stable";
    if (firstCost > 0) {
      const change = (secondCost - firstCost) / firstCost;
      trend = change > 0.1 ? "up" : change < -0.1 ? "down" : "stable";
    }

    // Project daily cost
    const hours = (end - start) / 3600000;
    const projectedDaily = hours > 0 ? (totalCost / hours) * 24 : 0;

    const report: CostReport = {
      period: { start, end },
      totalCost,
      totalTokens,
      byProvider,
      byModel,
      bySession: this.config.trackBySession ? bySession : undefined,
      byTask: this.config.trackByTask ? byTask : undefined,
      trend,
      projectedDaily,
    };

    this.config.onCostUpdate?.(report);
    this.emit("report:generated", report);

    return report;
  }

  /**
   * Check budget thresholds
   */
  private checkThresholds(): void {
    const today = new Date().setHours(0, 0, 0, 0);
    const todayEntries = this.entries.filter((e) => e.timestamp >= today);
    const todayCost = todayEntries.reduce((sum, e) => sum + e.totalCost, 0);

    // Check alert threshold
    if (todayCost >= this.config.alertThreshold) {
      const alert: BudgetAlert = {
        type: "threshold",
        currentCost: todayCost,
        limit: this.config.alertThreshold,
        percentage: (todayCost / this.config.alertThreshold) * 100,
        message: `Daily cost threshold reached: $${todayCost.toFixed(2)}`,
      };

      this.config.onBudgetAlert?.(alert);
      this.emit("budget:alert", alert);
    }

    // Check daily budget
    if (todayCost >= this.config.dailyBudget) {
      const alert: BudgetAlert = {
        type: "budget",
        currentCost: todayCost,
        limit: this.config.dailyBudget,
        percentage: (todayCost / this.config.dailyBudget) * 100,
        message: `Daily budget exceeded: $${todayCost.toFixed(2)} / $${this.config.dailyBudget}`,
      };

      this.config.onBudgetAlert?.(alert);
      this.emit("budget:alert", alert);
    }
  }

  /**
   * Get total cost
   */
  getTotalCost(since?: number): number {
    const entries = since
      ? this.entries.filter((e) => e.timestamp >= since)
      : this.entries;
    return entries.reduce((sum, e) => sum + e.totalCost, 0);
  }

  /**
   * Get cost for session
   */
  getSessionCost(sessionId: string): number {
    return this.entries
      .filter((e) => e.sessionId === sessionId)
      .reduce((sum, e) => sum + e.totalCost, 0);
  }

  /**
   * Clear old entries
   */
  cleanup(olderThan: number): number {
    const cutoff = Date.now() - olderThan;
    const initialLength = this.entries.length;
    this.entries = this.entries.filter((e) => e.timestamp >= cutoff);
    return initialLength - this.entries.length;
  }
}

export function createCostTracker(config?: Partial<CostTrackerConfig>): CostTracker {
  return new CostTracker(config);
}
