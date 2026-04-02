// Orchestrator exports - avoid duplicates between implementation and service files
// Core schemas and types (from implementation files)
export {
  FailureType, RecoveryStrategy, DiagnosisResult, RecoveryAttempt,
  RecoveryManager, type RecoveryExecutors
} from "./recovery.js";
export { SpeculativePlanner, SpeculativePlan, SpeculativeStats } from "./speculative.js";

// Service-layer exports
export { TestExecutor, ExecutionConfig, ExecutionResult, ExecutionProgress, StepPlan, StepResult, AdversarialFinding } from "./executor-service.js";
export { RecoveryManager as RecoveryManagerService } from "./recovery-service.js";
export { CheckpointManager } from "./checkpoint-service.js";
export { TestScheduler } from "./scheduler-service.js";
export { DiffRunner } from "./diff-runner-service.js";
export { AdversarialExecutor } from "./adversarial-service.js";

// Other modules without duplicates
export * from "./checkpoint.js";
export * from "./dashboard.js";
export * from "./prompts.js";
export * from "./scheduler.js";
export * from "./tools.js";
export * from "./loop-detector-service.js";
