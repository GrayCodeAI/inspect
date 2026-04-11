// ──────────────────────────────────────────────────────────────────────────────
// Validation Stage
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Schema } from "effect";
import { PipelineError, ValidationError } from "../errors.js";

export class ValidationSchema extends Schema.Class<ValidationSchema>("ValidationSchema")({
  name: Schema.String,
  schemaDef: Schema.Unknown,
}) {}

export const validateSchema = (
  schemaName: string,
  schemaDef: Schema.Schema<unknown, unknown, never>,
) => {
  return (input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decode(schemaDef)(input).pipe(
        Effect.catchTag("SchemaError", (err) =>
          Effect.fail(
            new ValidationError({
              message: `Schema validation failed: ${err.message}`,
              schema: schemaName,
              value: input,
            }),
          ),
        ),
      );

      yield* Effect.logDebug("Schema validation passed", {
        schema: schemaName,
      });

      return decoded;
    }).pipe(
      Effect.catchTag("ValidationError", (err) =>
        Effect.fail(
          new PipelineError({
            message: `Validation stage failed: ${err.message}`,
            stage: "validate",
            cause: err,
          }),
        ),
      ),
      Effect.withSpan("stages.validateSchema"),
    );
};

export const validateRequiredFields = (fields: string[]) => {
  return (input: Record<string, unknown>) =>
    Effect.gen(function* () {
      const missing = fields.filter((field) => !(field in input));

      if (missing.length > 0) {
        return yield* new ValidationError({
          message: `Missing required fields: ${missing.join(", ")}`,
          field: missing[0],
          value: input,
        });
      }

      return input;
    }).pipe(
      Effect.catchTag("ValidationError", (err) =>
        Effect.fail(
          new PipelineError({
            message: `Required fields validation failed: ${err.message}`,
            stage: "validate",
            cause: err,
          }),
        ),
      ),
      Effect.withSpan("stages.validateRequiredFields"),
    );
};
