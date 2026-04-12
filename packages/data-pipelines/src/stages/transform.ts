// ──────────────────────────────────────────────────────────────────────────────
// Transform Stage
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Schema } from "effect";
import { PipelineError } from "../errors.js";

export class TransformConfig extends Schema.Class<TransformConfig>("TransformConfig")({
  name: Schema.String,
  mapping: Schema.Record(Schema.String, Schema.String),
  filterFn: Schema.optional(Schema.String),
}) {}

export const transformFields = (mapping: Record<string, string>) => {
  return (input: Record<string, unknown>) =>
    Effect.sync(() => {
      const output: Record<string, unknown> = {};
      for (const [from, to] of Object.entries(mapping)) {
        if (from in input) {
          output[to] = input[from];
        }
      }
      return { ...input, ...output };
    }).pipe(
      Effect.matchEffect({
        onSuccess: (result) => Effect.succeed(result),
        onFailure: (cause) =>
          Effect.fail(
            new PipelineError({
              message: `Field transformation failed: ${String(cause)}`,
              stage: "transform",
              cause,
            }),
          ),
      }),
      Effect.withSpan("stages.transformFields"),
    );
};

export const transformWith = <I, O>(fn: (input: I) => O) => {
  return (input: I) =>
    Effect.sync(() => fn(input)).pipe(
      Effect.matchEffect({
        onSuccess: (result) => Effect.succeed(result),
        onFailure: (cause) =>
          Effect.fail(
            new PipelineError({
              message: `Custom transformation failed: ${String(cause)}`,
              stage: "transform",
              cause,
            }),
          ),
      }),
      Effect.withSpan("stages.transformWith"),
    );
};

export const filterWith = <T>(predicate: (item: T) => boolean) => {
  return (items: T[]) =>
    Effect.sync(() => items.filter(predicate)).pipe(Effect.withSpan("stages.filterWith"));
};

export const normalizeUrls = (input: string[]) =>
  Effect.sync(() => {
    return input.map((url) => {
      let normalized = url.trim().toLowerCase();
      if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
        normalized = `https://${normalized}`;
      }
      return normalized;
    });
  }).pipe(
    Effect.matchEffect({
      onSuccess: (result) => Effect.succeed(result),
      onFailure: (cause) =>
        Effect.fail(
          new PipelineError({
            message: `URL normalization failed: ${String(cause)}`,
            stage: "transform",
            cause,
          }),
        ),
    }),
    Effect.withSpan("stages.normalizeUrls"),
  );
