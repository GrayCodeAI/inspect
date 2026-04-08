// ──────────────────────────────────────────────────────────────────────────────
// Self-Healing Errors
// ──────────────────────────────────────────────────────────────────────────────

export class SelfHealingNotImplementedError extends Error {
  readonly _tag = "SelfHealingNotImplementedError";
  constructor(readonly brokenSelector: string) {
    super(
      `Self-healing for selector "${brokenSelector}" is not implemented. ` +
        `Connect an LLM-based selector recovery service to enable automatic healing.`,
    );
  }
}

export class HealingFailedError extends Error {
  readonly _tag = "HealingFailedError";
  constructor(
    readonly originalSelector: string,
    readonly reason: string,
  ) {
    super(`Failed to heal selector "${originalSelector}": ${reason}`);
  }
}

export class NoHealingCandidatesError extends Error {
  readonly _tag = "NoHealingCandidatesError";
  constructor(readonly originalSelector: string) {
    super(`No healing candidates found for selector "${originalSelector}"`);
  }
}
