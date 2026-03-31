// ──────────────────────────────────────────────────────────────────────────────
// @inspect/core - Healing Strategies
//
// Defines the 8 healing strategies used by the self-healing test engine.
// Integrates with the recovery manager for cascading fallback.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Healing strategies ordered by cost (cheapest first).
 */
export enum HealingStrategy {
  /** Find element by visible text content */
  TEXT_MATCH = "text_match",
  /** Find by ARIA role + label */
  ARIA_ROLE = "aria_role",
  /** Vision-based element location via LLM */
  VISUAL_LOCATE = "visual_locate",
  /** Relative XPath from stable ancestor */
  XPATH_RELATIVE = "xpath_relative",
  /** Similar CSS selector */
  CSS_SIMILAR = "css_similar",
  /** Locate via nearby stable element */
  NEIGHBOR_ANCHOR = "neighbor_anchor",
  /** Match by purpose/semantics */
  SEMANTIC_MATCH = "semantic_match",
  /** Complete page re-analysis */
  FULL_RESCAN = "full_rescan",
}

/** Result of a healing attempt */
export interface HealingAttemptResult {
  success: boolean;
  strategy: HealingStrategy;
  newSelector?: string;
  newRef?: string;
  confidence: number;
  elapsed: number;
}

/**
 * Map healing strategies from SelfHealer's method names to HealingStrategy enum.
 */
export function mapMethodToStrategy(method: string): HealingStrategy {
  switch (method) {
    case "exact":
      return HealingStrategy.ARIA_ROLE;
    case "semantic":
      return HealingStrategy.SEMANTIC_MATCH;
    case "fuzzy":
      return HealingStrategy.TEXT_MATCH;
    case "vision":
      return HealingStrategy.VISUAL_LOCATE;
    case "css-similar":
      return HealingStrategy.CSS_SIMILAR;
    case "neighbor-anchor":
      return HealingStrategy.NEIGHBOR_ANCHOR;
    default:
      return HealingStrategy.FULL_RESCAN;
  }
}
