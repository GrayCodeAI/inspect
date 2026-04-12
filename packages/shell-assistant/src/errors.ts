// ──────────────────────────────────────────────────────────────────────────────
// Shell Assistant Errors
// ──────────────────────────────────────────────────────────────────────────────

import { Schema } from "effect";

export class ShellExecutionError extends Schema.ErrorClass<ShellExecutionError>(
  "ShellExecutionError",
)({
  _tag: Schema.tag("ShellExecutionError"),
  command: Schema.String,
  exitCode: Schema.optional(Schema.Number),
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  get displayMessage(): string {
    return `Command failed (${this.command}): ${this.message}`;
  }
}

export class SafetyCheckError extends Schema.ErrorClass<SafetyCheckError>("SafetyCheckError")({
  _tag: Schema.tag("SafetyCheckError"),
  command: Schema.String,
  violation: Schema.String,
  message: Schema.String,
}) {
  get displayMessage(): string {
    return `Safety check failed: ${this.message} (command: ${this.command})`;
  }
}
