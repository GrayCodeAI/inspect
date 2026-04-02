/**
 * SpeculativePlanner - Effect-TS Implementation
 *
 * Pre-computes the next step while the current step executes.
 * If the page doesn't change unexpectedly, the pre-built prompt is used
 * directly — saving 30-40% of LLM latency.
 * Inspired by Skyvern's speculative_plans.
 */

import { Effect, Layer, Schema, ServiceMap } from "effect";

export class SpeculativePlan extends Schema.Class<SpeculativePlan>("SpeculativePlan")({
  stepIndex: Schema.Number,
  snapshot: Schema.String,
  prompt: Schema.String,
  url: Schema.String,
  capturedAt: Schema.Number,
  status: Schema.Literals(["pending", "used", "discarded"] as const),
}) {}

export class SpeculativeStats extends Schema.Class<SpeculativeStats>("SpeculativeStats")({
  generated: Schema.Number,
  used: Schema.Number,
  discarded: Schema.Number,
  hitRate: Schema.Number,
  estimatedTimeSavedMs: Schema.Number,
}) {}

const STALENESS_THRESHOLD_MS = 30_000;
const DEFAULT_AVG_PREP_TIME_MS = 2000;

export class SpeculativePlanner extends ServiceMap.Service<SpeculativePlanner>()(
  "@orchestrator/SpeculativePlanner",
  {
    make: Effect.gen(function* () {
      let plans = new Map<number, SpeculativePlan>();
      let stats = new SpeculativeStats({
        generated: 0,
        used: 0,
        discarded: 0,
        hitRate: 0,
        estimatedTimeSavedMs: 0,
      });
      let avgPrepTimeMs = DEFAULT_AVG_PREP_TIME_MS;

      const precompute = Effect.fn("SpeculativePlanner.precompute")(function* (
        stepIndex: number,
        snapshot: string,
        prompt: string,
        url: string,
      ) {
        plans.set(
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
        stats = new SpeculativeStats({
          ...stats,
          generated: stats.generated + 1,
        });
      });

      const get = Effect.fn("SpeculativePlanner.get")(function* (
        stepIndex: number,
        currentUrl: string,
      ): Effect.Effect<SpeculativePlan | null> {
        const plan = plans.get(stepIndex);
        if (!plan) return null;

        try {
          const planPath = new URL(plan.url).pathname;
          const currentPath = new URL(currentUrl).pathname;

          if (planPath !== currentPath) {
            plans.delete(stepIndex);
            stats = new SpeculativeStats({
              ...stats,
              discarded: stats.discarded + 1,
            });
            return null;
          }
        } catch {
          plans.delete(stepIndex);
          stats = new SpeculativeStats({
            ...stats,
            discarded: stats.discarded + 1,
          });
          return null;
        }

        if (Date.now() - plan.capturedAt > STALENESS_THRESHOLD_MS) {
          plans.delete(stepIndex);
          stats = new SpeculativeStats({
            ...stats,
            discarded: stats.discarded + 1,
          });
          return null;
        }

        plans.delete(stepIndex);
        stats = new SpeculativeStats({
          ...stats,
          used: stats.used + 1,
          estimatedTimeSavedMs: stats.estimatedTimeSavedMs + avgPrepTimeMs,
          hitRate: stats.generated > 0 ? (stats.used + 1) / stats.generated : 0,
        });

        return new SpeculativePlan({ ...plan, status: "used" });
      });

      const discardAll = Effect.fn("SpeculativePlanner.discardAll")(function* () {
        for (const plan of plans.values()) {
          if (plan.status === "pending") {
            stats = new SpeculativeStats({
              ...stats,
              discarded: stats.discarded + 1,
            });
          }
        }
        plans.clear();
      });

      const getStats = Effect.sync(() => stats);

      const updateAvgPrepTime = Effect.fn("SpeculativePlanner.updateAvgPrepTime")(function* (
        ms: number,
      ) {
        avgPrepTimeMs = ms;
      });

      const reset = Effect.sync(() => {
        plans.clear();
        stats = new SpeculativeStats({
          generated: 0,
          used: 0,
          discarded: 0,
          hitRate: 0,
          estimatedTimeSavedMs: 0,
        });
        avgPrepTimeMs = DEFAULT_AVG_PREP_TIME_MS;
      });

      return { precompute, get, discardAll, getStats, updateAvgPrepTime, reset } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
