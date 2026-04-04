import { Effect, Layer, Schema, ServiceMap } from "effect";

export class Checkpoint extends Schema.Class<Checkpoint>("Checkpoint")({
  id: Schema.String,
  stepIndex: Schema.Number,
  state: Schema.Unknown,
  timestamp: Schema.Number,
}) {}

export class CheckpointManager extends ServiceMap.Service<
  CheckpointManager,
  {
    readonly save: (stepIndex: number, state: unknown) => Effect.Effect<Checkpoint>;
    readonly restore: (id: string) => Effect.Effect<Checkpoint | undefined>;
    readonly list: Effect.Effect<readonly Checkpoint[]>;
    readonly clear: Effect.Effect<void>;
  }
>()("@inspect/CheckpointManager") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const checkpoints: Checkpoint[] = [];

      const save = Effect.fn("CheckpointManager.save")(function* (
        stepIndex: number,
        state: unknown,
      ) {
        const checkpoint = new Checkpoint({
          id: `cp-${Date.now()}-${stepIndex}`,
          stepIndex,
          state,
          timestamp: Date.now(),
        });
        checkpoints.push(checkpoint);
        return checkpoint;
      });

      const restore = Effect.fn("CheckpointManager.restore")(function* (id: string) {
        return checkpoints.find((c) => c.id === id);
      });

      const list = Effect.sync(() => [...checkpoints] as const);
      const clear = Effect.sync(() => {
        checkpoints.length = 0;
      });

      return { save, restore, list, clear } as const;
    }),
  );
}
