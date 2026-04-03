import { Schema } from "effect";

export class SandboxExecutionError extends Schema.ErrorClass<SandboxExecutionError>(
  "SandboxExecutionError",
)({
  _tag: Schema.tag("SandboxExecutionError"),
  code: Schema.String,
  exitCode: Schema.Number,
  stderr: Schema.String,
}) {
  message = `Sandbox execution failed with exit code ${this.exitCode}: ${this.stderr}`;
}

export class SandboxTimeoutError extends Schema.ErrorClass<SandboxTimeoutError>(
  "SandboxTimeoutError",
)({
  _tag: Schema.tag("SandboxTimeoutError"),
  runtime: Schema.String,
  timeout: Schema.Number,
}) {
  message = `Sandbox execution timed out after ${this.timeout}ms for runtime: ${this.runtime}`;
}

export class SandboxResourceLimitError extends Schema.ErrorClass<SandboxResourceLimitError>(
  "SandboxResourceLimitError",
)({
  _tag: Schema.tag("SandboxResourceLimitError"),
  resource: Schema.String,
  limit: Schema.Number,
  actual: Schema.Number,
}) {
  message = `Sandbox exceeded ${this.resource} limit: ${this.actual} > ${this.limit}`;
}

export class RuntimeNotFoundError extends Schema.ErrorClass<RuntimeNotFoundError>(
  "RuntimeNotFoundError",
)({
  _tag: Schema.tag("RuntimeNotFoundError"),
  runtime: Schema.String,
}) {
  message = `Runtime not found: ${this.runtime}`;
}

export class InvalidConfigError extends Schema.ErrorClass<InvalidConfigError>("InvalidConfigError")(
  {
    _tag: Schema.tag("InvalidConfigError"),
    reason: Schema.String,
  },
) {
  message = `Invalid sandbox configuration: ${this.reason}`;
}
