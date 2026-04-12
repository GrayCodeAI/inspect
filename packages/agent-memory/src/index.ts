// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent-memory - Agent memory management
// ──────────────────────────────────────────────────────────────────────────────

export { AgentMemoryService } from "./agent-memory-service.js";
export { MessageManager, TodoTracker, PatternStore } from "./memory-service.js";
export { ContextCompactor } from "./context-compactor.js";

// ActionCache — the canonical disk-backed cache class
export { ActionCache, type ActionCacheConfig, type CachedAction } from "./cache/action-cache.js";

// Self-healing selector recovery
export {
  SelfHealer,
  type HealResult,
  type HealCandidate,
  type ElementDescription,
  type SnapshotElement,
} from "./cache/healing.js";
