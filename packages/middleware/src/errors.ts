// ──────────────────────────────────────────────────────────────────────────────
// Middleware Errors
// ──────────────────────────────────────────────────────────────────────────────

import { Schema } from "effect";

export class MiddlewareError extends Schema.ErrorClass<MiddlewareError>("MiddlewareError")({
  _tag: Schema.tag("MiddlewareError"),
  middleware: Schema.optional(Schema.String),
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  get displayMessage(): string {
    return `Middleware error${this.middleware ? ` (${this.middleware})` : ""}: ${this.message}`;
  }
}
