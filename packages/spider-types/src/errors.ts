// ──────────────────────────────────────────────────────────────────────────────
// Spider Errors
// ──────────────────────────────────────────────────────────────────────────────

import { Schema } from "effect";

export class SpiderError extends Schema.ErrorClass<SpiderError>("SpiderError")({
  _tag: Schema.tag("SpiderError"),
  url: Schema.optional(Schema.String),
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  get displayMessage(): string {
    return `Spider error${this.url ? ` (${this.url})` : ""}: ${this.message}`;
  }
}

export class RobotsTxtError extends Schema.ErrorClass<RobotsTxtError>("RobotsTxtError")({
  _tag: Schema.tag("RobotsTxtError"),
  url: Schema.String,
  disallowed: Schema.Boolean,
}) {
  message = `Access disallowed by robots.txt for: ${this.url}`;
}
