import { Schema } from "effect";

export class ProxyError extends Schema.ErrorClass<ProxyError>("ProxyError")({
  _tag: Schema.tag("ProxyError"),
  proxyUrl: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Proxy error for ${this.proxyUrl}`;
}

export class ProxyPoolExhaustedError extends Schema.ErrorClass<ProxyPoolExhaustedError>(
  "ProxyPoolExhaustedError",
)({
  _tag: Schema.tag("ProxyPoolExhaustedError"),
  poolSize: Schema.Number,
  failedAttempts: Schema.Number,
}) {
  message = `Proxy pool exhausted: ${this.failedAttempts} failed attempts out of ${this.poolSize} proxies`;
}

export class ProxyHealthCheckError extends Schema.ErrorClass<ProxyHealthCheckError>(
  "ProxyHealthCheckError",
)({
  _tag: Schema.tag("ProxyHealthCheckError"),
  proxyUrl: Schema.String,
  latency: Schema.Number,
  cause: Schema.Unknown,
}) {
  message = `Health check failed for ${this.proxyUrl} (latency: ${this.latency}ms)`;
}

export class ProxyProviderError extends Schema.ErrorClass<ProxyProviderError>("ProxyProviderError")(
  {
    _tag: Schema.tag("ProxyProviderError"),
    provider: Schema.String,
    cause: Schema.Unknown,
  },
) {
  message = `Proxy provider ${this.provider} failed`;
}
