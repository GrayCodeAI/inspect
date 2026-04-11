// ──────────────────────────────────────────────────────────────────────────────
// Data Pipeline Errors
// ──────────────────────────────────────────────────────────────────────────────

import { Schema } from "effect";

export class PipelineError extends Schema.ErrorClass<PipelineError>("PipelineError")({
  _tag: Schema.tag("PipelineError"),
  stage: Schema.optional(Schema.String),
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  get displayMessage(): string {
    return this.message;
  }
}

export class ValidationError extends Schema.ErrorClass<ValidationError>("ValidationError")({
  _tag: Schema.tag("ValidationError"),
  field: Schema.optional(Schema.String),
  value: Schema.optional(Schema.Unknown),
  schema: Schema.optional(Schema.String),
  message: Schema.String,
}) {
  get displayMessage(): string {
    return `Validation failed: ${this.message}${this.field ? ` (field: ${this.field})` : ""}`;
  }
}
