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
