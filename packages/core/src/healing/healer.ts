// ──────────────────────────────────────────────────────────────────────────────
// @inspect/core - Self-Healing Selector Recovery
//
// Re-exports the SelfHealer from @inspect/agent and adds core-level
// healing orchestration that integrates with the recovery manager.
// ──────────────────────────────────────────────────────────────────────────────

export {
  SelfHealer,
  type HealResult,
  type HealCandidate,
  type ElementDescription,
  type SnapshotElement,
} from "@inspect/agent";
