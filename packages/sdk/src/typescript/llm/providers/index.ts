/**
 * LLM Provider Factory
 * Creates the appropriate client based on provider name
 */

import type { LLMClient, LLMClientConfig, ProviderName } from "../client.js";
import { AnthropicClient } from "./anthropic.js";
import { OpenAIClient } from "./openai.js";

const PROVIDER_URLS: Record<ProviderName, string> = {
  anthropic: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/chat/completions",
  google: "https://generativelanguage.googleapis.com/v1beta/models",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
};

/**
 * Create an LLM client for the specified provider
 */
export function createLLMClient(
  provider: ProviderName,
  config: LLMClientConfig
): LLMClient {
  const fullConfig = {
    ...config,
    baseUrl: config.baseUrl ?? PROVIDER_URLS[provider],
  };

  switch (provider) {
    case "anthropic":
      return new AnthropicClient(fullConfig);
    case "openai":
    case "deepseek":
    case "groq":
    case "mistral":
      // These all use OpenAI-compatible API
      return new OpenAIClient(fullConfig);
    case "google":
      // Google has slightly different format, but can use OpenAI client as base
      return new OpenAIClient(fullConfig);
    default:
      // Default to OpenAI-compatible
      return new OpenAIClient(fullConfig);
  }
}

export { AnthropicClient, OpenAIClient };
