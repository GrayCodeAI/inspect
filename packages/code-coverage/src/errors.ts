import { Schema } from "effect";

export class CoverageCollectionError extends Schema.ErrorClass<CoverageCollectionError>(
  "CoverageCollectionError",
)({
  _tag: Schema.tag("CoverageCollectionError"),
  reason: Schema.String,
  targetId: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Unknown),
}) {
  message = `Coverage collection failed${this.targetId ? ` for target ${this.targetId}` : ""}: ${this.reason}${this.cause ? ` - ${this.cause}` : ""}`;
}

export class CoverageProcessingError extends Schema.ErrorClass<CoverageProcessingError>(
  "CoverageProcessingError",
)({
  _tag: Schema.tag("CoverageProcessingError"),
  reason: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  message = `Coverage processing failed: ${this.reason}${this.cause ? ` - ${this.cause}` : ""}`;
}

export class CoverageThresholdError extends Schema.ErrorClass<CoverageThresholdError>(
  "CoverageThresholdError",
)({
  _tag: Schema.tag("CoverageThresholdError"),
  metric: Schema.String,
  actual: Schema.Number,
  threshold: Schema.Number,
}) {
  message = `Coverage ${this.metric} (${this.actual.toFixed(2)}%) below threshold (${this.threshold.toFixed(2)}%)`;
}
