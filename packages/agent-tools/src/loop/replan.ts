// ============================================================================
// @inspect/agent - Replan on Stall
//
// Detects when the agent has made no meaningful progress for N steps
// and triggers automatic replanning with a different approach.
// Inspired by Browser Use's _inject_replan_nudge.
// ============================================================================

export interface ReplanConfig {
  /** Steps without progress to trigger replan. Default: 3 */
  stallThreshold?: number;
  /** Max replans per session. Default: 2 */
  maxReplans?: number;
}

export interface ReplanResult {
  shouldReplan: boolean;
  reason?: string;
  nudgeMessage?: string;
  replanCount: number;
  forceStop: boolean;
}

/**
 * StallDetector monitors agent progress and triggers replanning.
 *
 * "Progress" is defined as:
 * - URL changed
 * - New elements appeared on page
 * - A step passed (not just attempted)
 * - Data was extracted
 *
 * If none of these happen for N steps, the agent is stalled.
 */
export class StallDetector {
  private config: Required<ReplanConfig>;
  private lastProgressStep = 0;
  private currentStep = 0;
  private replanCount = 0;
  private lastUrl = "";
  private lastElementCount = 0;

  constructor(config: ReplanConfig = {}) {
    this.config = {
      stallThreshold: config.stallThreshold ?? 3,
      maxReplans: config.maxReplans ?? 2,
    };
  }

  /**
   * Record progress indicators after each step.
   */
  recordStep(indicators: {
    stepIndex: number;
    url: string;
    elementCount: number;
    stepPassed: boolean;
    dataExtracted: boolean;
  }): void {
    this.currentStep = indicators.stepIndex;

    const urlChanged = indicators.url !== this.lastUrl;
    const elementsChanged = Math.abs(indicators.elementCount - this.lastElementCount) > 3;
    const madeProgress = urlChanged || elementsChanged || indicators.stepPassed || indicators.dataExtracted;

    if (madeProgress) {
      this.lastProgressStep = this.currentStep;
    }

    this.lastUrl = indicators.url;
    this.lastElementCount = indicators.elementCount;
  }

  /**
   * Check if agent is stalled and needs replanning.
   */
  check(): ReplanResult {
    const stepsWithoutProgress = this.currentStep - this.lastProgressStep;

    if (stepsWithoutProgress < this.config.stallThreshold) {
      return { shouldReplan: false, replanCount: this.replanCount, forceStop: false };
    }

    if (this.replanCount >= this.config.maxReplans) {
      return {
        shouldReplan: false,
        replanCount: this.replanCount,
        forceStop: true,
        reason: `Agent stalled after ${this.config.maxReplans} replanning attempts`,
        nudgeMessage: "STOPPING: Multiple replanning attempts have failed. The task may not be achievable with the current page state.",
      };
    }

    this.replanCount++;
    this.lastProgressStep = this.currentStep; // Reset progress counter

    const messages = [
      `You have made no progress for ${stepsWithoutProgress} steps. Your previous approach is not working. STOP and RETHINK your strategy completely. Consider: navigating to a different page, using a different element, scrolling to find hidden content, or simplifying your goal.`,
      `REPLANNING REQUIRED: ${stepsWithoutProgress} steps with zero progress. Your current strategy has failed. You MUST try a fundamentally different approach — different page, different elements, different sequence. Do NOT repeat any action you've already tried.`,
    ];

    return {
      shouldReplan: true,
      replanCount: this.replanCount,
      forceStop: false,
      reason: `No progress for ${stepsWithoutProgress} steps`,
      nudgeMessage: messages[Math.min(this.replanCount - 1, messages.length - 1)],
    };
  }

  /**
   * Reset detector.
   */
  reset(): void {
    this.lastProgressStep = 0;
    this.currentStep = 0;
    this.replanCount = 0;
    this.lastUrl = "";
    this.lastElementCount = 0;
  }
}
