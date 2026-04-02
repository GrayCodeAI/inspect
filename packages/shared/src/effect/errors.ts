import { Cause, Schema } from "effect";

export class InspectError extends Schema.ErrorClass<InspectError>("InspectError")({
  _tag: Schema.tag("InspectError"),
  code: Schema.String,
  context: Schema.Unknown,
}) {
  message = `Inspect error: ${this.code}`;
}

export class BrowserError extends Schema.ErrorClass<BrowserError>("BrowserError")({
  _tag: Schema.tag("BrowserError"),
  browser: Schema.String,
  page: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  cause: Schema.Unknown,
}) {
  message = `Browser operation failed in ${this.browser}`;
}

export class NavigationError extends Schema.ErrorClass<NavigationError>("NavigationError")({
  _tag: Schema.tag("NavigationError"),
  browser: Schema.String,
  url: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Navigation failed: ${this.url}`;
}

export class ElementNotFoundError extends Schema.ErrorClass<ElementNotFoundError>(
  "ElementNotFoundError",
)({
  _tag: Schema.tag("ElementNotFoundError"),
  browser: Schema.String,
  selector: Schema.String,
  pageUrl: Schema.String,
}) {
  message = `Element not found: ${this.selector} on ${this.pageUrl}`;
}

export class AgentError extends Schema.ErrorClass<AgentError>("AgentError")({
  _tag: Schema.tag("AgentError"),
  agent: Schema.String,
  step: Schema.Number,
  action: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Agent error at step ${this.step}: ${this.action}`;
}

export class ConfigError extends Schema.ErrorClass<ConfigError>("ConfigError")({
  _tag: Schema.tag("ConfigError"),
  key: Schema.String,
  value: Schema.Unknown,
  reason: Schema.String,
}) {
  message = `Config error for key "${this.key}": ${this.reason}`;
}

export class CookieReadError extends Schema.ErrorClass<CookieReadError>("CookieReadError")({
  _tag: Schema.tag("CookieReadError"),
  browser: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Failed to read cookies from ${this.browser}`;
}

export class CookieDatabaseNotFoundError extends Schema.ErrorClass<CookieDatabaseNotFoundError>(
  "CookieDatabaseNotFoundError",
)({
  _tag: Schema.tag("CookieDatabaseNotFoundError"),
  browser: Schema.String,
}) {
  message = `Cookie database not found for ${this.browser}`;
}

export class LLMProviderError extends Schema.ErrorClass<LLMProviderError>("LLMProviderError")({
  _tag: Schema.tag("LLMProviderError"),
  provider: Schema.String,
  model: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `LLM provider ${this.provider}/${this.model} failed`;
}

export class RateLimitError extends Schema.ErrorClass<RateLimitError>("RateLimitError")({
  _tag: Schema.tag("RateLimitError"),
  provider: Schema.String,
  model: Schema.String,
  retryAfter: Schema.Number,
}) {
  message = `Rate limited by ${this.provider}/${this.model}, retry after ${this.retryAfter}ms`;
}

export class TokenBudgetExceededError extends Schema.ErrorClass<TokenBudgetExceededError>(
  "TokenBudgetExceededError",
)({
  _tag: Schema.tag("TokenBudgetExceededError"),
  agent: Schema.String,
  used: Schema.Number,
  limit: Schema.Number,
}) {
  message = `Token budget exceeded: ${this.used}/${this.limit}`;
}

export class LoopDetectedError extends Schema.ErrorClass<LoopDetectedError>("LoopDetectedError")({
  _tag: Schema.tag("LoopDetectedError"),
  agent: Schema.String,
  actionHash: Schema.String,
  repetitions: Schema.Number,
}) {
  message = `Loop detected: action ${this.actionHash} repeated ${this.repetitions} times`;
}

export class TimeoutError extends Schema.ErrorClass<TimeoutError>("TimeoutError")({
  _tag: Schema.tag("TimeoutError"),
  operation: Schema.String,
  timeoutMs: Schema.Number,
}) {
  message = `Operation "${this.operation}" timed out after ${this.timeoutMs}ms`;
}

export class SchemaValidationError extends Schema.ErrorClass<SchemaValidationError>(
  "SchemaValidationError",
)({
  _tag: Schema.tag("SchemaValidationError"),
  parseError: Schema.Unknown,
}) {
  message = `Schema validation failed`;
}

export class TestError extends Schema.ErrorClass<TestError>("TestError")({
  _tag: Schema.tag("TestError"),
  stepId: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Test failed at step ${this.stepId}`;
}

export class WorkflowError extends Schema.ErrorClass<WorkflowError>("WorkflowError")({
  _tag: Schema.tag("WorkflowError"),
  workflowId: Schema.String,
  reason: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Workflow error in ${this.workflowId}: ${this.reason}`;
}

export class CredentialError extends Schema.ErrorClass<CredentialError>("CredentialError")({
  _tag: Schema.tag("CredentialError"),
  credentialId: Schema.String,
  reason: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Credential error for ${this.credentialId}: ${this.reason}`;
}

export class NetworkError extends Schema.ErrorClass<NetworkError>("NetworkError")({
  _tag: Schema.tag("NetworkError"),
  url: Schema.String,
  statusCode: Schema.optional(Schema.Number),
  cause: Schema.Unknown,
}) {
  message = `Network error accessing ${this.url}`;
}

export function prettyCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  try {
    return Cause.pretty(Cause.fail(cause));
  } catch {
    return String(cause);
  }
}

export function hasStringMessage(cause: unknown): cause is { message: string } {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof (cause as { message: string }).message === "string"
  );
}
