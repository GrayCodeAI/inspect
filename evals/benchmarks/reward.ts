// ──────────────────────────────────────────────────────────────────────────────
// evals/benchmarks/reward.ts - Reward Shaping for Agent Benchmarks
// ──────────────────────────────────────────────────────────────────────────────

/** Reward function type */
export type RewardFunction = (state: RewardState) => number | Promise<number>;

/** State passed to reward functions */
export interface RewardState {
  /** Current step index */
  stepIndex: number;
  /** Total steps taken */
  totalSteps: number;
  /** Whether the goal was completed */
  goalComplete: boolean;
  /** Actions taken so far */
  actions: RewardAction[];
  /** Current page URL */
  url: string;
  /** Page elements at current step */
  elements: RewardElement[];
  /** Previous reward value */
  previousReward: number;
  /** Error if any */
  error?: string;
}

/** Action record for reward calculation */
export interface RewardAction {
  type: string;
  target?: string;
  success: boolean;
  timestamp: number;
}

/** Element for reward calculation */
export interface RewardElement {
  ref: string;
  role: string;
  name: string;
  interactable: boolean;
}

/** Reward configuration */
export interface RewardConfig {
  /** Name of the reward function */
  name: string;
  /** Reward function */
  fn: RewardFunction;
  /** Weight for multi-objective rewards (default: 1.0) */
  weight?: number;
  /** Whether to normalize reward to [0, 1] */
  normalize?: boolean;
}

/**
 * Built-in reward functions.
 */
export const BuiltinRewards = {
  /** Binary reward: 1.0 if goal complete, 0.0 otherwise */
  completion: (state: RewardState): number => {
    return state.goalComplete ? 1.0 : 0.0;
  },

  /** Reward for successful element interactions */
  elementInteraction: (state: RewardState): number => {
    const successfulActions = state.actions.filter((a) => a.success).length;
    return Math.min(1.0, successfulActions / Math.max(1, state.totalSteps));
  },

  /** Reward inversely proportional to steps (fewer is better) */
  efficiency: (state: RewardState): number => {
    if (!state.goalComplete) return 0.0;
    return 1.0 / (1.0 + state.totalSteps * 0.1);
  },

  /** Penalty for errors */
  errorPenalty: (state: RewardState): number => {
    const errors = state.actions.filter((a) => !a.success).length;
    return Math.max(0, 1.0 - errors * 0.2);
  },

  /** Reward for exploring different elements */
  exploration: (state: RewardState): number => {
    const uniqueTargets = new Set(state.actions.map((a) => a.target).filter(Boolean));
    return Math.min(1.0, uniqueTargets.size / Math.max(1, state.totalSteps));
  },

  /** Composite reward combining multiple objectives */
  composite: (weights: Record<string, number>) => {
    return (state: RewardState): number => {
      let total = 0;
      let totalWeight = 0;

      if (weights.completion) {
        total += weights.completion * BuiltinRewards.completion(state);
        totalWeight += weights.completion;
      }
      if (weights.efficiency) {
        total += weights.efficiency * BuiltinRewards.efficiency(state);
        totalWeight += weights.efficiency;
      }
      if (weights.exploration) {
        total += weights.exploration * BuiltinRewards.exploration(state);
        totalWeight += weights.exploration;
      }
      if (weights.errorPenalty) {
        total += weights.errorPenalty * BuiltinRewards.errorPenalty(state);
        totalWeight += weights.errorPenalty;
      }

      return totalWeight > 0 ? total / totalWeight : 0;
    };
  },
};

/**
 * Reward shaper for agent benchmarks.
 * Combines multiple reward functions with configurable weights.
 *
 * Usage:
 * ```ts
 * const shaper = new RewardShaper();
 * shaper.add("completion", BuiltinRewards.completion, { weight: 2.0 });
 * shaper.add("efficiency", BuiltinRewards.efficiency);
 * const reward = await shaper.calculate(state);
 * ```
 */
export class RewardShaper {
  private rewards: RewardConfig[] = [];

  /**
   * Add a reward function.
   */
  add(name: string, fn: RewardFunction, options?: { weight?: number; normalize?: boolean }): this {
    this.rewards.push({
      name,
      fn,
      weight: options?.weight ?? 1.0,
      normalize: options?.normalize ?? false,
    });
    return this;
  }

  /**
   * Add a built-in reward by name.
   */
  addBuiltin(name: keyof typeof BuiltinRewards, weight?: number): this {
    const fn = BuiltinRewards[name] as RewardFunction;
    if (typeof fn === "function") {
      this.add(name, fn, { weight });
    }
    return this;
  }

  /**
   * Calculate the weighted reward for the current state.
   */
  async calculate(state: RewardState): Promise<number> {
    if (this.rewards.length === 0) {
      return BuiltinRewards.completion(state);
    }

    let totalWeightedReward = 0;
    let totalWeight = 0;

    for (const reward of this.rewards) {
      const value = await reward.fn(state);
      const normalizedValue = reward.normalize ? Math.max(0, Math.min(1, value)) : value;
      totalWeightedReward += normalizedValue * (reward.weight ?? 1.0);
      totalWeight += reward.weight ?? 1.0;
    }

    return totalWeight > 0 ? totalWeightedReward / totalWeight : 0;
  }

  /**
   * Calculate per-step rewards for a sequence of states.
   */
  async calculateSequence(states: RewardState[]): Promise<number[]> {
    const rewards: number[] = [];
    for (let i = 0; i < states.length; i++) {
      const state = { ...states[i], previousReward: rewards[i - 1] ?? 0 };
      rewards.push(await this.calculate(state));
    }
    return rewards;
  }

  /**
   * Calculate cumulative reward.
   */
  async calculateCumulative(states: RewardState[]): Promise<number> {
    const stepRewards = await this.calculateSequence(states);
    return stepRewards.reduce((sum, r) => sum + r, 0);
  }

  /**
   * Get the list of configured reward functions.
   */
  list(): Array<{ name: string; weight: number }> {
    return this.rewards.map((r) => ({
      name: r.name,
      weight: r.weight ?? 1.0,
    }));
  }

  /**
   * Clear all reward functions.
   */
  clear(): void {
    this.rewards = [];
  }
}
