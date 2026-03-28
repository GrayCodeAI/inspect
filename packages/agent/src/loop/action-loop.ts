// ============================================================================
// @inspect/agent - Action Loop Detector
//
// Tracks recent actions in a rolling window. Detects repetitive patterns
// (same action 3+ times) and generates nudge messages for the LLM.
// Inspired by Browser Use's ActionLoopDetector.
// ============================================================================

import { createHash } from "node:crypto";

export interface LoopDetectorConfig {
  /** Window size for tracking recent actions. Default: 10 */
  windowSize?: number;
  /** Number of repetitions to trigger loop detection. Default: 3 */
  threshold?: number;
  /** Maximum nudges before force-stopping. Default: 2 */
  maxNudges?: number;
}

export interface LoopNudge {
  /** Whether a loop was detected */
  detected: boolean;
  /** Number of times the action was repeated */
  repetitions: number;
  /** The repeated action description */
  repeatedAction?: string;
  /** Nudge message to inject into LLM prompt */
  message?: string;
  /** Whether to force-stop (exceeded maxNudges) */
  forceStop: boolean;
}

/**
 * ActionLoopDetector identifies when the agent is stuck in a loop
 * (e.g., clicking the same button repeatedly without progress).
 *
 * Usage:
 * ```ts
 * const detector = new ActionLoopDetector();
 *
 * // After each action:
 * detector.record("click", "Play button", "https://example.com/lobby");
 * const nudge = detector.check();
 *
 * if (nudge.detected) {
 *   // Inject into LLM prompt: nudge.message
 *   // e.g., "You've clicked 'Play button' 3 times without progress. Try a different approach."
 * }
 *
 * if (nudge.forceStop) {
 *   // Give up on this action
 * }
 * ```
 */
export class ActionLoopDetector {
  private config: Required<LoopDetectorConfig>;
  private actionHashes: string[] = [];
  private actionDescriptions: string[] = [];
  private nudgeCount = 0;

  constructor(config: LoopDetectorConfig = {}) {
    this.config = {
      windowSize: config.windowSize ?? 10,
      threshold: config.threshold ?? 3,
      maxNudges: config.maxNudges ?? 2,
    };
  }

  /**
   * Record an action that was executed.
   */
  record(actionType: string, target: string, url?: string): void {
    const hash = this.hashAction(actionType, target, url);
    this.actionHashes.push(hash);
    this.actionDescriptions.push(`${actionType} "${target}"`);

    // Keep window size
    if (this.actionHashes.length > this.config.windowSize) {
      this.actionHashes.shift();
      this.actionDescriptions.shift();
    }
  }

  /**
   * Check if the agent is stuck in a loop.
   */
  check(): LoopNudge {
    if (this.actionHashes.length < this.config.threshold) {
      return { detected: false, repetitions: 0, forceStop: false };
    }

    // Count occurrences of the most recent action
    const lastHash = this.actionHashes[this.actionHashes.length - 1];
    let count = 0;
    for (const hash of this.actionHashes) {
      if (hash === lastHash) count++;
    }

    if (count >= this.config.threshold) {
      this.nudgeCount++;
      const lastDesc = this.actionDescriptions[this.actionDescriptions.length - 1];

      const forceStop = this.nudgeCount > this.config.maxNudges;

      const messages = [
        `You've attempted "${lastDesc}" ${count} times without progress. The element may not be interactive, or you may need a different approach. Try: navigating elsewhere, scrolling, or looking for an alternative button/link.`,
        `STUCK: "${lastDesc}" repeated ${count} times. STOP trying this action. You MUST try something completely different — a different element, page, or approach.`,
        `FINAL WARNING: You are in a loop on "${lastDesc}". This action does not work. Skip it and move to the next test.`,
      ];

      return {
        detected: true,
        repetitions: count,
        repeatedAction: lastDesc,
        message: messages[Math.min(this.nudgeCount - 1, messages.length - 1)],
        forceStop,
      };
    }

    return { detected: false, repetitions: 0, forceStop: false };
  }

  /**
   * Reset after moving to a new test or recovering.
   */
  reset(): void {
    this.actionHashes = [];
    this.actionDescriptions = [];
    this.nudgeCount = 0;
  }

  /**
   * Get current state for debugging.
   */
  getState(): { windowSize: number; actions: number; nudges: number } {
    return {
      windowSize: this.actionHashes.length,
      actions: this.actionHashes.length,
      nudges: this.nudgeCount,
    };
  }

  private hashAction(type: string, target: string, url?: string): string {
    const input = `${type}|${target.toLowerCase().trim()}|${url ?? ""}`;
    return createHash("md5").update(input).digest("hex").slice(0, 12);
  }
}
