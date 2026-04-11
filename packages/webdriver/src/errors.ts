import { Schema } from "effect";

export class WebDriverError extends Schema.ErrorClass<WebDriverError>("WebDriverError")({
  _tag: Schema.tag("WebDriverError"),
  command: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `WebDriver error executing "${this.command}": ${String(this.cause)}`;
}

export class SessionError extends Schema.ErrorClass<SessionError>("SessionError")({
  _tag: Schema.tag("SessionError"),
  sessionId: Schema.optional(Schema.String),
  reason: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `WebDriver session error: ${this.reason}`;
}

export class ElementNotFoundError extends Schema.ErrorClass<ElementNotFoundError>(
  "ElementNotFoundError",
)({
  _tag: Schema.tag("ElementNotFoundError"),
  strategy: Schema.String,
  selector: Schema.String,
  sessionId: Schema.optional(Schema.String),
}) {
  message = `Element not found using ${this.strategy}: ${this.selector}`;
}

export class NavigationError extends Schema.ErrorClass<NavigationError>("NavigationError")({
  _tag: Schema.tag("NavigationError"),
  url: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Navigation failed for ${this.url}`;
}

export class TimeoutError extends Schema.ErrorClass<TimeoutError>("TimeoutError")({
  _tag: Schema.tag("TimeoutError"),
  operation: Schema.String,
  timeoutMs: Schema.Number,
}) {
  message = `WebDriver operation "${this.operation}" timed out after ${this.timeoutMs}ms`;
}
