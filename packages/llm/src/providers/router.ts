// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Provider Router & Factory
// ──────────────────────────────────────────────────────────────────────────────

import { LLMProvider, LLMError, type ProviderConfig } from "./base.js";
import { ClaudeProvider } from "./claude.js";
import { OpenAIProvider } from "./openai.js";
import { GeminiProvider } from "./gemini.js";
import { DeepSeekProvider } from "./deepseek.js";
import { OllamaProvider } from "./ollama.js";

/** Supported provider names */
export type ProviderName = "anthropic" | "openai" | "gemini" | "deepseek" | "ollama";

/** Model-to-provider mapping */
interface ModelMapping {
  provider: ProviderName;
  model: string;
}

/** Fallback chain configuration */
export interface FallbackConfig {
  primary: ProviderName;
  fallbacks: ProviderName[];
  /** Only failover on these conditions */
  failoverOn?: ("rate_limit" | "overloaded" | "error")[];
}

/** Router configuration */
export interface AgentRouterConfig {
  /** API keys per provider */
  keys: Partial<Record<ProviderName, string>>;
  /** Default provider */
  defaultProvider?: ProviderName;
  /** Default model per provider */
  defaultModels?: Partial<Record<ProviderName, string>>;
  /** Fallback chains */
  fallbacks?: FallbackConfig[];
  /** Custom base URLs */
  baseUrls?: Partial<Record<ProviderName, string>>;
}

/** Well-known model shortcuts */
const MODEL_ALIASES: Record<string, ModelMapping> = {
  "claude-4-sonnet": { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  "claude-4-opus": { provider: "anthropic", model: "claude-opus-4-20250514" },
  "claude-3.5-sonnet": { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
  "gpt-4o": { provider: "openai", model: "gpt-4o" },
  "gpt-4.1": { provider: "openai", model: "gpt-4.1" },
  "gpt-4.1-mini": { provider: "openai", model: "gpt-4.1-mini" },
  "gpt-4.1-nano": { provider: "openai", model: "gpt-4.1-nano" },
  o3: { provider: "openai", model: "o3" },
  "o4-mini": { provider: "openai", model: "o4-mini" },
  "gemini-2.5-pro": { provider: "gemini", model: "gemini-2.5-pro" },
  "gemini-2.5-flash": { provider: "gemini", model: "gemini-2.5-flash" },
  "deepseek-v3": { provider: "deepseek", model: "deepseek-chat" },
  "deepseek-r1": { provider: "deepseek", model: "deepseek-reasoner" },
};

/** Default models per provider */
const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4.1",
  gemini: "gemini-2.5-pro",
  deepseek: "deepseek-chat",
  ollama: "llama3.1",
};

/** Default fallback ordering */
const DEFAULT_FALLBACK_ORDER: Record<ProviderName, ProviderName[]> = {
  anthropic: ["openai", "gemini", "deepseek"],
  openai: ["anthropic", "gemini", "deepseek"],
  gemini: ["anthropic", "openai", "deepseek"],
  deepseek: ["anthropic", "openai", "gemini"],
  ollama: [], // No cloud fallback for local models
};

/**
 * Agent router that manages multiple LLM providers with automatic
 * fallback on rate limits / errors and a factory pattern for
 * instantiating providers.
 */
export class AgentRouter {
  private config: AgentRouterConfig;
  private providers: Map<string, LLMProvider> = new Map();

  constructor(config: AgentRouterConfig) {
    this.config = config;
  }

  /**
   * Get a provider by name, creating it if necessary.
   */
  getProvider(name: ProviderName, model?: string): LLMProvider {
    const resolvedModel = model ?? this.config.defaultModels?.[name] ?? DEFAULT_MODELS[name];
    const cacheKey = `${name}:${resolvedModel}`;

    let provider = this.providers.get(cacheKey);
    if (!provider) {
      provider = this.createProvider(name, resolvedModel);
      this.providers.set(cacheKey, provider);
    }

    return provider;
  }

  /**
   * Resolve a model alias (e.g. "claude-4-sonnet") to a provider instance.
   */
  resolveModel(modelOrAlias: string): LLMProvider {
    const alias = MODEL_ALIASES[modelOrAlias];
    if (alias) {
      return this.getProvider(alias.provider, alias.model);
    }

    // Try to infer provider from model name
    const provider = this.inferProvider(modelOrAlias);
    return this.getProvider(provider, modelOrAlias);
  }

  /**
   * Get the fallback provider for a given primary provider.
   * Used when the primary is rate-limited or unavailable.
   */
  getFallback(primary: ProviderName): LLMProvider | null {
    // Check configured fallbacks first
    const configured = this.config.fallbacks?.find((f) => f.primary === primary);
    const fallbackOrder = configured?.fallbacks ?? DEFAULT_FALLBACK_ORDER[primary] ?? [];

    for (const fallbackName of fallbackOrder) {
      const apiKey = this.config.keys[fallbackName];
      if (apiKey) {
        return this.getProvider(fallbackName);
      }
    }

    return null;
  }

  /**
   * Execute a request with automatic fallback on rate limit / overload.
   */
  async withFallback<T>(
    primary: ProviderName,
    fn: (provider: LLMProvider) => Promise<T>,
  ): Promise<T> {
    const provider = this.getProvider(primary);

    try {
      return await fn(provider);
    } catch (error) {
      if (error instanceof LLMError && (error.isRateLimit || error.isOverloaded)) {
        const fallback = this.getFallback(primary);
        if (fallback) {
          return await fn(fallback);
        }
      }
      throw error;
    }
  }

  /**
   * List all available providers (those with configured API keys).
   */
  getAllProviders(): Array<{ name: ProviderName; model: string; available: boolean }> {
    const providers: ProviderName[] = ["anthropic", "openai", "gemini", "deepseek", "ollama"];

    return providers.map((name) => ({
      name,
      model: this.config.defaultModels?.[name] ?? DEFAULT_MODELS[name],
      available: name === "ollama" || this.config.keys[name] != null,
    }));
  }

  /**
   * Get the default provider.
   */
  getDefault(): LLMProvider {
    const defaultName = this.config.defaultProvider ?? this.inferDefaultProvider();
    return this.getProvider(defaultName);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private createProvider(name: ProviderName, model: string): LLMProvider {
    const apiKey = this.config.keys[name] ?? "";
    const baseUrl = this.config.baseUrls?.[name];

    const config: ProviderConfig = {
      apiKey,
      model,
      baseUrl,
    };

    switch (name) {
      case "anthropic":
        return new ClaudeProvider(config);
      case "openai":
        return new OpenAIProvider(config);
      case "gemini":
        return new GeminiProvider(config);
      case "deepseek":
        return new DeepSeekProvider(config);
      case "ollama":
        return new OllamaProvider(config);
      default:
        throw new Error(`Unknown provider: ${name}`);
    }
  }

  private inferProvider(model: string): ProviderName {
    const lower = model.toLowerCase();
    if (lower.startsWith("claude") || lower.startsWith("anthropic")) return "anthropic";
    if (
      lower.startsWith("gpt") ||
      lower.startsWith("o1") ||
      lower.startsWith("o3") ||
      lower.startsWith("o4")
    )
      return "openai";
    if (lower.startsWith("gemini")) return "gemini";
    if (lower.startsWith("deepseek")) return "deepseek";
    // Default to ollama for unknown models (assume local)
    return "ollama";
  }

  private inferDefaultProvider(): ProviderName {
    // Prefer providers with API keys, in priority order
    const priority: ProviderName[] = ["anthropic", "openai", "gemini", "deepseek", "ollama"];
    for (const name of priority) {
      if (this.config.keys[name]) return name;
    }
    return "ollama"; // Fallback to local
  }
}
