import { Effect, Layer, Schema, ServiceMap } from "effect";

export class LoopDetection extends Schema.Class<LoopDetection>("LoopDetection")({
  detected: Schema.Boolean,
  action: Schema.String,
  count: Schema.Number,
  timestamp: Schema.String,
}) {}

export class LoopDetectorService extends ServiceMap.Service<LoopDetectorService>()(
  "@tools/LoopDetector",
  {
    make: Effect.gen(function* () {
      const actionHistory: string[] = [];

      const track = Effect.fn("LoopDetector.track")(function* (action: string) {
        yield* Effect.annotateCurrentSpan({ action });

        actionHistory.push(action);

        yield* Effect.logDebug("Action tracked", { action, total: actionHistory.length });

        return true;
      });

      const detect = Effect.fn("LoopDetector.detect")(function* (threshold: number = 3) {
        yield* Effect.annotateCurrentSpan({ threshold });

        const recent = actionHistory.slice(-10);
        const counts = new Map<string, number>();

        for (const action of recent) {
          counts.set(action, (counts.get(action) || 0) + 1);
        }

        const detected = Array.from(counts.entries()).some(([, count]) => count >= threshold);

        const loopAction = detected
          ? (Array.from(counts.entries()).find(([, count]) => count >= threshold)?.[0] ?? "")
          : "";

        const detection = new LoopDetection({
          detected,
          action: loopAction,
          count: counts.get(loopAction) || 0,
          timestamp: new Date().toISOString(),
        });

        yield* Effect.logInfo("Loop detection completed", {
          detected,
          action: loopAction,
          count: detection.count,
        });

        return detection;
      });

      const reset = Effect.fn("LoopDetector.reset")(function* () {
        yield* Effect.annotateCurrentSpan({ action: "reset" });

        actionHistory.length = 0;

        yield* Effect.logInfo("Loop detector reset");

        return true;
      });

      return { track, detect, reset } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
