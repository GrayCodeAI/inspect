// ============================================================================
// @inspect/workflow - Workflow Automation Package
// ============================================================================

// Engine
export { WorkflowExecutor } from "./engine/executor.js";
export type { WorkflowEventHandler } from "./engine/executor.js";
export { WorkflowScheduler } from "./engine/scheduler.js";
export type { ScheduledWorkflow, ScheduleCallback } from "./engine/scheduler.js";
export { WorkflowContext } from "./engine/context.js";

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
