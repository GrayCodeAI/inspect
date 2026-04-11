import { Schema } from "effect";

export class ComponentMountError extends Schema.ErrorClass<ComponentMountError>(
  "ComponentMountError",
)({
  _tag: Schema.tag("ComponentMountError"),
  component: Schema.String,
  framework: Schema.String,
  cause: Schema.optional(Schema.String),
}) {
  message = `Failed to mount component ${this.component} (${this.framework})${this.cause ? `: ${this.cause}` : ""}`;
}

export class ComponentInteractionError extends Schema.ErrorClass<ComponentInteractionError>(
  "ComponentInteractionError",
)({
  _tag: Schema.tag("ComponentInteractionError"),
  action: Schema.String,
  selector: Schema.String,
  cause: Schema.optional(Schema.String),
}) {
  message = `Interaction "${this.action}" failed on selector "${this.selector}"${this.cause ? `: ${this.cause}` : ""}`;
}

export class ComponentAssertionError extends Schema.ErrorClass<ComponentAssertionError>(
  "ComponentAssertionError",
)({
  _tag: Schema.tag("ComponentAssertionError"),
  assertion: Schema.String,
  expected: Schema.String,
  actual: Schema.String,
}) {
  message = `Assertion "${this.assertion}" failed: expected ${this.expected}, got ${this.actual}`;
}

export class FrameworkDetectionError extends Schema.ErrorClass<FrameworkDetectionError>(
  "FrameworkDetectionError",
)({
  _tag: Schema.tag("FrameworkDetectionError"),
  url: Schema.String,
  cause: Schema.optional(Schema.String),
}) {
  message = `Failed to detect framework on ${this.url}${this.cause ? `: ${this.cause}` : ""}`;
}

export class SnapshotMismatchError extends Schema.ErrorClass<SnapshotMismatchError>(
  "SnapshotMismatchError",
)({
  _tag: Schema.tag("SnapshotMismatchError"),
  component: Schema.String,
  diff: Schema.String,
}) {
  message = `Snapshot mismatch for ${this.component}: ${this.diff}`;
}
