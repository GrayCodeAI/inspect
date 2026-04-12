// ──────────────────────────────────────────────────────────────────────────────
// BDD Interface Errors
// ──────────────────────────────────────────────────────────────────────────────

import { Schema } from "effect";

export class BddExecutionError extends Schema.ErrorClass<BddExecutionError>("BddExecutionError")({
  _tag: Schema.tag("BddExecutionError"),
  suite: Schema.optional(Schema.String),
  test: Schema.optional(Schema.String),
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  get displayMessage(): string {
    return `BDD execution error: ${this.message}${this.suite ? ` (suite: ${this.suite})` : ""}`;
  }
}

export class BddAssertionError extends Schema.ErrorClass<BddAssertionError>("BddAssertionError")({
  _tag: Schema.tag("BddAssertionError"),
  expected: Schema.optional(Schema.Unknown),
  actual: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {
  get displayMessage(): string {
    return `Assertion failed: ${this.message}`;
  }
}
