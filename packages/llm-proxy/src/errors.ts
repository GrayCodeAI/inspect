// ──────────────────────────────────────────────────────────────────────────────
// LLM Proxy Errors
// ──────────────────────────────────────────────────────────────────────────────

import { Schema } from "effect";

export class LLMProxyError extends Schema.ErrorClass<LLMProxyError>("LLMProxyError")({
  _tag: Schema.tag("LLMProxyError"),
  reason: Schema.String,
  provider: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Unknown),
}) {
  get message() {
    return this.provider
      ? `LLM Proxy error (${this.provider}): ${this.reason}`
      : `LLM Proxy error: ${this.reason}`;
  }
}
