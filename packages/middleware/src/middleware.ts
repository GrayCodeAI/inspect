// ──────────────────────────────────────────────────────────────────────────────
// Middleware Interface and Registry
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { MiddlewareError } from "./errors.js";

export class MiddlewareContext extends Schema.Class<MiddlewareContext>("MiddlewareContext")({
  stage: Schema.String,
  data: Schema.Unknown,
  metadata: Schema.Record(Schema.String, Schema.String),
}) {}

export class MiddlewareResult<T> extends Schema.Class<MiddlewareResult<T>>("MiddlewareResult")({
  success: Schema.Boolean,
  data: Schema.Unknown as Schema.Schema<T, unknown, never>,
  duration: Schema.Number,
  error: Schema.optional(Schema.String),
}) {}

export type MiddlewareFn = (
  ctx: MiddlewareContext,
  next: () => Effect.Effect<MiddlewareContext, MiddlewareError>,
) => Effect.Effect<MiddlewareContext, MiddlewareError>;

export class MiddlewareRegistration extends Schema.Class<MiddlewareRegistration>(
  "MiddlewareRegistration",
)({
  name: Schema.String,
  order: Schema.Number,
  stage: Schema.String,
}) {}

export interface MiddlewareRegistryService {
  readonly use: (
    name: string,
    order: number,
    stage: string,
    fn: MiddlewareFn,
  ) => Effect.Effect<void>;
  readonly getForStage: (stage: string) => Effect.Effect<Array<{ name: string; fn: MiddlewareFn }>>;
  readonly list: Effect.Effect<MiddlewareRegistration[]>;
}

export class MiddlewareRegistry extends ServiceMap.Service<
  MiddlewareRegistry,
  MiddlewareRegistryService
>()("@inspect/MiddlewareRegistry") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const middlewares: Array<{
        name: string;
        order: number;
        stage: string;
        fn: MiddlewareFn;
      }> = [];

      const use = (name: string, order: number, stage: string, fn: MiddlewareFn) =>
        Effect.sync(() => {
          middlewares.push({ name, order, stage, fn });
          middlewares.sort((a, b) => a.order - b.order);
        }).pipe(
          Effect.tap(() =>
            Effect.logInfo("Middleware registered", {
              name,
              stage,
              order,
            }),
          ),
          Effect.withSpan("MiddlewareRegistry.use"),
        );

      const getForStage = (stage: string) =>
        Effect.sync(() =>
          middlewares
            .filter((m) => m.stage === stage || m.stage === "*")
            .map((m) => ({ name: m.name, fn: m.fn })),
        ).pipe(Effect.withSpan("MiddlewareRegistry.getForStage"));

      const list = Effect.sync(() =>
        middlewares.map(
          (m) =>
            new MiddlewareRegistration({
              name: m.name,
              order: m.order,
              stage: m.stage,
            }),
        ),
      ).pipe(Effect.withSpan("MiddlewareRegistry.list"));

      return { use, getForStage, list } as const;
    }),
  );
}
