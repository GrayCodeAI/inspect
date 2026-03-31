// @inspect/llm — LLM providers, rate limiting, fallback, routing
// Split from @inspect/agent to follow Single Responsibility Principle

export {
  LLMProvider,
  LLMError,
  type ProviderConfig,
  type LLMMessage,
  type LLMContentPart,
  type LLMToolDefinition,
  type LLMToolCall,
  type LLMRequestOptions,
  type LLMResponse,
  type LLMChunk,
} from "./providers/base.js";

export { ClaudeProvider } from "./providers/claude.js";
export { OpenAIProvider } from "./providers/openai.js";
export { GeminiProvider } from "./providers/gemini.js";
export { DeepSeekProvider } from "./providers/deepseek.js";
export { OllamaProvider } from "./providers/ollama.js";
export { AgentRouter, type AgentRouterConfig, type ProviderName } from "./providers/router.js";

export { RateLimiter, RATE_LIMIT_PRESETS } from "./providers/rate-limiter.js";
export type { RateLimitConfig } from "./providers/rate-limiter.js";

export { FallbackManager } from "./providers/fallback.js";
export type { FallbackConfig, LLMCallFn } from "./providers/fallback.js";
