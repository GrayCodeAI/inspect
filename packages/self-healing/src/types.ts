import { Schema } from "effect";

export const ElementSnapshot = Schema.Struct({
  tagName: Schema.String,
  id: Schema.optional(Schema.String),
  classNames: Schema.Array(Schema.String),
  attributes: Schema.Record(Schema.String, Schema.String),
  textContent: Schema.optional(Schema.String),
  xpath: Schema.String,
  cssSelector: Schema.String,
  boundingBox: Schema.Struct({
    x: Schema.Number,
    y: Schema.Number,
    width: Schema.Number,
    height: Schema.Number,
  }),
});
export type ElementSnapshot = typeof ElementSnapshot.Type;

export const HealedSelector = Schema.Struct({
  originalSelector: Schema.String,
  healedSelector: Schema.String,
  confidence: Schema.Number, // 0-1 score
  strategy: Schema.String, // e.g., "similar-text", "nearby-element", "visual-similarity"
  elementSnapshot: ElementSnapshot,
  timestamp: Schema.Number,
});
export type HealedSelector = typeof HealedSelector.Type;

export const HealingStrategy = Schema.Union([
  Schema.Literal("text-content"),
  Schema.Literal("attributes"),
  Schema.Literal("visual-position"),
  Schema.Literal("dom-hierarchy"),
  Schema.Literal("ai-semantic"),
]);
export type HealingStrategy = typeof HealingStrategy.Type;

export interface HealingOptions {
  readonly strategies: HealingStrategy[];
  readonly minConfidence: number; // Minimum confidence to accept healed selector (0-1)
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  readonly saveSnapshots: boolean;
}

export const defaultHealingOptions: HealingOptions = {
  strategies: ["text-content", "attributes", "dom-hierarchy"],
  minConfidence: 0.7,
  maxAttempts: 3,
  timeoutMs: 5000,
  saveSnapshots: true,
};

export interface SelectorHistory {
  readonly selector: string;
  readonly snapshots: ElementSnapshot[];
  readonly healings: HealedSelector[];
  readonly lastUsed: number;
  readonly successCount: number;
  readonly failureCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Extended Types for Advanced Self-Healing
// ═══════════════════════════════════════════════════════════════════════════════

/** Heal candidate from matching strategies */
export interface HealCandidate {
  ref: string;
  role: string;
  name: string;
  tagName?: string;
  confidence: number;
  strategy: HealingStrategy;
  distance?: number;
  attributes?: Record<string, string>;
  textContent?: string;
}

/** Element description for matching */
export interface ElementDescription {
  role: string;
  name: string;
  tagName?: string;
  nearbyText?: string;
  attributes?: Record<string, string>;
  xpath?: string;
  cssPath?: string;
}

/** Page snapshot for healing */
export interface PageSnapshot {
  url: string;
  title: string;
  elements: Array<{
    ref: string;
    role: string;
    name: string;
    tagName?: string;
    textContent?: string;
    interactive?: boolean;
    attributes?: Record<string, string>;
    parentRef?: string;
    xpath?: string;
  }>;
  timestamp: number;
}

/** Healing configuration */
export interface HealingConfig {
  minConfidence: number;
  maxTimeMs: number;
  enableVision: boolean;
  enableAnchors: boolean;
  maxCandidates: number;
  autoAcceptThreshold: number;
  useLLM: boolean;
}

/** Healing result */
export interface HealingResult {
  success: boolean;
  candidate?: HealCandidate;
  allCandidates: HealCandidate[];
  elapsed: number;
  method?: string;
}

/** Recovery playbook entry */
export interface RecoveryPlaybookEntry {
  errorPattern: RegExp;
  strategy: RecoveryAction;
  priority: number;
  description: string;
}

export type RecoveryAction =
  | "retry"
  | "refresh"
  | "wait-and-retry"
  | "alternative-selector"
  | "scroll-into-view"
  | "dismiss-overlay"
  | "accept-consent"
  | "login-redirect";

/** Healing statistics */
export interface HealingStats {
  totalAttempts: number;
  successfulHeals: number;
  failedHeals: number;
  successRate: number;
  avgHealingTime: number;
  byStrategy: Record<string, { attempts: number; successes: number }>;
}
