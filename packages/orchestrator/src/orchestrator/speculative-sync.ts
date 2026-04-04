/**
 * SyncSpeculativePlanner — synchronous wrapper around SpeculativePlanner
 * for use in CLI/TUI contexts that don't use Effect runtime.
 */

import type { SpeculativePlan, SpeculativeStats } from "@inspect/orchestrator";

const STALENESS_THRESHOLD_MS = 30_000;
const DEFAULT_AVG_PREP_TIME_MS = 2000;

export class SyncSpeculativePlanner {
  private plans = new Map<number, SpeculativePlan>();
  private stats: SpeculativeStats = {
    generated: 0,
    used: 0,
    discarded: 0,
    hitRate: 0,
    estimatedTimeSavedMs: 0,
  };
  private avgPrepTimeMs = DEFAULT_AVG_PREP_TIME_MS;

  precompute(stepIndex: number, snapshot: string, prompt: string, url: string): void {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SpeculativePlan } = require("@inspect/orchestrator");
    this.plans.set(
      stepIndex,
      new SpeculativePlan({
        stepIndex,
        snapshot,
        prompt,
        url,
        capturedAt: Date.now(),
        status: "pending",
      }),
    );
    this.stats = {
      ...this.stats,
      generated: this.stats.generated + 1,
    };
  }

  get(stepIndex: number, currentUrl: string): SpeculativePlan | null {
    const plan = this.plans.get(stepIndex);
    if (!plan) return null;

    try {
      const planPath = new URL(plan.url).pathname;
      const currentPath = new URL(currentUrl).pathname;
      if (planPath !== currentPath) {
        this.plans.delete(stepIndex);
        this.stats = { ...this.stats, discarded: this.stats.discarded + 1 };
        return null;
      }
    } catch {
      this.plans.delete(stepIndex);
      this.stats = { ...this.stats, discarded: this.stats.discarded + 1 };
      return null;
    }

    if (Date.now() - plan.capturedAt > STALENESS_THRESHOLD_MS) {
      this.plans.delete(stepIndex);
      this.stats = { ...this.stats, discarded: this.stats.discarded + 1 };
      return null;
    }

    this.plans.delete(stepIndex);
    this.stats = {
      ...this.stats,
      used: this.stats.used + 1,
      estimatedTimeSavedMs: this.stats.estimatedTimeSavedMs + this.avgPrepTimeMs,
      hitRate: this.stats.generated > 0 ? (this.stats.used + 1) / this.stats.generated : 0,
    };

    return { ...plan, status: "used" } as SpeculativePlan;
  }

  getStats(): SpeculativeStats {
    return this.stats;
  }
}
