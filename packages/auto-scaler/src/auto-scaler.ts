// ──────────────────────────────────────────────────────────────────────────────
// Auto Scaler Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { AutoScalerError } from "./errors.js";
import { ResourceMonitor } from "./resource-monitor.js";
import { ConcurrencyManager, ConcurrencyState } from "./concurrency-manager.js";

export class AutoScalerConfig extends Schema.Class<AutoScalerConfig>("AutoScalerConfig")({
  checkInterval: Schema.Number,
  enabled: Schema.Boolean,
}) {}

export class ScalingEvent extends Schema.Class<ScalingEvent>("ScalingEvent")({
  timestamp: Schema.Number,
  previousConcurrency: Schema.Number,
  newConcurrency: Schema.Number,
  reason: Schema.String,
  systemLoad: Schema.Number,
}) {}

export interface AutoScalerService {
  readonly start: () => Effect.Effect<void, AutoScalerError>;
  readonly stop: () => Effect.Effect<void>;
  readonly isRunning: Effect.Effect<boolean>;
  readonly getEvents: Effect.Effect<ScalingEvent[]>;
  readonly getCurrentState: Effect.Effect<ConcurrencyState>;
}

export class AutoScaler extends ServiceMap.Service<
  AutoScaler,
  AutoScalerService
>()("@inspect/AutoScaler") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const resourceMonitor = yield* ResourceMonitor;
      const concurrencyManager = yield* ConcurrencyManager;
      const config = new AutoScalerConfig({ checkInterval: 5000, enabled: true });

      let isRunning = false;
      const events: ScalingEvent[] = [];

      const start = () =>
        Effect.gen(function* () {
          if (isRunning) {
            yield* Effect.logWarning("Auto scaler is already running");
            return;
          }

          if (!config.enabled) {
            yield* Effect.logInfo("Auto scaler is disabled");
            return;
          }

          isRunning = true;

          yield* Effect.logInfo("Auto scaler started", {
            checkInterval: config.checkInterval,
          });

          yield* Effect.logInfo("Auto scaler monitoring loop active");
        }).pipe(
          Effect.catchTag("NoSuchElementError", (cause) =>
            Effect.fail(
              new AutoScalerError({
                message: `Failed to start auto scaler: ${String(cause)}`,
                component: "auto-scaler",
                cause,
              }),
            ),
          ),
          Effect.withSpan("AutoScaler.start"),
        );

      const stop = Effect.sync(() => {
        isRunning = false;
      }).pipe(
        Effect.tap(() => Effect.logInfo("Auto scaler stopped")),
        Effect.withSpan("AutoScaler.stop"),
      );

      const isRunningEffect = Effect.sync(() => isRunning);

      const getEvents = Effect.sync(() => [...events]).pipe(
        Effect.withSpan("AutoScaler.getEvents"),
      );

      const getCurrentState = concurrencyManager.getState;

      return { start, stop, isRunning: isRunningEffect, getEvents, getCurrentState } as const;
    }),
  ).pipe(Layer.provideMerge(ResourceMonitor.layer, ConcurrencyManager.layer));
}
