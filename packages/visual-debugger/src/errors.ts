import { Schema } from "effect";

export class VisualDebuggerError extends Schema.ErrorClass<VisualDebuggerError>(
  "VisualDebuggerError",
)({
  _tag: Schema.tag("VisualDebuggerError"),
  component: Schema.String,
  operation: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Visual debugger error in ${this.component} during ${this.operation}`;
}

export class DagParseError extends Schema.ErrorClass<DagParseError>("DagParseError")({
  _tag: Schema.tag("DagParseError"),
  source: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Failed to parse DAG from ${this.source}`;
}

export class DagRenderError extends Schema.ErrorClass<DagRenderError>("DagRenderError")({
  _tag: Schema.tag("DagRenderError"),
  format: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Failed to render DAG as ${this.format}`;
}

export class BreakpointError extends Schema.ErrorClass<BreakpointError>("BreakpointError")({
  _tag: Schema.tag("BreakpointError"),
  stepId: Schema.String,
  reason: Schema.String,
}) {
  message = `Breakpoint error at step ${this.stepId}: ${this.reason}`;
}
