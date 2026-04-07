// ──────────────────────────────────────────────────────────────────────────────
// @inspect/workflow - Workflow engine and execution
// ──────────────────────────────────────────────────────────────────────────────

// Core Types
export {
  WorkflowTriggerType,
  CronTriggerConfig,
  WebhookTriggerConfig,
  GitPushTriggerConfig,
  ManualTriggerConfig,
  OnFailureTriggerConfig,
  WorkflowTriggerConfig,
  WorkflowTrigger,
  WorkflowDevice,
  WorkflowAgent,
  QualityAuditType,
  QualityAudit,
  WorkflowSchedule,
  WorkflowJob,
  WorkflowRunStatus,
  DeviceResult,
  AgentResult,
  AuditResult,
  WorkflowRun,
  type WorkflowTriggerType as WorkflowTriggerTypeT,
  type WorkflowDevice as WorkflowDeviceT,
  type WorkflowAgent as WorkflowAgentT,
  type QualityAuditType as QualityAuditTypeT,
  type QualityAudit as QualityAuditT,
  type WorkflowRunStatus as WorkflowRunStatusT,
  type DeviceResult as DeviceResultT,
  type AgentResult as AgentResultT,
  type AuditResult as AuditResultT,
} from "./workflow-types.js";

// Errors
export {
  WorkflowNotFoundError,
  WorkflowTriggerError,
  WorkflowExecutionError,
  InvalidCronExpressionError,
  WorkflowAlreadyRunningError,
} from "./workflow-errors.js";

// Services
export { WorkflowTriggerManager } from "./trigger-service.js";
export { WorkflowScheduler } from "./scheduler-service.js";
export { WorkflowExecutor } from "./executor-service.js";

// Engine
export {
  WorkflowExecutor as WorkflowEngine,
  type WorkflowEventHandler,
  type BlockClassInstances,
} from "./engine/executor.js";
export { WorkflowContext } from "./engine/context.js";
export {
  WorkflowScheduler as EngineScheduler,
  type ScheduledWorkflow,
  type ScheduleCallback,
} from "./engine/scheduler.js";

// Chains
export {
  type TestAction,
  type ChainStep,
  type ChainActionStep,
  type ChainConditionalStep,
  type ChainLoopStep,
  type ChainSubchainStep,
  type ChainParallelStep,
  type ChainInput,
  type ChainOutput,
  type Chain,
  type ChainExecutionContext,
  type ChainExecutionResult,
} from "./chains/chain-types.js";
export { ChainRegistry } from "./chains/chain-registry.js";
export { ChainExecutor } from "./chains/chain-executor.js";

// Builder
export {
  createBlock,
  chainBlocks,
  BLOCK_TEMPLATES,
  buildWorkflow,
  workflowToYaml,
} from "./builder/workflow-builder.js";

// Copilot
export { ActionObserver, type RecordedAction, type ObserverState } from "./copilot/observer.js";
export { WorkflowGenerator, type WorkflowLLM, type BlockSuggestion } from "./copilot/generator.js";

// Cron Parser
export { isValid as isValidCron, parse as parseCron, nextRun } from "./cron-parser.js";

// Block Executors
export { executeProxyBlock } from "./blocks/proxy.js";
export { executeTrackBlock } from "./blocks/track.js";
export { executeCrawlBlock } from "./blocks/crawl.js";
export { executeBenchmarkBlock } from "./blocks/benchmark.js";

// Block Classes
export { FileUploadBlock, type FileUploadResult } from "./blocks/file-upload.js";
export { FileDownloadBlock, type FileDownloadResult } from "./blocks/file-download.js";
export { TextPromptBlock, type TextPromptResult } from "./blocks/text-prompt.js";
export { WaitBlock, type WaitResult } from "./blocks/wait.js";
export { ValidationBlock, type ValidationResult } from "./blocks/validate.js";
export { TaskBlock, type TaskBlockResult } from "./blocks/task.js";
export {
  HumanInteractionBlock,
  type HumanInteractionRequest,
  type HumanInputField,
  type HumanInteractionResponse,
  type HumanBlockResult,
} from "./blocks/human.js";
export { FileParserBlock, type FileParseResult } from "./blocks/file-parser.js";
export {
  DataExtractionBlock,
  type ExtractionSchema,
  type ExtractionResult,
} from "./blocks/extract.js";
export { SendEmailBlock, type EmailResult, type SMTPConfig } from "./blocks/email.js";
