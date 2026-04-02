/**
 * Fallback Execution Strategies
 *
 * Handles various failure scenarios with alternative execution paths.
 * Provides graceful degradation and recovery mechanisms.
 */

import { EventEmitter } from "events";

export interface FallbackConfig {
  /** Enable fallback execution */
  enabled: boolean;
  /** Max fallback attempts per action */
  maxFallbacks: number;
  /** Fallback timeout (ms) */
  timeout: number;
  /** On fallback triggered */
  onFallback?: (event: FallbackEvent) => void;
  /** On recovery success */
  onRecovery?: (event: RecoveryEvent) => void;
}

export interface FallbackStrategy {
  name: string;
  description: string;
  canHandle: (error: Error, context: ExecutionContext) => boolean;
  execute: (error: Error, context: ExecutionContext) => Promise<unknown>;
  priority: number;
}

export interface ExecutionContext {
  action: string;
  params: Record<string, unknown>;
  attempt: number;
  previousErrors: Error[];
  sessionId: string;
  metadata: Record<string, unknown>;
}

export interface FallbackEvent {
  strategy: string;
  originalError: Error;
  context: ExecutionContext;
  attempt: number;
}

export interface RecoveryEvent {
  strategy: string;
  result: unknown;
  duration: number;
  attempts: number;
}

export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  enabled: true,
  maxFallbacks: 3,
  timeout: 30000,
};

/**
 * Fallback Execution Service
 */
export class FallbackService extends EventEmitter {
  private config: FallbackConfig;
  private strategies: FallbackStrategy[] = [];

  constructor(config: Partial<FallbackConfig> = {}) {
    super();
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };
    this.strategies = []; // Will initialize in setupDefaultStrategies
    this.setupDefaultStrategies();
  }

  private setupDefaultStrategies(): void {
    const self = this;

    // LLM Provider Fallback
    this.strategies.push({
      name: "llm-provider-fallback",
      description: "Switch to backup LLM provider",
      priority: 1,
      canHandle: (error) => {
        return (
          error.message.includes("rate limit") ||
          error.message.includes("timeout") ||
          error.message.includes("provider error") ||
          error.message.includes("ECONNREFUSED")
        );
      },
      execute: async (error, context) => {
        // Try alternative provider
        const providers = ["openai", "gemini", "deepseek"];
        const currentProvider = context.metadata.provider as string;
        const nextProvider = providers.find((p) => p !== currentProvider);

        if (nextProvider) {
          return {
            action: "switch-provider",
            from: currentProvider,
            to: nextProvider,
            reason: error.message,
          };
        }

        throw new Error("No alternative providers available");
      },
    });

    // Retry with backoff
    this.strategies.push({
      name: "exponential-backoff",
      description: "Retry with exponential backoff",
      priority: 2,
      canHandle: (error) => {
        return (
          error.message.includes("timeout") ||
          error.message.includes("ECONNRESET") ||
          error.message.includes("ETIMEDOUT") ||
          error.message.includes("network")
        );
      },
      execute: async (error, context) => {
        const delay = Math.min(1000 * Math.pow(2, context.attempt - 1), 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));

        return {
          action: "retry",
          delay,
          attempt: context.attempt,
        };
      },
    });

    // Simplify action
    this.strategies.push({
      name: "action-simplification",
      description: "Simplify complex action into smaller steps",
      priority: 3,
      canHandle: (error) => {
        return (
          error.message.includes("element not found") ||
          error.message.includes("timeout") ||
          error.message.includes("complex")
        );
      },
      execute: async (error, context) => {
        // Break down complex action
        const subActions = self.breakIntoSubActions(context.action, context.params);

        return {
          action: "simplify",
          original: context.action,
          subActions,
          reason: error.message,
        };
      },
    });

    // Alternative selector
    this.strategies.push({
      name: "alternative-selector",
      description: "Try alternative selectors for element",
      priority: 4,
      canHandle: (error) => {
        return (
          error.message.includes("element not found") ||
          error.message.includes("selector") ||
          error.message.includes("strict mode")
        );
      },
      execute: async (error, context) => {
        const selector = context.params.selector as string;
        const alternatives = self.generateAlternativeSelectors(selector);

        return {
          action: "try-alternatives",
          original: selector,
          alternatives,
          reason: error.message,
        };
      },
    });

    // Skip non-critical
    this.strategies.push({
      name: "skip-non-critical",
      description: "Skip non-critical actions",
      priority: 5,
      canHandle: (error, context) => {
        const isCritical = context.metadata.critical === true;
        return !isCritical && context.attempt >= 2;
      },
      execute: async (error, context) => {
        return {
          action: "skip",
          skipped: context.action,
          reason: "Non-critical action failed after retries",
        };
      },
    });

    // Manual intervention
    this.strategies.push({
      name: "manual-intervention",
      description: "Request manual intervention",
      priority: 10,
      canHandle: () => true, // Last resort
      execute: async (error, context) => {
        return {
          action: "manual-intervention",
          error: error.message,
          context,
          timestamp: Date.now(),
        };
      },
    });
  }

  /**
   * Register custom fallback strategy
   */
  registerStrategy(strategy: FallbackStrategy): void {
    this.strategies.push(strategy);
    this.strategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute with fallback handling
   */
  async executeWithFallback<T>(
    fn: () => Promise<T>,
    context: ExecutionContext
  ): Promise<T> {
    if (!this.config.enabled) {
      return fn();
    }

    const errors: Error[] = [];

    for (let attempt = 0; attempt <= this.config.maxFallbacks; attempt++) {
      try {
        const result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Fallback timeout")),
              this.config.timeout
            )
          ),
        ]);

        if (errors.length > 0) {
          this.emit("recovery:success", {
            strategy: "direct",
            result,
            duration: 0,
            attempts: attempt + 1,
          });
          this.config.onRecovery?.({
            strategy: "direct",
            result,
            duration: 0,
            attempts: attempt + 1,
          });
        }

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);

        context.attempt = attempt + 1;
        context.previousErrors = errors;

        // Find applicable fallback strategy
        const strategy = this.findStrategy(err, context);

        if (!strategy || attempt >= this.config.maxFallbacks) {
          throw error;
        }

        this.emit("fallback:triggered", {
          strategy: strategy.name,
          originalError: err,
          context,
          attempt: attempt + 1,
        });

        this.config.onFallback?.({
          strategy: strategy.name,
          originalError: err,
          context,
          attempt: attempt + 1,
        });

        try {
          const fallbackResult = await strategy.execute(err, context);

          // If fallback returns an action to take, handle it
          if (fallbackResult && typeof fallbackResult === "object") {
            const action = (fallbackResult as { action?: string }).action;

            this.emit("fallback:action", {
              strategy: strategy.name,
              action,
              result: fallbackResult,
            });
          }

          // Next iteration will retry the original function
        } catch (fallbackError) {
          // Fallback strategy itself failed, try next strategy
          this.emit("fallback:failed", {
            strategy: strategy.name,
            error: fallbackError,
          });
        }
      }
    }

    throw new Error("Unexpected end of fallback loop");
  }

  /**
   * Find applicable strategy for an error
   */
  private findStrategy(error: Error, context: ExecutionContext): FallbackStrategy | undefined {
    return this.strategies.find((s) => s.canHandle(error, context));
  }

  /**
   * Break complex action into sub-actions
   */
  private breakIntoSubActions(action: string, params: Record<string, unknown>): string[] {
    const subActions: string[] = [];

    if (action.includes("form")) {
      subActions.push("clearForm");
      subActions.push("fillFormPartial");
      subActions.push("submitForm");
    } else if (action.includes("click")) {
      subActions.push("scrollToElement");
      subActions.push("hoverElement");
      subActions.push("clickElement");
    } else if (action.includes("type")) {
      subActions.push("focusElement");
      subActions.push("typePartial");
      subActions.push("typeRemaining");
    } else {
      subActions.push(`${action}_attempt1`);
      subActions.push(`${action}_attempt2`);
    }

    return subActions;
  }

  /**
   * Generate alternative selectors for an element
   */
  private generateAlternativeSelectors(selector: string): string[] {
    const alternatives: string[] = [];

    // Try different strategies
    if (selector.startsWith("#")) {
      // ID-based selector, try data-testid or class
      alternatives.push(`[data-testid="${selector.slice(1)}"]`);
      alternatives.push(`[name="${selector.slice(1)}"]`);
    } else if (selector.startsWith(".")) {
      // Class-based selector, try tag + class or contains
      alternatives.push(`div${selector}`);
      alternatives.push(`button${selector}`);
      alternatives.push(`*${selector}`);
    } else if (selector.startsWith("[")) {
      // Attribute selector, try text content
      alternatives.push(`text=${selector.match(/\[.*="(.+)"\]/)?.[1] ?? ""}`);
    } else {
      // Tag-based, try with attributes
      alternatives.push(`${selector}:visible`);
      alternatives.push(`${selector}:first`);
    }

    // Always add a generic fallback
    alternatives.push(`text=/\\b${selector.replace(/[#.\[\]]/g, "")}\\b/i`);

    return alternatives;
  }
}
