/**
 * Agent Loop Module - Phase 1 Development
 *
 * This module will contain:
 * - Real agent loop with observe → think → act → finalize phases
 * - LLM integration with retry/fallback
 * - Message manager with compaction
 * - History tracking and replay
 *
 * Currently provides basic type exports for compilation.
 * Full implementation in Phase 1: Weeks 2-10
 */

// Brain/structured thinking (implemented)
export {
  AgentBrain,
  ActionEvaluation,
  MemoryEntry,
  FlashBrain,
  NUDGE_TYPES,
  ESCALATING_NUDGES,
  PLANNING_NUDGE,
  getNudgeForRepetition,
  type NudgeType,
  type NudgeConfig,
} from "./brain.js";

// History & trajectory (implemented as Schema classes)
export {
  AgentHistoryList,
  AgentHistoryEntry,
  ModelOutput,
  BrowserState,
  StepMetadata,
} from "./history.js";

// Runtime state (placeholder)
export {
  AgentRuntimeState,
  type AgentState,
  type ActionResult,
  type LoopDetectorState,
  type MessageManagerState,
} from "./state.js";

// Compatibility exports (to be fully implemented in Phase 1)
export type AgentConfig = {
  maxSteps?: number;
  maxFailures?: number;
  model?: string;
  temperature?: number;
  stepTimeout?: number;
};
export type AgentAction = { type: string; params: Record<string, unknown> };
export type AgentOutput = unknown;
export type Observation = { type: string; content: string; timestamp: number };
export type LLMProvider = any;
export type ActionRecord = any;

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxSteps: 50,
  maxFailures: 5,
  model: "claude-3-sonnet",
  temperature: 0.7,
  stepTimeout: 5000,
};

export class AgentLoop {
  constructor(_config?: Partial<AgentConfig>) {}
  run() { return Promise.resolve(); }
}
