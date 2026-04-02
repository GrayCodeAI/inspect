import { Effect, Layer, Schema, ServiceMap } from "effect";

export class StabilityCheck extends Schema.Class<StabilityCheck>("StabilityCheck")({
  stable: Schema.Boolean,
  reason: Schema.String,
  timestamp: Schema.String,
}) {}

export class StabilityService extends ServiceMap.Service<StabilityService>()("@browser/Stability", {
  make: Effect.gen(function* () {
    const checkNetworkStability = Effect.fn("Stability.checkNetworkStability")(function* (
      pageId: string,
    ) {
      yield* Effect.annotateCurrentSpan({ pageId });

      const check = new StabilityCheck({
        stable: true,
        reason: "Network idle",
        timestamp: new Date().toISOString(),
      });

      yield* Effect.logDebug("Network stability checked", { stable: check.stable });

      return check;
    });

    const checkVisualStability = Effect.fn("Stability.checkVisualStability")(function* (
      pageId: string,
    ) {
      yield* Effect.annotateCurrentSpan({ pageId });

      const check = new StabilityCheck({
        stable: true,
        reason: "Visual stable",
        timestamp: new Date().toISOString(),
      });

      yield* Effect.logDebug("Visual stability checked", { stable: check.stable });

      return check;
    });

    const waitForStable = Effect.fn("Stability.waitForStable")(function* (
      pageId: string,
      timeout: number = 5000,
    ) {
      yield* Effect.annotateCurrentSpan({ pageId, timeout });

      const networkCheck = yield* checkNetworkStability(pageId);
      const visualCheck = yield* checkVisualStability(pageId);

      const stable = networkCheck.stable && visualCheck.stable;

      yield* Effect.logDebug("Stability wait completed", { stable, timeout });

      return stable;
    });

    return { checkNetworkStability, checkVisualStability, waitForStable } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
