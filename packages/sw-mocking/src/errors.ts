// ──────────────────────────────────────────────────────────────────────────────
// SW Mocking Errors
// ──────────────────────────────────────────────────────────────────────────────

import { Schema } from "effect";

export class SWMockingError extends Schema.ErrorClass<SWMockingError>("SWMockingError")({
  _tag: Schema.tag("SWMockingError"),
  scope: Schema.optional(Schema.String),
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  get displayMessage(): string {
    return `Service Worker mocking error${this.scope ? ` (${this.scope})` : ""}: ${this.message}`;
  }
}
