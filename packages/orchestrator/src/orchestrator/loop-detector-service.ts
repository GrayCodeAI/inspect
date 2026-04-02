import { Effect, Layer, Schema, ServiceMap } from "effect";

export class ActionRecord extends Schema.Class<ActionRecord>("ActionRecord")({
  type: Schema.String,
  ref: Schema.optional(Schema.String),
  value: Schema.optional(Schema.String),
  url: Schema.String,
  timestamp: Schema.Number,
}) {}

export class LoopDetection extends Schema.Class<LoopDetection>("LoopDetection")({
  detected: Schema.Boolean,
  loopType: Schema.String,
  confidence: Schema.Number,
}) {}

export class Nudge extends Schema.Class<Nudge>("Nudge")({
  severity: Schema.Literals(["info", "warning", "critical"] as const),
  message: Schema.String,
}) {}

export class LoopDetector extends ServiceMap.Service<LoopDetector, {
  readonly record: (action: ActionRecord) => Effect.Effect<void>;
  readonly detectLoop: Effect.Effect<LoopDetection>;
  readonly getNudge: Effect.Effect<Nudge>;
  readonly reset: Effect.Effect<void>;
}>()("@inspect/LoopDetector") {
  static layer = Layer.effect(this, 
    Effect.gen(function* () {
      const actions: ActionRecord[] = [];
      const hashes = new Map<string, number>();
      let repetitionCount = 0;

      const record = Effect.fn("LoopDetector.record")(function* (action: ActionRecord) {
        actions.push(action);
        const hash = `${action.type}:${action.ref ?? ""}:${action.url}`;
        hashes.set(hash, (hashes.get(hash) ?? 0) + 1);
        repetitionCount = hashes.get(hash) ?? 0;
      });

      const detectLoop = Effect.sync((): LoopDetection => {
        if (repetitionCount >= 3) {
          return new LoopDetection({
            detected: true,
            loopType: repetitionCount >= 10 ? "stuck" : "repetitive",
            confidence: Math.min(0.5 + repetitionCount * 0.1, 0.95),
          });
        }
        return new LoopDetection({ detected: false, loopType: "none", confidence: 0 });
      });

      const getNudge = Effect.sync((): Nudge => {
        if (repetitionCount >= 10) return new Nudge({ severity: "critical", message: "Agent is stuck — consider aborting" });
        if (repetitionCount >= 5) return new Nudge({ severity: "warning", message: "Repeated action detected — try a different approach" });
        return new Nudge({ severity: "info", message: "" });
      });

      const reset = Effect.sync(() => {
        actions.length = 0;
        hashes.clear();
        repetitionCount = 0;
      });

      return { record, detectLoop, getNudge, reset } as const;
    }),
  );
}
