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
} from "./types.js";

export {
  SelectorNotFoundError,
  HealingFailedError,
  InvalidSelectorError,
  ElementSnapshotError,
} from "./errors.js";
