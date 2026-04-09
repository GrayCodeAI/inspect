// ──────────────────────────────────────────────────────────────────────────────
// @inspect/self-healing - Self-healing selector service
// ──────────────────────────────────────────────────────────────────────────────

export { type SelectorHistoryEntry, SelfHealingService } from "./self-healing-service.js";

export {
  ElementSnapshot,
  type ElementSnapshot as ElementSnapshotT,
  HealedSelector,
  type HealedSelector as HealedSelectorT,
  HealingStrategy,
  type HealingStrategy as HealingStrategyT,
  type HealingOptions,
  defaultHealingOptions,
  type SelectorHistory,
  // Extended types
  type HealCandidate,
  type ElementDescription,
  type PageSnapshot,
  type HealingConfig,
  type HealingResult,
  type HealingStats,
  type HealingEvent,
  type RecoveryAction,
  type RecoveryPlaybookEntry,
  DEFAULT_HEALING_CONFIG,
} from "./types.js";

export {
  SelectorNotFoundError,
  HealingFailedError,
  InvalidSelectorError,
  ElementSnapshotError,
} from "./errors.js";

// New healing service
export {
  SelfHealingService as AdvancedSelfHealingService,
  createSelfHealingService,
  findExactMatch,
  findSemanticMatches,
  findByAnchor,
  getRecoveryStrategy,
  executeRecovery,
} from "./healing-service.js";

// Strategies
export { findExactTextMatch, findById, findByClass } from "./strategies/exact-match.js";

export { findFuzzyMatches, findPartialMatches } from "./strategies/semantic-match.js";

export { extractAnchors } from "./strategies/anchor-match.js";

// Recovery
export { defaultRecoveryPlaybook, createCustomPlaybook } from "./recovery-playbook.js";
