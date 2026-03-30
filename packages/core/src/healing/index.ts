// ──────────────────────────────────────────────────────────────────────────────
// @inspect/core - Healing Module
//
// Self-healing test engine with 8 strategies, DOM diffing, and learning.
// Re-exports SelfHealer from @inspect/agent with core-level orchestration.
// ──────────────────────────────────────────────────────────────────────────────

export {
  SelfHealer,
  type HealResult,
  type HealCandidate,
  type ElementDescription,
  type SnapshotElement,
} from "./healer.js";
export { HealingStrategy, type HealingAttemptResult, mapMethodToStrategy } from "./strategies.js";
export { DOMDiffer, type DOMChange, type DOMDiffResult } from "./dom-differ.js";
