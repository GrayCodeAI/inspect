import { Schema } from "effect";

export class SecurityModeError extends Schema.ErrorClass<SecurityModeError>(
  "SecurityModeError",
)({
  _tag: Schema.tag("SecurityModeError"),
  mode: Schema.String,
  reason: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Security mode "${this.mode}" error: ${this.reason}`;
}

export class PolicyViolationError extends Schema.ErrorClass<PolicyViolationError>(
  "PolicyViolationError",
)({
  _tag: Schema.tag("PolicyViolationError"),
  policy: Schema.String,
  action: Schema.String,
  details: Schema.Unknown,
}) {
  message = `Policy violation: "${this.policy}" disallows "${this.action}"`;
}

export class SandboxResourceExceededError extends Schema.ErrorClass<SandboxResourceExceededError>(
  "SandboxResourceExceededError",
)({
  _tag: Schema.tag("SandboxResourceExceededError"),
  resource: Schema.String,
  limit: Schema.Number,
  used: Schema.Number,
}) {
  message = `Sandbox resource "${this.resource}" exceeded: ${this.used}/${this.limit}`;
}

export class UnauthorizedAccessError extends Schema.ErrorClass<UnauthorizedAccessError>(
  "UnauthorizedAccessError",
)({
  _tag: Schema.tag("UnauthorizedAccessError"),
  requestedResource: Schema.String,
  requiredPermission: Schema.String,
}) {
  message = `Unauthorized access to "${this.requestedResource}" (requires: ${this.requiredPermission})`;
}

export class RestrictedOperationError extends Schema.ErrorClass<RestrictedOperationError>(
  "RestrictedOperationError",
)({
  _tag: Schema.tag("RestrictedOperationError"),
  operation: Schema.String,
  restriction: Schema.String,
}) {
  message = `Operation "${this.operation}" is restricted: ${this.restriction}`;
}
