// ──────────────────────────────────────────────────────────────────────────────
// Data Pipeline Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { PipelineError } from "./errors.js";

export type StageFn<I, O> = (input: I) => Effect.Effect<O, PipelineError>;

export class PipelineStage extends Schema.Class<PipelineStage>("PipelineStage")({
  name: Schema.String,
  order: Schema.Number,
}) {
  declare readonly execute: StageFn<unknown, unknown>;
}

export class PipelineConfig extends Schema.Class<PipelineConfig>("PipelineConfig")({
  name: Schema.String,
  stages: Schema.Array(Schema.String),
  batchSize: Schema.Number,
}) {}

export class PipelineResult extends Schema.Class<PipelineResult>("PipelineResult")({
  success: Schema.Boolean,
  data: Schema.Unknown,
  duration: Schema.Number,
  stagesCompleted: Schema.Array(Schema.String),
  error: Schema.optional(Schema.String),
}) {}

export interface PipelineService {
  readonly addStage: <I, O>(name: string, order: number, fn: StageFn<I, O>) => Effect.Effect<void>;
  readonly execute: <T>(input: T) => Effect.Effect<PipelineResult, PipelineError>;
  readonly getStages: Effect.Effect<string[]>;
}

export class DataPipeline extends ServiceMap.Service<DataPipeline, PipelineService>()(
  "@inspect/DataPipeline",
) {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const stages = new Map<string, StageFn<unknown, unknown>>();
      const stageOrder: string[] = [];

      const addStage = <I, O>(name: string, order: number, fn: StageFn<I, O>) =>
        Effect.sync(() => {
          stages.set(name, fn as StageFn<unknown, unknown>);
          const insertIndex = stageOrder.findIndex((s) => {
            const stageOrderIndex = stageOrder.indexOf(s);
            const existingStage = stages.get(s);
            return existingStage !== undefined && stageOrderIndex >= order;
          });
          if (insertIndex >= 0) {
            stageOrder.splice(insertIndex, 0, name);
          } else {
            stageOrder.push(name);
          }
        }).pipe(
          Effect.tap(() => Effect.logDebug("Pipeline stage added", { name, order })),
          Effect.withSpan("DataPipeline.addStage"),
        );

      const execute = <T>(input: T) =>
        Effect.gen(function* () {
          const startTime = Date.now();
          let current: unknown = input;
          const completed: string[] = [];

          for (const stageName of stageOrder) {
            const stageFn = stages.get(stageName);
            if (!stageFn) {
              return yield* new PipelineError({
                message: `Stage not found: ${stageName}`,
                stage: stageName,
              });
            }

            yield* Effect.logDebug("Executing pipeline stage", {
              stage: stageName,
              pipeline: "data-pipeline",
            });

            current = yield* (stageFn(current) as Effect.Effect<unknown, PipelineError>).pipe(
              Effect.catchTag("PipelineError", (err) =>
                Effect.fail(
                  new PipelineError({
                    message: `Stage "${stageName}" failed: ${err.message}`,
                    stage: stageName,
                    cause: err.cause,
                  }),
                ),
              ),
            );

            completed.push(stageName);
          }

          const duration = Date.now() - startTime;

          yield* Effect.logInfo("Pipeline execution completed", {
            pipeline: "data-pipeline",
            stagesCompleted: completed.length,
            duration,
          });

          return new PipelineResult({
            success: true,
            data: current,
            duration,
            stagesCompleted: completed,
          });
        }).pipe(Effect.withSpan("DataPipeline.execute"));

      const getStages = Effect.sync(() => [...stageOrder]);

      return { addStage, execute, getStages } as const;
    }),
  );
}
