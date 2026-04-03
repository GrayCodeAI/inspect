import { Schema } from "effect";

export class WorkflowNotFoundError extends Schema.ErrorClass<WorkflowNotFoundError>(
  "WorkflowNotFoundError",
)({
  _tag: Schema.tag("WorkflowNotFoundError"),
  workflowId: Schema.String,
}) {
  message = `Workflow not found: ${this.workflowId}`;
}

export class WorkflowTriggerError extends Schema.ErrorClass<WorkflowTriggerError>(
  "WorkflowTriggerError",
)({
  _tag: Schema.tag("WorkflowTriggerError"),
  triggerId: Schema.String,
  cause: Schema.String,
}) {
  message = `Trigger error for ${this.triggerId}: ${this.cause}`;
}

export class WorkflowExecutionError extends Schema.ErrorClass<WorkflowExecutionError>(
  "WorkflowExecutionError",
)({
  _tag: Schema.tag("WorkflowExecutionError"),
  workflowId: Schema.String,
  runId: Schema.String,
  cause: Schema.String,
}) {
  message = `Execution error for workflow ${this.workflowId} run ${this.runId}: ${this.cause}`;
}

export class InvalidCronExpressionError extends Schema.ErrorClass<InvalidCronExpressionError>(
  "InvalidCronExpressionError",
)({
  _tag: Schema.tag("InvalidCronExpressionError"),
  expression: Schema.String,
}) {
  message = `Invalid cron expression: ${this.expression}`;
}

export class WorkflowAlreadyRunningError extends Schema.ErrorClass<WorkflowAlreadyRunningError>(
  "WorkflowAlreadyRunningError",
)({
  _tag: Schema.tag("WorkflowAlreadyRunningError"),
  workflowId: Schema.String,
}) {
  message = `Workflow ${this.workflowId} is already running`;
}
