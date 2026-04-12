// ──────────────────────────────────────────────────────────────────────────────
// Pipeline Service (Running Middlewares)
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { MiddlewareError } from "./errors.js";
import { MiddlewareRegistry, MiddlewareContext } from "./middleware.js";

export class PipelineConfig extends Schema.Class<PipelineConfig>("PipelineConfig")({
  name: Schema.String,
  stages: Schema.Array(Schema.String),
}) {}

export class PipelineResult extends Schema.Class<PipelineResult>("PipelineResult")({
  success: Schema.Boolean,
  data: Schema.Unknown,
  stagesCompleted: Schema.Array(Schema.String),
  duration: Schema.Number,
  error: Schema.optional(Schema.String),
}) {}

export interface PipelineService {
  readonly run: (context: MiddlewareContext) => Effect.Effect<PipelineResult, MiddlewareError>;
  readonly runStage: (
    stage: string,
    context: MiddlewareContext,
  ) => Effect.Effect<MiddlewareContext, MiddlewareError>;
}

export class MiddlewarePipeline extends ServiceMap.Service<MiddlewarePipeline, PipelineService>()(
  "@inspect/MiddlewarePipeline",
) {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const registry = yield* MiddlewareRegistry;

      const runStage = (stage: string, context: MiddlewareContext) =>
        Effect.gen(function* () {
          const middlewares = yield* registry.getForStage(stage);

          if (middlewares.length === 0) {
            return context;
          }

          let current = context;

          const executeMiddleware = (
            index: number,
          ): Effect.Effect<MiddlewareContext, MiddlewareError> => {
            if (index >= middlewares.length) {
              return Effect.succeed(current);
            }

            const middleware = middlewares[index];

            return middleware
              .fn(current, () => executeMiddleware(index + 1))
              .pipe(
                Effect.catchTag("MiddlewareError", (err) =>
                  Effect.fail(
                    new MiddlewareError({
                      message: `Middleware "${middleware.name}" failed: ${err.message}`,
                      middleware: middleware.name,
                      cause: err.cause,
                    }),
                  ),
                ),
              );
          };

          current = yield* executeMiddleware(0);

          yield* Effect.logDebug("Pipeline stage completed", {
            stage,
            middlewareCount: middlewares.length,
          });

          return current;
        }).pipe(Effect.withSpan("MiddlewarePipeline.runStage"));

      const run = (context: MiddlewareContext) =>
        Effect.gen(function* () {
          const startTime = Date.now();
          const stagesCompleted: string[] = [];

          let current = context;

          const stages = [...new Set((yield* registry.list).map((m) => m.stage))];

          for (const stage of stages) {
            yield* Effect.logDebug("Running pipeline stage", {
              stage,
              pipeline: "middleware-pipeline",
            });

            current = yield* runStage(stage, current);
            stagesCompleted.push(stage);
          }

          const duration = Date.now() - startTime;

          yield* Effect.logInfo("Pipeline execution completed", {
            stagesCompleted: stagesCompleted.length,
            duration,
          });

          return new PipelineResult({
            success: true,
            data: current.data,
            stagesCompleted,
            duration,
          });
        }).pipe(
          Effect.catchTag("MiddlewareError", (err) =>
            Effect.fail(
              new MiddlewareError({
                message: `Pipeline failed: ${err.message}`,
                cause: err.cause,
              }),
            ),
          ),
          Effect.withSpan("MiddlewarePipeline.run"),
        );

      return { run, runStage } as const;
    }),
  ).pipe(Layer.provide(MiddlewareRegistry.layer));
}
