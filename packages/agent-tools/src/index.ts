// @inspect/agent-tools — Tool registry, custom tools, validators, judge, token tracking
// Split from @inspect/agent to follow Single Responsibility Principle

export {
  ToolRegistry,
  type ToolHandler,
  type ToolParameterSchema,
  type ToolResult,
  type RegisteredTool,
} from "./tools/registry.js";

export {
  CustomTools,
  type CustomToolDefinition,
  type CustomToolParameter,
  type SkillReference,
} from "./tools/custom.js";

export { BaseTool, type ToolMetadata } from "./tools/base.js";

export {
  toolAction,
  toolProvider,
  registerDecoratedTools,
  type ToolActionMetadata,
  type DecoratedMethod,
} from "./tools/decorators.js";

export { ToolValidator, type ValidationError, type ValidationResult } from "./tools/validator.js";

export { NLAssert, type AssertionContext, type AssertionResult } from "./tools/nl-assert.js";

export { TokenTracker } from "./tools/token-tracker.js";
export type { TokenBudget, TokenUsageEntry, TokenSummary } from "./tools/token-tracker.js";

export { SensitiveDataMasker } from "./tools/sensitive-masker.js";

export { JudgeLLM } from "./tools/judge.js";
export type { JudgeInput, JudgeVerdict } from "./tools/judge.js";

export { UserToolRegistry, defineTool } from "./tools/user-tools.js";
export type { UserToolDefinition } from "./tools/user-tools.js";

// Loop detection and action loops
export {
  LoopDetector,
  ActionLoopDetector,
  StallDetector,
  type ActionRecord,
  type LoopDetection,
  type LoopNudge,
  type ActionLoopConfig,
  type ActionLoopNudge,
  type ReplanConfig,
  type ReplanResult,
} from "./loop/index.js";
