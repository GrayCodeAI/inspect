/**
 * LLM Client Interface
 * Abstraction for different LLM providers
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMClientConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeout?: number;
}

/**
 * LLM Client interface - implemented by each provider
 */
export interface LLMClient {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
}

export type ProviderName = "anthropic" | "openai" | "google" | "deepseek" | "groq" | "mistral";
