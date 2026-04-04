// ============================================================================
// @inspect/agent - Real-Time Token Tracker
//
// Tracks token usage across all LLM calls with budget enforcement,
// cost estimation, and per-step breakdown.
// ============================================================================

export interface TokenBudget {
  /** Max tokens allowed. 0 = unlimited */
  maxTokens: number;
  /** Cost per 1K input tokens. Default: $0.003 */
  inputCostPer1K?: number;
  /** Cost per 1K output tokens. Default: $0.015 */
  outputCostPer1K?: number;
  /** Warning threshold (0-1). Default: 0.8 */
  warningThreshold?: number;
}

export interface TokenUsageEntry {
  stepIndex: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: number;
  purpose: string;
}

export interface TokenSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  entries: TokenUsageEntry[];
  budgetUsedPercent: number;
  overBudget: boolean;
  warningTriggered: boolean;
}

/**
 * TokenTracker monitors real-time token usage with budget enforcement.
 */
export class TokenTracker {
  private budget: Required<TokenBudget>;
  private entries: TokenUsageEntry[] = [];
  private totalInput = 0;
  private totalOutput = 0;
  private warningCallback?: (pct: number, remaining: number) => void;
  private budgetExceededCallback?: (total: number, budget: number) => void;

  constructor(budget: TokenBudget) {
    this.budget = {
      maxTokens: budget.maxTokens,
      inputCostPer1K: budget.inputCostPer1K ?? 0.003,
      outputCostPer1K: budget.outputCostPer1K ?? 0.015,
      warningThreshold: budget.warningThreshold ?? 0.8,
    };
  }

  /**
   * Record token usage for a step.
   */
  record(stepIndex: number, inputTokens: number, outputTokens: number, purpose: string): void {
    const cost =
      (inputTokens / 1000) * this.budget.inputCostPer1K +
      (outputTokens / 1000) * this.budget.outputCostPer1K;

    this.entries.push({
      stepIndex,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cost,
      timestamp: Date.now(),
      purpose,
    });

    this.totalInput += inputTokens;
    this.totalOutput += outputTokens;

    // Check budget
    if (this.budget.maxTokens > 0) {
      const total = this.totalInput + this.totalOutput;
      const pct = total / this.budget.maxTokens;

      if (pct >= this.budget.warningThreshold && pct < 1 && this.warningCallback) {
        this.warningCallback(Math.round(pct * 100), this.budget.maxTokens - total);
      }

      if (pct >= 1 && this.budgetExceededCallback) {
        this.budgetExceededCallback(total, this.budget.maxTokens);
      }
    }
  }

  /**
   * Check if we can afford a call with estimated tokens.
   */
  canAfford(estimatedTokens: number): boolean {
    if (this.budget.maxTokens === 0) return true;
    return this.totalInput + this.totalOutput + estimatedTokens <= this.budget.maxTokens;
  }

  /**
   * Get current summary.
   */
  getSummary(): TokenSummary {
    const total = this.totalInput + this.totalOutput;
    const cost =
      (this.totalInput / 1000) * this.budget.inputCostPer1K +
      (this.totalOutput / 1000) * this.budget.outputCostPer1K;
    const pct = this.budget.maxTokens > 0 ? (total / this.budget.maxTokens) * 100 : 0;

    return {
      totalInputTokens: this.totalInput,
      totalOutputTokens: this.totalOutput,
      totalTokens: total,
      totalCost: Math.round(cost * 10000) / 10000,
      entries: this.entries,
      budgetUsedPercent: Math.round(pct),
      overBudget: this.budget.maxTokens > 0 && total > this.budget.maxTokens,
      warningTriggered: this.budget.maxTokens > 0 && pct >= this.budget.warningThreshold * 100,
    };
  }

  /**
   * Estimate cost for a given token count.
   */
  estimateCost(tokens: number): number {
    // Assume 60% input, 40% output split
    const input = tokens * 0.6;
    const output = tokens * 0.4;
    return (
      (input / 1000) * this.budget.inputCostPer1K + (output / 1000) * this.budget.outputCostPer1K
    );
  }

  /**
   * Set warning callback.
   */
  onWarning(callback: (pct: number, remaining: number) => void): void {
    this.warningCallback = callback;
  }

  /**
   * Set budget exceeded callback.
   */
  onBudgetExceeded(callback: (total: number, budget: number) => void): void {
    this.budgetExceededCallback = callback;
  }

  /**
   * Reset tracker.
   */
  reset(): void {
    this.entries = [];
    this.totalInput = 0;
    this.totalOutput = 0;
  }
}
