import { Schema } from "effect";

export const VisualTestStepType = Schema.Literals([
  "navigate",
  "click",
  "type",
  "select",
  "scroll",
  "hover",
  "wait",
  "assert",
  "screenshot",
  "extract",
] as const);
export type VisualTestStepType = typeof VisualTestStepType.Type;

export class VisualTestStep extends Schema.Class<VisualTestStep>("VisualTestStep")({
  id: Schema.String,
  type: VisualTestStepType,
  target: Schema.optional(Schema.String),
  value: Schema.optional(Schema.String),
  assertion: Schema.optional(Schema.String),
  timeout: Schema.optional(Schema.Number),
  screenshotBefore: Schema.optional(Schema.Boolean),
  screenshotAfter: Schema.optional(Schema.Boolean),
  description: Schema.optional(Schema.String),
}) {}

export class VisualTestCase extends Schema.Class<VisualTestCase>("VisualTestCase")({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  url: Schema.String,
  steps: Schema.Array(VisualTestStep),
  tags: Schema.optional(Schema.Array(Schema.String)),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
}) {}

export class VisualTestSuite extends Schema.Class<VisualTestSuite>("VisualTestSuite")({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  cases: Schema.optional(Schema.Array(Schema.String)),
  baseUrl: Schema.String,
  createdAt: Schema.Number,
}) {}

export const TestResultStatus = Schema.Literals([
  "passed",
  "failed",
  "skipped",
  "pending",
] as const);
export type TestResultStatus = typeof TestResultStatus.Type;

export class VisualTestResult extends Schema.Class<VisualTestResult>("VisualTestResult")({
  caseId: Schema.String,
  stepId: Schema.String,
  status: TestResultStatus,
  error: Schema.optional(Schema.String),
  screenshot: Schema.optional(Schema.String),
  duration: Schema.optional(Schema.Number),
}) {}
