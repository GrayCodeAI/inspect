// Core package - main entry point
// Re-exports all public APIs from sub-modules

export { TestExecutor } from "./orchestrator/executor.js";
export type { ExecutionConfig, ExecutionResult, ExecutionProgress } from "./orchestrator/executor.js";

export { TestScheduler } from "./orchestrator/scheduler.js";
export type { SchedulerConfig, ScheduledRun } from "./orchestrator/scheduler.js";

export { RecoveryManager } from "./orchestrator/recovery.js";
export type { FailureType, RecoveryStrategy, DiagnosisResult } from "./orchestrator/recovery.js";

export { GitManager } from "./git/git.js";

export { Fingerprint } from "./git/fingerprint.js";

export { ContextBuilder } from "./git/context.js";
export type { GitContext, ContextLimits } from "./git/context.js";

export { GitHubPR } from "./github/pr.js";
export type { PRInfo, PRDiff } from "./github/pr.js";

export { PRComments } from "./github/comments.js";
export type { CommentPayload, StatusPayload } from "./github/comments.js";

export { DevicePresets, getPreset, listPresets } from "./devices/presets.js";
export type { DeviceConfig } from "./devices/presets.js";

export { DevicePool } from "./devices/pool.js";
export type { DeviceRunResult } from "./devices/pool.js";
