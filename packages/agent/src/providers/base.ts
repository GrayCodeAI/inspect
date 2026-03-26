// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Abstract LLM Provider
// ──────────────────────────────────────────────────────────────────────────────

/** A single message in a conversation */
export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | LLMContentPart[];
  /** Tool call ID this message is a response to */
  toolCallId?: string;
  /** Name of the tool (for tool role messages) */
  name?: string;
}

/** Content part for multimodal messages */
export type LLMContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  | { type: "image_base64"; media_type: string; data: string };

/** Tool definition passed to the LLM */
export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A tool call requested by the LLM */
export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Options for LLM requests */
export interface LLMRequestOptions {
  /** System prompt (prepended to messages if provider supports it) */
  systemPrompt?: string;
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** Top-p sampling */
  topP?: number;
  /** Whether to enable extended thinking */
  thinking?: boolean;
  /** Budget tokens for thinking (Anthropic/Gemini) */
  thinkingBudget?: number;
  /** Response format */
  responseFormat?: "text" | "json";
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/** A complete LLM response */
export interface LLMResponse {
  /** Generated text content */
  content: string;
  /** Tool calls requested by the model */
  toolCalls: LLMToolCall[];
  /** Thinking/reasoning content if enabled */
  thinking?: string;
  /** Finish reason */
  finishReason: "stop" | "tool_calls" | "length" | "content_filter" | "error";
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    thinkingTokens?: number;
  };
  /** Raw response for debugging */
  raw?: unknown;
}

/** A streaming chunk from the LLM */
export interface LLMChunk {
  /** Incremental text content */
  content?: string;
  /** Incremental thinking content */
  thinking?: string;
  /** Tool call delta */
  toolCallDelta?: {
    id?: string;
    name?: string;
    arguments?: string;
  };
  /** Whether this is the final chunk */
  done: boolean;
  /** Finish reason (only on final chunk) */
  finishReason?: LLMResponse["finishReason"];
  /** Usage (only on final chunk) */
  usage?: LLMResponse["usage"];
}

/** Provider configuration */
export interface ProviderConfig {
  /** API key */
  apiKey: string;
  /** Model identifier */
  model: string;
  /** Base URL override */
  baseUrl?: string;
  /** Default max tokens */
  defaultMaxTokens?: number;
  /** Default temperature */
  defaultTemperature?: number;
  /** Custom HTTP headers */
  headers?: Record<string, string>;
  /** Request timeout in ms */
  timeout?: number;
}

/**
 * Abstract base class for all LLM providers.
 *
 * Implementations must handle API-specific request/response formats
 * while exposing a uniform interface for the agent loop.
 */
export abstract class LLMProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /**
   * Send a chat completion request.
   */
  abstract chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse>;

  /**
   * Stream a chat completion, yielding incremental chunks.
   */
  abstract stream(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    options?: LLMRequestOptions,
  ): AsyncGenerator<LLMChunk>;

  /** Whether this provider supports image/vision inputs */
  abstract supportsVision(): boolean;

  /** Whether this provider supports extended thinking / chain-of-thought */
  abstract supportsThinking(): boolean;

  /** Human-readable provider name (e.g. "Anthropic Claude") */
  abstract getName(): string;

  /** Currently configured model identifier */
  getModel(): string {
    return this.config.model;
  }

  /** Update the model for this provider */
  setModel(model: string): void {
    this.config.model = model;
  }

  /**
   * Helper: make a fetch request with timeout and error handling.
   */
  protected async fetchJSON<T>(
    url: string,
    body: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = this.config.timeout ?? 120_000;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
          ...extraHeaders,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new LLMError(
          `${this.getName()} API error ${response.status}: ${errorBody}`,
          response.status,
          errorBody,
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Helper: open a streaming fetch connection and yield raw SSE lines.
   */
  protected async *fetchSSE(
    url: string,
    body: unknown,
    extraHeaders?: Record<string, string>,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const controller = new AbortController();
    const timeout = this.config.timeout ?? 300_000;
    const timer = setTimeout(() => controller.abort(), timeout);

    // Link external signal
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
          ...extraHeaders,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new LLMError(
          `${this.getName()} streaming error ${response.status}: ${errorBody}`,
          response.status,
          errorBody,
        );
      }

      if (!response.body) {
        throw new LLMError(`${this.getName()} returned no response body`, 0);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const data = trimmed.slice(6);
            if (data === "[DONE]") return;
            yield data;
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim().startsWith("data: ")) {
        const data = buffer.trim().slice(6);
        if (data !== "[DONE]") {
          yield data;
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Structured error for LLM API failures */
export class LLMError extends Error {
  readonly statusCode: number;
  readonly responseBody?: string;
  readonly isRateLimit: boolean;
  readonly isOverloaded: boolean;

  constructor(message: string, statusCode: number, responseBody?: string) {
    super(message);
    this.name = "LLMError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.isRateLimit = statusCode === 429;
    this.isOverloaded = statusCode === 529 || statusCode === 503;
  }
}
