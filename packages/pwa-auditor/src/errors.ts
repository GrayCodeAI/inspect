// ──────────────────────────────────────────────────────────────────────────────
// PWA Auditor Errors
// ──────────────────────────────────────────────────────────────────────────────

import { Schema } from "effect";

export class PWAAuditError extends Schema.ErrorClass<PWAAuditError>("PWAAuditError")({
  _tag: Schema.tag("PWAAuditError"),
  check: Schema.optional(Schema.String),
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  get displayMessage(): string {
    return `PWA audit error${this.check ? ` (${this.check})` : ""}: ${this.message}`;
  }
}
