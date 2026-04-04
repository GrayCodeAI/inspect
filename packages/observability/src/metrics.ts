// ──────────────────────────────────────────────────────────────────────────────
// @inspect/observability - Token Usage & Cost Metrics
// ──────────────────────────────────────────────────────────────────────────────

import type { TokenMetrics, FunctionMetrics, ModelDefinition } from "@inspect/shared";
import { SUPPORTED_MODELS } from "@inspect/shared";

/** Function types that consume tokens */
export type MetricFunction = "act" | "extract" | "observe" | "agent";

/** A single recorded metric entry */
export interface MetricEntry {
  /** Which function produced this usage */
  fn: MetricFunction;
  /** Model used */
  model: string;
  /** Prompt/input tokens */
  promptTokens: number;
  /** Completion/output tokens */
  completionTokens: number;
  /** Reasoning/thinking tokens */
  reasoningTokens: number;
  /** Tokens served from cache */
  cachedInputTokens: number;
  /** Inference time in milliseconds */
  inferenceTimeMs: number;
  /** Calculated cost in USD */
  cost: number;
  /** Timestamp of the recording */
  timestamp: number;
}

/** Timer for measuring durations */
export interface DurationTimer {
  /** Stop the timer and return elapsed milliseconds */
  stop(): number;
  /** Get current elapsed time without stopping */
  elapsed(): number;
}

/**
 * MetricsCollector tracks LLM token usage, costs, and inference times
 * across different functions (act, extract, observe, agent).
 * Provides per-function breakdowns and aggregate totals.
 */
export class MetricsCollector {
  private entries: MetricEntry[] = [];
  private modelDefinitions: Record<string, ModelDefinition>;

  constructor(options?: {
    /** Custom model definitions (merged with built-in SUPPORTED_MODELS) */
    models?: Record<string, ModelDefinition>;
  }) {
    this.modelDefinitions = {
      ...SUPPORTED_MODELS,
      ...(options?.models ?? {}),
    };
  }

  /**
   * Record token usage for a function call.
   *
   * @param fn - The function that consumed tokens
   * @param model - Model identifier
   * @param usage - Token usage data
   */
  track(
    fn: MetricFunction,
    model: string,
    usage: {
      promptTokens: number;
      completionTokens: number;
      reasoningTokens?: number;
      cachedInputTokens?: number;
      inferenceTimeMs?: number;
    },
  ): MetricEntry {
    const cost = this.calculateCost(model, usage);

    const entry: MetricEntry = {
      fn,
      model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      reasoningTokens: usage.reasoningTokens ?? 0,
      cachedInputTokens: usage.cachedInputTokens ?? 0,
      inferenceTimeMs: usage.inferenceTimeMs ?? 0,
      cost,
      timestamp: Date.now(),
    };

    this.entries.push(entry);
    return entry;
  }

  /**
   * Calculate the cost in USD for a given model and token usage.
   */
  calculateCost(
    model: string,
    usage: {
      promptTokens: number;
      completionTokens: number;
      cachedInputTokens?: number;
    },
  ): number {
    const modelDef = this.findModel(model);
    if (!modelDef) return 0;

    const effectiveInputTokens = usage.promptTokens - (usage.cachedInputTokens ?? 0);
    // Cached tokens are typically 90% cheaper (10% of normal cost)
    const cachedCost = ((usage.cachedInputTokens ?? 0) / 1000) * modelDef.costPer1kInput * 0.1;
    const inputCost = (effectiveInputTokens / 1000) * modelDef.costPer1kInput;
    const outputCost = (usage.completionTokens / 1000) * modelDef.costPer1kOutput;

    return inputCost + cachedCost + outputCost;
  }

  /**
   * Get aggregate totals across all functions.
   */
  getTotal(): TokenMetrics {
    return this.aggregate(this.entries);
  }

  /**
   * Get per-function token usage breakdown.
   */
  getPerFunction(): FunctionMetrics {
    const emptyMetrics = (): TokenMetrics => ({
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      inferenceTimeMs: 0,
      cost: 0,
    });

    const result: FunctionMetrics = {
      act: emptyMetrics(),
      extract: emptyMetrics(),
      observe: emptyMetrics(),
      agent: emptyMetrics(),
    };

    for (const fn of ["act", "extract", "observe", "agent"] as MetricFunction[]) {
      const fnEntries = this.entries.filter((e) => e.fn === fn);
      result[fn] = this.aggregate(fnEntries);
    }

    return result;
  }

  /**
   * Get metrics grouped by model.
   */
  getPerModel(): Record<string, TokenMetrics> {
    const models = new Map<string, MetricEntry[]>();

    for (const entry of this.entries) {
      const existing = models.get(entry.model) ?? [];
      existing.push(entry);
      models.set(entry.model, existing);
    }

    const result: Record<string, TokenMetrics> = {};
    for (const [model, entries] of models) {
      result[model] = this.aggregate(entries);
    }

    return result;
  }

  /**
   * Get all raw metric entries.
   */
  getEntries(): MetricEntry[] {
    return [...this.entries];
  }

  /**
   * Get the total number of LLM calls made.
   */
  get callCount(): number {
    return this.entries.length;
  }

  /**
   * Reset all collected metrics.
   */
  reset(): void {
    this.entries = [];
  }

  /**
   * Create a timer for measuring operation durations.
   * Returns a timer object with stop() and elapsed() methods.
   */
  static timer(): DurationTimer {
    const start = performance.now();
    return {
      stop(): number {
        return Math.round(performance.now() - start);
      },
      elapsed(): number {
        return Math.round(performance.now() - start);
      },
    };
  }

  /**
   * Measure the duration of an async function.
   * Returns the function result and elapsed time.
   */
  static async measure<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const timer = MetricsCollector.timer();
    const result = await fn();
    return { result, durationMs: timer.stop() };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private aggregate(entries: MetricEntry[]): TokenMetrics {
    const totals: TokenMetrics = {
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      inferenceTimeMs: 0,
      cost: 0,
    };

    for (const entry of entries) {
      totals.promptTokens += entry.promptTokens;
      totals.completionTokens += entry.completionTokens;
      totals.reasoningTokens += entry.reasoningTokens;
      totals.cachedInputTokens += entry.cachedInputTokens;
      totals.inferenceTimeMs += entry.inferenceTimeMs;
      totals.cost += entry.cost;
    }

    // Round cost to avoid floating point drift
    totals.cost = Math.round(totals.cost * 1_000_000) / 1_000_000;

    return totals;
  }

  private findModel(model: string): ModelDefinition | undefined {
    // Direct lookup
    if (this.modelDefinitions[model]) {
      return this.modelDefinitions[model];
    }

    // Search by model ID
    for (const def of Object.values(this.modelDefinitions)) {
      if (def.id === model) return def;
    }

    // Partial match (e.g. "claude-sonnet-4" matches "claude-sonnet-4-20250514")
    for (const [key, def] of Object.entries(this.modelDefinitions)) {
      if (
        key.startsWith(model) ||
        def.id.startsWith(model) ||
        def.name.toLowerCase().includes(model.toLowerCase())
      ) {
        return def;
      }
    }

    return undefined;
  }
}
