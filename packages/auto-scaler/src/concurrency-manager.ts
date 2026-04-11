// ──────────────────────────────────────────────────────────────────────────────
// Concurrency Manager Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap, Ref } from "effect";
import { AutoScalerError } from "./errors.js";

export class ConcurrencyConfig extends Schema.Class<ConcurrencyConfig>("ConcurrencyConfig")({
  minConcurrency: Schema.Number,
  maxConcurrency: Schema.Number,
  initialConcurrency: Schema.Number,
  scaleUpThreshold: Schema.Number,
  scaleDownThreshold: Schema.Number,
  scaleUpFactor: Schema.Number,
  scaleDownFactor: Schema.Number,
}) {}

export class ConcurrencyState extends Schema.Class<ConcurrencyState>("ConcurrencyState")({
  current: Schema.Number,
  min: Schema.Number,
  max: Schema.Number,
  lastAdjustment: Schema.Number,
  reason: Schema.String,
}) {}

export interface ConcurrencyManagerService {
  readonly getCurrent: Effect.Effect<number>;
  readonly adjust: (systemLoad: number) => Effect.Effect<ConcurrencyState, AutoScalerError>;
  readonly setConcurrency: (value: number) => Effect.Effect<void>;
  readonly getState: Effect.Effect<ConcurrencyState>;
}

export class ConcurrencyManager extends ServiceMap.Service<
  ConcurrencyManager,
  ConcurrencyManagerService
>()("@inspect/ConcurrencyManager") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const config = new ConcurrencyConfig({
        minConcurrency: 1,
        maxConcurrency: 10,
        initialConcurrency: 2,
        scaleUpThreshold: 0.5,
        scaleDownThreshold: 0.8,
        scaleUpFactor: 1.5,
        scaleDownFactor: 0.7,
      });
      const currentRef = yield* Ref.make(config.initialConcurrency);
      const stateRef = yield* Ref.make(
        new ConcurrencyState({
          current: config.initialConcurrency,
          min: config.minConcurrency,
          max: config.maxConcurrency,
          lastAdjustment: Date.now(),
          reason: "initial",
        }),
      );

      const getCurrent = Ref.get(currentRef);

      const setConcurrency = (value: number) =>
        Effect.gen(function* () {
          const clamped = Math.max(config.minConcurrency, Math.min(config.maxConcurrency, value));
          yield* Ref.set(currentRef, clamped);
          yield* Ref.update(stateRef, (state) => ({
            ...state,
            current: clamped,
            lastAdjustment: Date.now(),
            reason: "manual",
          }));
        }).pipe(Effect.withSpan("ConcurrencyManager.setConcurrency"));

      const adjust = (systemLoad: number) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(currentRef);
          let newConcurrency = current;
          let reason = "no-change";

          if (systemLoad < config.scaleUpThreshold && current < config.maxConcurrency) {
            newConcurrency = Math.min(
              config.maxConcurrency,
              Math.ceil(current * config.scaleUpFactor),
            );
            reason = "scale-up-low-load";
          } else if (systemLoad > config.scaleDownThreshold && current > config.minConcurrency) {
            newConcurrency = Math.max(
              config.minConcurrency,
              Math.floor(current * config.scaleDownFactor),
            );
            reason = "scale-down-high-load";
          }

          if (newConcurrency !== current) {
            yield* Ref.set(currentRef, newConcurrency);
            yield* Effect.logInfo("Concurrency adjusted", {
              from: current,
              to: newConcurrency,
              reason,
              systemLoad,
            });
          }

          const newState = new ConcurrencyState({
            current: newConcurrency,
            min: config.minConcurrency,
            max: config.maxConcurrency,
            lastAdjustment: Date.now(),
            reason,
          });

          yield* Ref.set(stateRef, newState);

          return newState;
        }).pipe(
          Effect.catchTag("NoSuchElementError", (cause) =>
            Effect.fail(
              new AutoScalerError({
                message: `Failed to adjust concurrency: ${String(cause)}`,
                component: "concurrency-manager",
                cause,
              }),
            ),
          ),
          Effect.withSpan("ConcurrencyManager.adjust"),
        );

      const getState = Ref.get(stateRef);

      return { getCurrent, adjust, setConcurrency, getState } as const;
    }),
  );
}
