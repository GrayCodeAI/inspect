import { createLogger } from "@inspect/observability";
import type { LLMProvider } from "@inspect/agent";

const logger = createLogger("enterprise/hybrid-router");

export interface HybridRouterConfig {
  /** Local provider (Ollama) */
  localProvider?: LLMProvider;
  /** Cloud provider (Anthropic/OpenAI/Gemini) */
  cloudProvider: LLMProvider;
  /** Always route sensitive data to local */
  localForSensitive: boolean;
  /** Use local when load is below this threshold (0-1) */
  localLoadThreshold: number;
  /** Prefer local for cost savings */
  preferLocal: boolean;
}

export interface RouteDecision {
  provider: LLMProvider;
  reason: string;
  isLocal: boolean;
  estimatedCost: number;
}

/**
 * Hybrid router that intelligently routes tasks between local and cloud providers.
 * Considers sensitivity, complexity, cost, and availability.
 */
export class HybridRouter {
  private config: HybridRouterConfig;
  private localLoad = 0;
  private totalRequests = 0;
  private localRequests = 0;

  constructor(config: HybridRouterConfig) {
    this.config = config;
  }

  /**
   * Route a task to the appropriate provider.
   */
  async route(task: {
    containsSensitiveData?: boolean;
    requiresVision?: boolean;
    estimatedTokens?: number;
    priority?: "low" | "normal" | "high";
  }): Promise<RouteDecision> {
    this.totalRequests++;

    // 1. Sensitive data → always local if configured
    if (task.containsSensitiveData && this.config.localForSensitive && this.config.localProvider) {
      this.localRequests++;
      return {
        provider: this.config.localProvider,
        reason: "Sensitive data routed to local provider",
        isLocal: true,
        estimatedCost: 0,
      };
    }

    // 2. Vision required → cloud (unless local supports it)
    if (task.requiresVision) {
      return {
        provider: this.config.cloudProvider,
        reason: "Vision capability required — using cloud provider",
        isLocal: false,
        estimatedCost: this.estimateCost(task.estimatedTokens ?? 1000, false),
      };
    }

    // 3. Local available and load is low
    if (this.config.localProvider && this.localLoad < this.config.localLoadThreshold) {
      this.localRequests++;
      return {
        provider: this.config.localProvider,
        reason: `Local provider available (load: ${(this.localLoad * 100).toFixed(0)}%)`,
        isLocal: true,
        estimatedCost: 0,
      };
    }

    // 4. Prefer local for cost savings
    if (this.config.preferLocal && this.config.localProvider) {
      this.localRequests++;
      return {
        provider: this.config.localProvider,
        reason: "Cost optimization — using local provider",
        isLocal: true,
        estimatedCost: 0,
      };
    }

    // 5. Default to cloud
    return {
      provider: this.config.cloudProvider,
      reason: "Using cloud provider",
      isLocal: false,
      estimatedCost: this.estimateCost(task.estimatedTokens ?? 1000, false),
    };
  }

  /**
   * Update local provider load.
   */
  setLocalLoad(load: number): void {
    this.localLoad = Math.max(0, Math.min(1, load));
  }

  /**
   * Get routing statistics.
   */
  getStats(): { totalRequests: number; localRequests: number; localPercentage: number } {
    return {
      totalRequests: this.totalRequests,
      localRequests: this.localRequests,
      localPercentage: this.totalRequests > 0 ? (this.localRequests / this.totalRequests) * 100 : 0,
    };
  }

  private estimateCost(tokens: number, isLocal: boolean): number {
    if (isLocal) return 0;
    // Rough estimate: $3 per 1M input tokens, $15 per 1M output tokens
    return (tokens / 1_000_000) * 9; // average
  }
}
