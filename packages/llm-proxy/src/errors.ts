// ──────────────────────────────────────────────────────────────────────────────
// LLM Proxy Errors
// ──────────────────────────────────────────────────────────────────────────────

import { Schema } from "effect";

export class LLMProxyError extends Schema.ErrorClass<LLMProxyError>("LLMProxyError")({
  _tag: Schema.tag("LLMProxyError"),
  message: Schema.String,
  provider: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Unknown),
}) {
  message = this.provider
    ? `LLM Proxy error (${this.provider}): ${this.message}`
    : `LLM Proxy error: ${this.message}`;
}
