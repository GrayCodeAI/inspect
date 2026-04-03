import { Schema } from "effect";

export class AgentNotFoundError extends Schema.ErrorClass<AgentNotFoundError>("AgentNotFoundError")(
  {
    _tag: Schema.tag("AgentNotFoundError"),
    agentName: Schema.String,
  },
) {
  message = `Agent not found: ${this.agentName}`;
}

export class TaskNotFoundError extends Schema.ErrorClass<TaskNotFoundError>("TaskNotFoundError")({
  _tag: Schema.tag("TaskNotFoundError"),
  taskId: Schema.String,
}) {
  message = `Task not found: ${this.taskId}`;
}

export class TaskAlreadyAssignedError extends Schema.ErrorClass<TaskAlreadyAssignedError>(
  "TaskAlreadyAssignedError",
)({
  _tag: Schema.tag("TaskAlreadyAssignedError"),
  taskId: Schema.String,
}) {
  message = `Task already assigned: ${this.taskId}`;
}

export class AgentAlreadyRegisteredError extends Schema.ErrorClass<AgentAlreadyRegisteredError>(
  "AgentAlreadyRegisteredError",
)({
  _tag: Schema.tag("AgentAlreadyRegisteredError"),
  agentName: Schema.String,
}) {
  message = `Agent already registered: ${this.agentName}`;
}
