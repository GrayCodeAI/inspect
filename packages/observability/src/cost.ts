const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
};

export interface CostEstimate {
  estimatedSteps: number;
  estimatedTokens: number;
  estimatedCost: number;
  confidence: number;
  breakdown: {
    planning: number;
    execution: number;
    verification: number;
    reporting: number;
  };
}

export interface Optimization {
  type: string;
  savings: string;
  impact: "none" | "minimal" | "low" | "medium" | "high";
  condition?: string;
}

/**
 * Predicts test run costs before execution.
 */
export class CostPredictor {
  async predict(opts: {
    provider: string;
    model: string;
    estimatedPages: number;
    estimatedSteps: number;
    includeQuality: boolean;
  }): Promise<CostEstimate> {
    const pricing = PRICING[opts.model] ?? { input: 2, output: 8 };
    const avgTokensPerStep = 2000; // input + output per step
    const qualityMultiplier = opts.includeQuality ? 1.5 : 1;
    const estimatedSteps =
      Math.max(opts.estimatedSteps, opts.estimatedPages * 5) * qualityMultiplier;
    const estimatedTokens = estimatedSteps * avgTokensPerStep;
    const costPer1kTokens = (pricing.input + pricing.output) / 2 / 1000;

    return {
      estimatedSteps: Math.round(estimatedSteps),
      estimatedTokens: Math.round(estimatedTokens),
      estimatedCost: (estimatedTokens / 1000) * costPer1kTokens,
      confidence: 0.7,
      breakdown: {
        planning: 0.15,
        execution: 0.6,
        verification: 0.15,
        reporting: 0.1,
      },
    };
  }
}

/**
 * Suggests cost optimizations for test runs.
 */
export class CostOptimizer {
  suggest(opts: {
    model: string;
    actualTokens: number;
    isRepeatRun: boolean;
    usedVision: boolean;
  }): Optimization[] {
    const optimizations: Optimization[] = [];

    // Flash mode
    if (!opts.model.includes("flash")) {
      optimizations.push({
        type: "use_flash_model",
        savings: "40-70%",
        impact: "low",
        condition: "Tasks not requiring deep reasoning",
      });
    }

    // Caching
    if (opts.isRepeatRun) {
      optimizations.push({
        type: "enable_caching",
        savings: "90%",
        impact: "none",
        condition: "Repeat run — use action cache",
      });
    }

    // Vision reduction
    if (opts.usedVision) {
      optimizations.push({
        type: "reduce_vision_calls",
        savings: "25%",
        impact: "low",
        condition: "Use ARIA snapshots instead of screenshots where possible",
      });
    }

    // Local model
    optimizations.push({
      type: "use_local_model",
      savings: "100%",
      impact: "medium",
      condition: "Use Ollama for non-critical tasks",
    });

    return optimizations;
  }
}

/**
 * Per-step cost attribution tracker.
 * Tracks costs broken down by individual test steps, agents, and sessions.
 */
export interface StepCostEntry {
  stepId: string;
  sessionId: string;
  agentName: string;
  action: string;
  tokensInput: number;
  tokensOutput: number;
  cost: number;
  duration: number;
  timestamp: number;
}

export interface CostAttribution {
  totalCost: number;
  totalTokens: number;
  stepCount: number;
  byStep: Map<string, StepCostEntry>;
  byAgent: Map<string, { cost: number; tokens: number; count: number }>;
  bySession: Map<string, { cost: number; tokens: number; count: number }>;
}

/**
 * Tracks per-step cost attribution for detailed cost breakdowns.
 */
export class CostAttributionTracker {
  private entries: StepCostEntry[] = [];

  /**
   * Record a step's cost.
   */
  record(entry: Omit<StepCostEntry, "timestamp">): void {
    this.entries.push({ ...entry, timestamp: Date.now() });
  }

  /**
   * Get cost attribution summary.
   */
  getAttribution(sessionId?: string): CostAttribution {
    const filtered = sessionId
      ? this.entries.filter((e) => e.sessionId === sessionId)
      : this.entries;

    const byStep = new Map<string, StepCostEntry>();
    const byAgent = new Map<string, { cost: number; tokens: number; count: number }>();
    const bySession = new Map<string, { cost: number; tokens: number; count: number }>();

    let totalCost = 0;
    let totalTokens = 0;

    for (const entry of filtered) {
      totalCost += entry.cost;
      totalTokens += entry.tokensInput + entry.tokensOutput;

      byStep.set(entry.stepId, entry);

      const agent = byAgent.get(entry.agentName) ?? { cost: 0, tokens: 0, count: 0 };
      agent.cost += entry.cost;
      agent.tokens += entry.tokensInput + entry.tokensOutput;
      agent.count++;
      byAgent.set(entry.agentName, agent);

      const session = bySession.get(entry.sessionId) ?? { cost: 0, tokens: 0, count: 0 };
      session.cost += entry.cost;
      session.tokens += entry.tokensInput + entry.tokensOutput;
      session.count++;
      bySession.set(entry.sessionId, session);
    }

    return {
      totalCost,
      totalTokens,
      stepCount: filtered.length,
      byStep,
      byAgent,
      bySession,
    };
  }

  /**
   * Get the most expensive steps.
   */
  getTopSteps(limit = 10): StepCostEntry[] {
    return [...this.entries].sort((a, b) => b.cost - a.cost).slice(0, limit);
  }

  /**
   * Clear all tracked entries.
   */
  clear(): void {
    this.entries.length = 0;
  }

  /**
   * Get entry count.
   */
  get size(): number {
    return this.entries.length;
  }
}

/**
 * Budget manager with alerting.
 */
export class BudgetManager {
  private sessionBudget: number;
  private dailyBudget: number;
  private monthlyBudget: number;
  private sessionSpent = 0;
  private dailySpent = 0;
  private monthlySpent = 0;
  private alertCallbacks: Array<
    (alert: { type: string; message: string; percentUsed: number }) => void
  > = [];

  constructor(
    config: { sessionBudget?: number; dailyBudget?: number; monthlyBudget?: number } = {},
  ) {
    this.sessionBudget = config.sessionBudget ?? 5.0;
    this.dailyBudget = config.dailyBudget ?? 20.0;
    this.monthlyBudget = config.monthlyBudget ?? 100.0;
  }

  /**
   * Record spending and check for alerts.
   */
  spend(amount: number): { allowed: boolean; reason?: string } {
    this.sessionSpent += amount;
    this.dailySpent += amount;
    this.monthlySpent += amount;

    // Check thresholds and fire alerts
    this.checkThresholds("session", this.sessionSpent, this.sessionBudget);
    this.checkThresholds("daily", this.dailySpent, this.dailyBudget);
    this.checkThresholds("monthly", this.monthlySpent, this.monthlyBudget);

    if (this.sessionSpent > this.sessionBudget) {
      return {
        allowed: false,
        reason: `Session budget exceeded ($${this.sessionSpent.toFixed(2)} / $${this.sessionBudget.toFixed(2)})`,
      };
    }
    if (this.monthlySpent > this.monthlyBudget) {
      return {
        allowed: false,
        reason: `Monthly budget exceeded ($${this.monthlySpent.toFixed(2)} / $${this.monthlyBudget.toFixed(2)})`,
      };
    }

    return { allowed: true };
  }

  /**
   * Register a budget alert callback.
   */
  onAlert(callback: (alert: { type: string; message: string; percentUsed: number }) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get current budget status.
   */
  getStatus(): {
    session: { spent: number; budget: number; percentUsed: number };
    daily: { spent: number; budget: number; percentUsed: number };
    monthly: { spent: number; budget: number; percentUsed: number };
  } {
    return {
      session: {
        spent: this.sessionSpent,
        budget: this.sessionBudget,
        percentUsed: (this.sessionSpent / this.sessionBudget) * 100,
      },
      daily: {
        spent: this.dailySpent,
        budget: this.dailyBudget,
        percentUsed: (this.dailySpent / this.dailyBudget) * 100,
      },
      monthly: {
        spent: this.monthlySpent,
        budget: this.monthlyBudget,
        percentUsed: (this.monthlySpent / this.monthlyBudget) * 100,
      },
    };
  }

  /**
   * Reset session spending (call at start of new session).
   */
  resetSession(): void {
    this.sessionSpent = 0;
  }

  private checkThresholds(type: string, spent: number, budget: number): void {
    const percentUsed = (spent / budget) * 100;
    if (percentUsed >= 80 && percentUsed < 100) {
      this.fireAlert(
        `${type}-warning`,
        `${type} budget at ${percentUsed.toFixed(0)}% ($${spent.toFixed(2)} / $${budget.toFixed(2)})`,
        percentUsed,
      );
    } else if (percentUsed >= 100) {
      this.fireAlert(
        `${type}-exceeded`,
        `${type} budget exceeded ($${spent.toFixed(2)} / $${budget.toFixed(2)})`,
        percentUsed,
      );
    }
  }

  private fireAlert(type: string, message: string, percentUsed: number): void {
    for (const cb of this.alertCallbacks) {
      try {
        cb({ type, message, percentUsed });
      } catch {
        /* ignore */
      }
    }
  }
}
