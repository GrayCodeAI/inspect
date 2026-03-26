/**
 * Failure types that the recovery manager can diagnose and handle.
 */
export type FailureType =
  | "element_not_found"
  | "element_not_visible"
  | "element_not_interactable"
  | "navigation_timeout"
  | "page_crash"
  | "network_error"
  | "selector_stale"
  | "captcha_detected"
  | "auth_required"
  | "rate_limited"
  | "unknown";

/**
 * Recovery strategies that can be applied to resolve failures.
 */
export type RecoveryStrategy =
  | "reScan"
  | "useVision"
  | "healSelector"
  | "waitForLoad"
  | "retry"
  | "switchModel"
  | "restart"
  | "scrollIntoView"
  | "dismissOverlay"
  | "refreshPage"
  | "clearState"
  | "skip";

export interface DiagnosisResult {
  failureType: FailureType;
  confidence: number;
  suggestedStrategies: RecoveryStrategy[];
  context: {
    errorMessage: string;
    selector?: string;
    url?: string;
    screenshot?: string;
    domState?: string;
  };
}

interface RecoveryAttempt {
  strategy: RecoveryStrategy;
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * RecoveryManager handles automatic recovery from test failures.
 * It diagnoses the failure type, selects appropriate recovery strategies,
 * and executes them in order of likelihood of success.
 */
export class RecoveryManager {
  private maxRetries: number;
  private history: RecoveryAttempt[] = [];

  /** Pattern matchers for classifying errors. */
  private static readonly ERROR_PATTERNS: Array<{
    pattern: RegExp;
    type: FailureType;
  }> = [
    { pattern: /element.*(not found|no such|missing)/i, type: "element_not_found" },
    { pattern: /element.*(not visible|hidden|display: none)/i, type: "element_not_visible" },
    { pattern: /element.*(not interactable|disabled|readonly)/i, type: "element_not_interactable" },
    { pattern: /navigation.*(timeout|timed out)/i, type: "navigation_timeout" },
    { pattern: /(page crash|target closed|context destroyed)/i, type: "page_crash" },
    { pattern: /(network|fetch|ECONNREFUSED|ENOTFOUND|ERR_CONNECTION)/i, type: "network_error" },
    { pattern: /(stale|detached|disposed)/i, type: "selector_stale" },
    { pattern: /(captcha|recaptcha|hcaptcha|challenge)/i, type: "captcha_detected" },
    { pattern: /(401|403|unauthorized|login required|sign in)/i, type: "auth_required" },
    { pattern: /(429|rate.?limit|too many requests|throttl)/i, type: "rate_limited" },
  ];

  /** Strategy selection map: failure type -> ordered strategies to try. */
  private static readonly STRATEGY_MAP: Record<FailureType, RecoveryStrategy[]> = {
    element_not_found: ["reScan", "scrollIntoView", "useVision", "healSelector", "waitForLoad", "retry"],
    element_not_visible: ["scrollIntoView", "dismissOverlay", "waitForLoad", "reScan", "useVision"],
    element_not_interactable: ["waitForLoad", "dismissOverlay", "scrollIntoView", "reScan", "retry"],
    navigation_timeout: ["waitForLoad", "refreshPage", "retry", "restart"],
    page_crash: ["restart", "clearState", "retry"],
    network_error: ["retry", "waitForLoad", "refreshPage", "restart"],
    selector_stale: ["reScan", "healSelector", "waitForLoad", "retry"],
    captcha_detected: ["useVision", "skip"],
    auth_required: ["clearState", "restart", "skip"],
    rate_limited: ["retry", "switchModel"],
    unknown: ["retry", "reScan", "restart", "skip"],
  };

  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
  }

  /**
   * Diagnose the type of failure from an error.
   */
  diagnose(error: Error | string, context?: Partial<DiagnosisResult["context"]>): DiagnosisResult {
    const errorMessage = typeof error === "string" ? error : error.message;

    let failureType: FailureType = "unknown";
    let confidence = 0;

    // Match against known patterns
    for (const { pattern, type } of RecoveryManager.ERROR_PATTERNS) {
      if (pattern.test(errorMessage)) {
        failureType = type;
        confidence = 0.85;
        break;
      }
    }

    // If no pattern matched, use heuristics
    if (failureType === "unknown") {
      confidence = 0.3;

      // Check if it looks like a timeout
      if (errorMessage.toLowerCase().includes("timeout")) {
        failureType = "navigation_timeout";
        confidence = 0.6;
      }
    }

    const suggestedStrategies = RecoveryManager.STRATEGY_MAP[failureType];

    return {
      failureType,
      confidence,
      suggestedStrategies,
      context: {
        errorMessage,
        ...context,
      },
    };
  }

  /**
   * Attempt to recover from a failure using the suggested strategies.
   * Tries strategies in order until one succeeds or all are exhausted.
   *
   * @returns true if recovery succeeded, false if all strategies failed
   */
  async recover(
    diagnosis: DiagnosisResult,
    executors: RecoveryExecutors
  ): Promise<boolean> {
    const strategies = diagnosis.suggestedStrategies;

    for (const strategy of strategies) {
      // Check retry budget
      const previousAttempts = this.history.filter(
        (a) => a.strategy === strategy && !a.success
      ).length;
      if (previousAttempts >= this.maxRetries) {
        continue;
      }

      const startTime = Date.now();

      try {
        const success = await this.executeStrategy(
          strategy,
          diagnosis,
          executors
        );

        this.history.push({
          strategy,
          success,
          duration: Date.now() - startTime,
        });

        if (success) {
          return true;
        }
      } catch (err) {
        this.history.push({
          strategy,
          success: false,
          duration: Date.now() - startTime,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return false;
  }

  /**
   * Execute a single recovery strategy.
   */
  private async executeStrategy(
    strategy: RecoveryStrategy,
    diagnosis: DiagnosisResult,
    executors: RecoveryExecutors
  ): Promise<boolean> {
    switch (strategy) {
      case "reScan":
        // Re-scan the page for elements
        if (executors.reScan) {
          return await executors.reScan();
        }
        return false;

      case "useVision":
        // Switch to computer vision mode to find element by appearance
        if (executors.useVision) {
          return await executors.useVision(diagnosis.context.selector);
        }
        return false;

      case "healSelector":
        // Try to find the element with alternative selectors
        if (executors.healSelector) {
          return await executors.healSelector(
            diagnosis.context.selector ?? ""
          );
        }
        return false;

      case "waitForLoad":
        // Wait for the page to settle
        if (executors.waitForLoad) {
          return await executors.waitForLoad();
        }
        // Default: wait 3 seconds
        await delay(3000);
        return true;

      case "retry":
        // Simple retry (caller will re-attempt the step)
        return true;

      case "switchModel":
        // Switch to a different AI model (e.g., fallback from Claude to GPT)
        if (executors.switchModel) {
          return await executors.switchModel();
        }
        return false;

      case "restart":
        // Restart the browser context
        if (executors.restart) {
          return await executors.restart();
        }
        return false;

      case "scrollIntoView":
        // Try scrolling to make element visible
        if (executors.scrollIntoView) {
          return await executors.scrollIntoView(
            diagnosis.context.selector
          );
        }
        return false;

      case "dismissOverlay":
        // Dismiss modals, popups, cookie banners
        if (executors.dismissOverlay) {
          return await executors.dismissOverlay();
        }
        return false;

      case "refreshPage":
        // Refresh the current page
        if (executors.refreshPage) {
          return await executors.refreshPage();
        }
        return false;

      case "clearState":
        // Clear cookies, localStorage, sessionStorage
        if (executors.clearState) {
          return await executors.clearState();
        }
        return false;

      case "skip":
        // Skip this step entirely
        return false;

      default:
        return false;
    }
  }

  /**
   * Get the recovery attempt history.
   */
  getHistory(): RecoveryAttempt[] {
    return [...this.history];
  }

  /**
   * Clear the recovery history (e.g., between test runs).
   */
  clearHistory(): void {
    this.history = [];
  }
}

/**
 * Executor functions that the recovery manager can call.
 * These are provided by the browser/agent layer.
 */
export interface RecoveryExecutors {
  reScan?: () => Promise<boolean>;
  useVision?: (selector?: string) => Promise<boolean>;
  healSelector?: (selector: string) => Promise<boolean>;
  waitForLoad?: () => Promise<boolean>;
  switchModel?: () => Promise<boolean>;
  restart?: () => Promise<boolean>;
  scrollIntoView?: (selector?: string) => Promise<boolean>;
  dismissOverlay?: () => Promise<boolean>;
  refreshPage?: () => Promise<boolean>;
  clearState?: () => Promise<boolean>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
