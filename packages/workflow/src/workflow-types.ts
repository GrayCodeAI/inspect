import { Schema } from "effect";

export const WorkflowTriggerType = Schema.Literals([
  "cron",
  "webhook",
  "git-push",
  "manual",
  "on-failure",
] as const);
export type WorkflowTriggerType = typeof WorkflowTriggerType.Type;

export const CronTriggerConfig = Schema.Struct({
  type: Schema.Literal("cron"),
  cronExpression: Schema.String,
  timezone: Schema.String,
});

export const WebhookTriggerConfig = Schema.Struct({
  type: Schema.Literal("webhook"),
  webhookUrl: Schema.String,
  secret: Schema.optional(Schema.String),
});

export const GitPushTriggerConfig = Schema.Struct({
  type: Schema.Literal("git-push"),
  branch: Schema.String,
  repository: Schema.optional(Schema.String),
});

export const ManualTriggerConfig = Schema.Struct({
  type: Schema.Literal("manual"),
});

export const OnFailureTriggerConfig = Schema.Struct({
  type: Schema.Literal("on-failure"),
  failedJobId: Schema.String,
});

export const WorkflowTriggerConfig = Schema.Union([
  CronTriggerConfig,
  WebhookTriggerConfig,
  GitPushTriggerConfig,
  ManualTriggerConfig,
  OnFailureTriggerConfig,
]);

export class WorkflowTrigger extends Schema.Class<WorkflowTrigger>("WorkflowTrigger")({
  id: Schema.String,
  type: WorkflowTriggerType,
  config: WorkflowTriggerConfig,
  enabled: Schema.Boolean,
  lastFired: Schema.optional(Schema.Number),
  createdAt: Schema.Number,
}) {}

export const WorkflowDevice = Schema.Struct({
  name: Schema.String,
  viewport: Schema.Struct({
    width: Schema.Number,
    height: Schema.Number,
  }),
  userAgent: Schema.optional(Schema.String),
});
export type WorkflowDevice = typeof WorkflowDevice.Type;

export const WorkflowAgent = Schema.Struct({
  id: Schema.String,
  provider: Schema.String,
  model: Schema.optional(Schema.String),
  instructions: Schema.optional(Schema.String),
});
export type WorkflowAgent = typeof WorkflowAgent.Type;

export const QualityAuditType = Schema.Literals([
  "accessibility",
  "lighthouse",
  "security",
  "visual-regression",
  "performance",
] as const);
export type QualityAuditType = typeof QualityAuditType.Type;

export const QualityAudit = Schema.Struct({
  type: QualityAuditType,
  enabled: Schema.Boolean,
  thresholds: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
});
export type QualityAudit = typeof QualityAudit.Type;

export class WorkflowSchedule extends Schema.Class<WorkflowSchedule>("WorkflowSchedule")({
  cron: Schema.String,
  timezone: Schema.String,
  enabled: Schema.Boolean,
  nextRun: Schema.optional(Schema.Number),
  lastRun: Schema.optional(Schema.Number),
}) {}

export class WorkflowJob extends Schema.Class<WorkflowJob>("WorkflowJob")({
  id: Schema.String,
  name: Schema.String,
  url: Schema.String,
  devices: Schema.Array(WorkflowDevice),
  agents: Schema.Array(WorkflowAgent),
  qualityAudits: Schema.Array(QualityAudit),
  schedule: Schema.optional(WorkflowSchedule),
  timeout: Schema.Number,
  retries: Schema.Number,
  createdAt: Schema.Number,
}) {}

export const WorkflowRunStatus = Schema.Literals([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "timed-out",
] as const);
export type WorkflowRunStatus = typeof WorkflowRunStatus.Type;

export const DeviceResult = Schema.Struct({
  deviceName: Schema.String,
  status: WorkflowRunStatus,
  duration: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
  artifacts: Schema.optional(Schema.Array(Schema.String)),
});
export type DeviceResult = typeof DeviceResult.Type;

export const AgentResult = Schema.Struct({
  agentId: Schema.String,
  status: WorkflowRunStatus,
  stepsExecuted: Schema.optional(Schema.Number),
  duration: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
});
export type AgentResult = typeof AgentResult.Type;

export const AuditResult = Schema.Struct({
  type: QualityAuditType,
  score: Schema.optional(Schema.Number),
  passed: Schema.Boolean,
  violations: Schema.optional(Schema.Array(Schema.String)),
  duration: Schema.optional(Schema.Number),
});
export type AuditResult = typeof AuditResult.Type;

export class WorkflowRun extends Schema.Class<WorkflowRun>("WorkflowRun")({
  id: Schema.String,
  jobId: Schema.String,
  trigger: Schema.optional(WorkflowTrigger),
  status: WorkflowRunStatus,
  startedAt: Schema.Number,
  completedAt: Schema.optional(Schema.Number),
  results: Schema.Struct({
    devices: Schema.Array(DeviceResult),
    agents: Schema.Array(AgentResult),
    audits: Schema.Array(AuditResult),
  }),
  duration: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
}) {
  get isComplete(): boolean {
    return (
      this.status === "completed" ||
      this.status === "failed" ||
      this.status === "cancelled" ||
      this.status === "timed-out"
    );
  }
}
