// ============================================================================
// @inspect/workflow - Workflow Automation Package
// ============================================================================

// Engine
export { WorkflowExecutor } from "./engine/executor.js";
export type { WorkflowEventHandler } from "./engine/executor.js";
export { WorkflowScheduler } from "./engine/scheduler.js";
export type { ScheduledWorkflow, ScheduleCallback } from "./engine/scheduler.js";
export { WorkflowContext } from "./engine/context.js";

// Workflow orchestration types
export {
  WorkflowTriggerType,
  WorkflowTriggerConfig,
  CronTriggerConfig,
  WebhookTriggerConfig,
  GitPushTriggerConfig,
  ManualTriggerConfig,
  OnFailureTriggerConfig,
  WorkflowDevice,
  WorkflowAgent,
  QualityAuditType,
  QualityAudit,
  WorkflowRunStatus,
  DeviceResult,
  AgentResult,
  AuditResult,
} from "./workflow-types.js";
export { WorkflowTrigger } from "./workflow-types.js";
export { WorkflowSchedule } from "./workflow-types.js";
export { WorkflowJob } from "./workflow-types.js";
export { WorkflowRun } from "./workflow-types.js";
export type { WorkflowTriggerType as WorkflowTriggerTypeType } from "./workflow-types.js";
export type { WorkflowDevice as WorkflowDeviceType } from "./workflow-types.js";
export type { WorkflowAgent as WorkflowAgentType } from "./workflow-types.js";
export type { QualityAuditType as QualityAuditTypeType } from "./workflow-types.js";
export type { QualityAudit as QualityAuditType_ } from "./workflow-types.js";
export type { WorkflowRunStatus as WorkflowRunStatusType } from "./workflow-types.js";
export type { DeviceResult as DeviceResultType } from "./workflow-types.js";
export type { AgentResult as AgentResultType } from "./workflow-types.js";
export type { AuditResult as AuditResultType } from "./workflow-types.js";

// Workflow errors
export {
  WorkflowNotFoundError,
  WorkflowTriggerError,
  WorkflowExecutionError,
  InvalidCronExpressionError,
  WorkflowAlreadyRunningError,
} from "./workflow-errors.js";

// Cron parser
export { parse, nextRun, isValid } from "./cron-parser.js";

// Services
export { WorkflowScheduler as WorkflowSchedulerService } from "./scheduler-service.js";
export { WorkflowTriggerManager } from "./trigger-service.js";
export { WorkflowExecutor as WorkflowExecutorService } from "./executor-service.js";

// Blocks
export { TaskBlock } from "./blocks/task.js";
export type { TaskBlockResult } from "./blocks/task.js";
export { ForLoopBlock } from "./blocks/loop.js";
export type { ForLoopResult, LoopIterationResult } from "./blocks/loop.js";
export { CodeBlock } from "./blocks/code.js";
export type { CodeBlockResult } from "./blocks/code.js";
export { DataExtractionBlock } from "./blocks/extract.js";
export type { ExtractionSchema, ExtractionResult } from "./blocks/extract.js";
export { ValidationBlock } from "./blocks/validate.js";
export type { ValidationResult } from "./blocks/validate.js";
export { HTTPRequestBlock } from "./blocks/http.js";
export type { HTTPResponse } from "./blocks/http.js";
export { SendEmailBlock } from "./blocks/email.js";
export type { EmailResult, SMTPConfig } from "./blocks/email.js";
export { FileParserBlock } from "./blocks/file-parser.js";
export type { FileParseResult } from "./blocks/file-parser.js";
export { WaitBlock } from "./blocks/wait.js";
export type { WaitResult } from "./blocks/wait.js";
export { HumanInteractionBlock } from "./blocks/human.js";
export type {
  HumanInteractionRequest,
  HumanInteractionResponse,
  HumanInputField,
  HumanBlockResult,
} from "./blocks/human.js";

// New blocks (world-class features)
export { executeCrawlBlock } from "./blocks/crawl.js";
export { executeTrackBlock } from "./blocks/track.js";
export { executeProxyBlock } from "./blocks/proxy.js";
export { executeBenchmarkBlock } from "./blocks/benchmark.js";

// Copilot
export { WorkflowGenerator } from "./copilot/generator.js";
export type { WorkflowLLM, BlockSuggestion } from "./copilot/generator.js";
export { ActionObserver } from "./copilot/observer.js";
export type { RecordedAction, ObserverState } from "./copilot/observer.js";

// No-code workflow builder
export {
  buildWorkflow,
  chainBlocks,
  createBlock,
  workflowToYaml,
  BLOCK_TEMPLATES,
} from "./builder/workflow-builder.js";

// Chains
export {
  ChainStep,
  ChainActionStep,
  ChainConditionalStep,
  ChainLoopStep,
  ChainSubchainStep,
  ChainParallelStep,
  ChainInput,
  ChainOutput,
  Chain,
  ChainExecutionContext,
  ChainExecutionResult,
} from "./chains/chain-types.js";
export { ChainExecutor } from "./chains/chain-executor.js";
export { ChainRegistry } from "./chains/chain-registry.js";
