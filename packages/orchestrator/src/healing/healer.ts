// ──────────────────────────────────────────────────────────────────────────────
// @inspect/core - Self-Healing Selector Recovery
//
// Re-exports healing functionality from @inspect/agent-memory
// and adds orchestration-level integration.
// ──────────────────────────────────────────────────────────────────────────────

export {
  SelfHealer,
  type HealResult,
  type HealCandidate,
  type ElementDescription,
  type SnapshotElement,
} from "@inspect/agent-memory";

// Re-export for backward compatibility
export { SelfHealingNotImplementedError } from "./errors.js";
