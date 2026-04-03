import { Schema } from "effect";

export const AgentRole = Schema.Literals([
  "tester",
  "security",
  "a11y",
  "performance",
  "ux",
  "orchestrator",
] as const);
export type AgentRole = typeof AgentRole.Type;

export class AgentConfig extends Schema.Class<AgentConfig>("AgentConfig")({
  name: Schema.String,
  role: AgentRole,
  model: Schema.String,
  systemPrompt: Schema.String,
  tools: Schema.Array(Schema.String),
  maxSteps: Schema.Number,
}) {}

export const TaskStatus = Schema.Literals([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
] as const);
export type TaskStatus = typeof TaskStatus.Type;

export class AgentTask extends Schema.Class<AgentTask>("AgentTask")({
  id: Schema.String,
  description: Schema.String,
  assignedTo: Schema.optional(Schema.String),
  status: TaskStatus,
  result: Schema.optional(Schema.String),
  createdAt: Schema.Date,
}) {}

export const MessageType = Schema.Literals([
  "request",
  "response",
  "broadcast",
  "handoff",
] as const);
export type MessageType = typeof MessageType.Type;

export class AgentMessage extends Schema.Class<AgentMessage>("AgentMessage")({
  from: Schema.String,
  to: Schema.String,
  content: Schema.String,
  timestamp: Schema.Date,
  type: MessageType,
}) {}

export const AgentResultStatus = Schema.Literals(["success", "failure", "timeout"] as const);
export type AgentResultStatus = typeof AgentResultStatus.Type;

export class AgentResult extends Schema.Class<AgentResult>("AgentResult")({
  taskId: Schema.String,
  agent: Schema.String,
  status: AgentResultStatus,
  output: Schema.String,
  duration: Schema.Number,
  tokenCount: Schema.Number,
}) {}
