// ──────────────────────────────────────────────────────────────────────────────
// Cloud Grid Errors
// ──────────────────────────────────────────────────────────────────────────────

import { Schema } from "effect";

export class CloudGridError extends Schema.ErrorClass<CloudGridError>("CloudGridError")({
  _tag: Schema.tag("CloudGridError"),
  provider: Schema.optional(Schema.String),
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  get displayMessage(): string {
    return `Cloud grid error (${this.provider ?? "unknown"}): ${this.message}`;
  }
}

export class SessionNotFoundError extends Schema.ErrorClass<SessionNotFoundError>(
  "SessionNotFoundError",
)({
  _tag: Schema.tag("SessionNotFoundError"),
  sessionId: Schema.String,
}) {
  message = `Session not found: ${this.sessionId}`;
}
