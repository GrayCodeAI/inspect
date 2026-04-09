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

// Natural Language Parser
export {
  NLParser,
  createNLParser,
  parseInstruction,
  getSupportedPatterns,
  type ParsedAction,
  type ParseResult,
  type ParserConfig,
  type GrammarPattern,
  type ActionParams,
  type ActionType,
  type ElementDescriptor,
  DEFAULT_PARSER_CONFIG,
} from "./nl-parser/index.js";
