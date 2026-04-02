// ──────────────────────────────────────────────────────────────────────────────
// @inspect/core - Self-Healing Selector Recovery
//
// Re-exports healing types from @inspect/agent and adds core-level
// healing orchestration that integrates with the recovery manager.
// ──────────────────────────────────────────────────────────────────────────────

// SelfHealer is not exported from @inspect/agent - define local stub
export type HealResult = {
  readonly success: boolean;
  readonly originalSelector: string;
  readonly healedSelector?: string;
  readonly score?: number;
};

export type HealCandidate = {
  readonly selector: string;
  readonly score: number;
  readonly description?: string;
};

export type ElementDescription = {
  readonly tag: string;
  readonly text?: string;
  readonly attributes: Record<string, string>;
};

export type SnapshotElement = {
  readonly ref: number;
  readonly role?: string;
  readonly name?: string;
  readonly description?: string;
};

// Place SelfHealer stub that does nothing
export class SelfHealer {
  heal(_brokenSelector: string, _snapshot: SnapshotElement[]): HealResult {
    return { success: false, originalSelector: _brokenSelector };
  }
}
