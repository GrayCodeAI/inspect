import { Schema } from "effect";

export class ActionCacheStep extends Schema.Class<ActionCacheStep>("ActionCacheStep")({
  stepIndex: Schema.Number,
  instruction: Schema.String,
  elementId: Schema.optional(Schema.String),
  method: Schema.String,
  selector: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  xpath: Schema.optional(Schema.String),
  actionType: Schema.String,
  timestamp: Schema.Number,
}) {}

export class ActionCache extends Schema.Class<ActionCache>("ActionCache")({
  taskId: Schema.String,
  createdAt: Schema.Number,
  status: Schema.Literals(["pending", "running", "completed", "failed"] as const),
  steps: Schema.Array(ActionCacheStep),
  goal: Schema.String,
}) {}

export class ActionReplayResult extends Schema.Class<ActionReplayResult>("ActionReplayResult")({
  success: Schema.Boolean,
  stepsReplayed: Schema.Number,
  errors: Schema.Array(Schema.String),
  totalDuration: Schema.Number,
}) {}
