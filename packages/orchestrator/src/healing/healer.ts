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

export class SelfHealingNotImplementedError extends Error {
  readonly _tag = "SelfHealingNotImplementedError";
  constructor(readonly brokenSelector: string) {
    super(
      `Self-healing for selector "${brokenSelector}" is not implemented. ` +
        `Connect an LLM-based selector recovery service to enable automatic healing.`,
    );
  }
}

export class SelfHealer {
  heal(brokenSelector: string, _snapshot: SnapshotElement[]): HealResult {
    throw new SelfHealingNotImplementedError(brokenSelector);
  }
}
