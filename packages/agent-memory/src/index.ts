// @inspect/agent-memory — Short-term, long-term memory, compaction, pattern store
// Split from @inspect/agent to follow Single Responsibility Principle

export { MessageManager, type MessageManagerOptions } from "./memory/short-term.js";
export { LongTermMemory, type LearnedPattern, type MemoryEntry } from "./memory/long-term.js";
export {
  ContextCompactor,
  type CompactionOptions,
  type CompactionResult,
} from "./memory/compaction.js";
export { MessageCompactor, type CompactorConfig } from "./memory/compactor.js";
export { PatternStore } from "./memory/pattern-store.js";
export type { LearnedPattern as StoredPattern } from "./memory/pattern-store.js";

export { ActionCache, type ActionCacheConfig, type CachedAction } from "./cache/action-cache.js";
export {
  SelfHealer,
  type HealResult,
  type HealCandidate,
  type ElementDescription,
  type SnapshotElement,
} from "./cache/healing.js";
