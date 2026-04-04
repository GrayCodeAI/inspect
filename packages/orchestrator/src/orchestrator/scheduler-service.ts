import { Effect, Layer, Schema, ServiceMap } from "effect";

export class ScheduleConfig extends Schema.Class<ScheduleConfig>("ScheduleConfig")({
  maxConcurrent: Schema.Number,
  timeout: Schema.Number,
  retryCount: Schema.Number,
}) {}

export class TestScheduler extends ServiceMap.Service<
  TestScheduler,
  {
    readonly schedule: <A, E>(
      effects: readonly Effect.Effect<A, E>[],
      config: ScheduleConfig,
    ) => Effect.Effect<readonly A[], E>;
  }
>()("@inspect/TestScheduler") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const schedule = Effect.fn("TestScheduler.schedule")(function* <A, E>(
        effects: readonly Effect.Effect<A, E>[],
        config: ScheduleConfig,
      ) {
        yield* Effect.annotateCurrentSpan({
          count: effects.length,
          maxConcurrent: config.maxConcurrent,
        });
        return yield* Effect.all(effects, {
          concurrency: config.maxConcurrent,
          discard: false,
        });
      });
      return { schedule } as const;
    }),
  );
}
