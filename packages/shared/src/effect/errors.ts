import { Cause, Schema } from "effect";

export class InspectError extends Schema.ErrorClass<InspectError>("InspectError")({
  _tag: Schema.tag("InspectError"),
  message: Schema.String,
}) {}

export class BrowserError extends Schema.ErrorClass<BrowserError>("BrowserError")({
  _tag: Schema.tag("BrowserError"),
  message: Schema.String,
  cause: Schema.Unknown,
}) {
  displayName = `Browser operation failed`;
}

export class AgentError extends Schema.ErrorClass<AgentError>("AgentError")({
  _tag: Schema.tag("AgentError"),
  message: Schema.String,
  cause: Schema.Unknown,
}) {
  displayName = `Agent operation failed`;
}

export class TestError extends Schema.ErrorClass<TestError>("TestError")({
  _tag: Schema.tag("TestError"),
  message: Schema.String,
  cause: Schema.Unknown,
}) {
  displayName = `Test execution failed`;
}

export class ConfigError extends Schema.ErrorClass<ConfigError>("ConfigError")({
  _tag: Schema.tag("ConfigError"),
  message: Schema.String,
  path: Schema.optional(Schema.String),
}) {
  displayName = `Configuration error`;
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
  return typeof cause === "object" && cause !== null && "message" in cause && typeof (cause as { message: string }).message === "string";
}
