import { Schema } from "effect";

export const SandboxRuntime = Schema.Literals(["node", "python", "bash"] as const);
export type SandboxRuntime = typeof SandboxRuntime.Type;

export class SandboxConfig extends Schema.Class<SandboxConfig>("SandboxConfig")({
  runtime: SandboxRuntime,
  timeout: Schema.Number,
  maxMemory: Schema.Number,
  maxCpu: Schema.Number,
  env: Schema.Record(Schema.String, Schema.String),
  cwd: Schema.String,
  allowedModules: Schema.Array(Schema.String),
}) {}

export class SandboxResult extends Schema.Class<SandboxResult>("SandboxResult")({
  stdout: Schema.String,
  stderr: Schema.String,
  exitCode: Schema.Number,
  duration: Schema.Number,
  memoryUsed: Schema.Number,
  timedOut: Schema.Boolean,
}) {}
