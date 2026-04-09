// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent-tools - Natural Language Parser
// Parses browser automation instructions into structured actions
// ──────────────────────────────────────────────────────────────────────────────

// Types
export type {
  ParsedAction,
  ParseResult,
  ParserConfig,
  GrammarPattern,
  ActionParams,
  ActionType,
  AssertionType,
  ElementDescriptor,
  ExtractedEntity,
  EntityType,
  ParameterExtractor,
} from "./types.js";
export { DEFAULT_PARSER_CONFIG } from "./types.js";

// Parser
export { NLParser, createNLParser, parseInstruction, getSupportedPatterns } from "./parser.js";

// Grammar patterns
export {
  clickPatterns,
  typePatterns,
  selectPatterns,
  navigationPatterns,
  scrollPatterns,
  waitPatterns,
  keyboardPatterns,
  hoverPatterns,
  assertPatterns,
  filePatterns,
  dragDropPatterns,
  tabPatterns,
  allPatterns,
  getPatternsByPriority,
  getPatternsByType,
  getSupportedActionTypes,
  getPatternCount,
} from "./grammar.js";
