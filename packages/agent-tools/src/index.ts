// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent-tools - Agent tools and utilities
// ──────────────────────────────────────────────────────────────────────────────

export {
  TokenTracker,
  SensitiveDataMasker,
  ToolDefinition,
  ToolCall,
  ToolResult,
  ToolRegistry,
  JudgeLLM,
  NLAssert,
  ContextCompactor,
} from "./tools-service.js";

export { ActionRegistry } from "./action-registry.js";

// Loop detection
export { ActionLoopDetector } from "./loop/action-loop.js";
export { LoopDetector, type ActionRecord } from "./loop/detector.js";
