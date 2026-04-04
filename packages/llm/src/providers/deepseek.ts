// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - DeepSeek Provider
// ──────────────────────────────────────────────────────────────────────────────

import {
  LLMProvider,
  type ProviderConfig,
  type LLMMessage,
  type LLMToolDefinition,
  type LLMRequestOptions,
  type LLMResponse,
  type LLMChunk,
  type LLMContentPart,
  type LLMToolCall,
} from "./base.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/provider-deepseek");

/** DeepSeek uses an OpenAI-compatible API with some extensions */
interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: "stop" | "tool_calls" | "length";
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

interface DeepSeekStreamDelta {
  id: string;
  object: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: DeepSeekResponse["usage"];
}

const DEFAULT_DEEPSEEK_URL = "https://api.deepseek.com";

/** Reasoning models */
const REASONING_MODELS = new Set(["deepseek-reasoner"]);

/**
 * DeepSeek provider.
 *
 * Supports DeepSeek-V3, DeepSeek-R1 (reasoning), function calling, and streaming.
 * Uses an OpenAI-compatible API with extensions for reasoning content.
 */
export class DeepSeekProvider extends LLMProvider {
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? DEFAULT_DEEPSEEK_URL;
  }

  getName(): string {
    return "DeepSeek";
  }

  supportsVision(): boolean {
    // DeepSeek currently has limited vision support
    return false;
  }

  supportsThinking(): boolean {
    return REASONING_MODELS.has(this.config.model) || this.config.model.includes("reasoner");
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse> {
    const body = this.buildRequestBody(messages, tools, options);
    const response = await this.fetchJSON<DeepSeekResponse>(
      `${this.baseUrl}/v1/chat/completions`,
      body,
      this.getHeaders(),
    );
    return this.parseResponse(response);
  }

  async *stream(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    options?: LLMRequestOptions,
  ): AsyncGenerator<LLMChunk> {
    const body = this.buildRequestBody(messages, tools, options);
    body.stream = true;

    let lastUsage: LLMResponse["usage"] | undefined;
    let finishReason: LLMResponse["finishReason"] = "stop";

    for await (const line of this.fetchSSE(
      `${this.baseUrl}/v1/chat/completions`,
      body,
      this.getHeaders(),
      options?.signal,
    )) {
      let delta: DeepSeekStreamDelta;
      try {
        delta = JSON.parse(line);
      } catch (error) {
        logger.debug("Failed to parse DeepSeek stream chunk", {
          err: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      if (delta.usage) {
        lastUsage = {
          promptTokens: delta.usage.prompt_tokens,
          completionTokens: delta.usage.completion_tokens,
          totalTokens: delta.usage.total_tokens,
          thinkingTokens: delta.usage.completion_tokens_details?.reasoning_tokens,
        };
      }

      for (const choice of delta.choices) {
        const d = choice.delta;

        if (d.content) {
          yield { content: d.content, done: false };
        }

        // DeepSeek-R1 reasoning content
        if (d.reasoning_content) {
          yield { thinking: d.reasoning_content, done: false };
        }

        if (d.tool_calls) {
          for (const tc of d.tool_calls) {
            yield {
              toolCallDelta: {
                id: tc.id,
                name: tc.function?.name,
                arguments: tc.function?.arguments,
              },
              done: false,
            };
          }
        }

        if (choice.finish_reason) {
          finishReason = this.mapFinishReason(choice.finish_reason);
        }
      }
    }

    yield {
      done: true,
      finishReason,
      usage: lastUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  private buildRequestBody(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    options?: LLMRequestOptions,
  ): Record<string, unknown> {
    const converted = this.convertMessages(messages, options?.systemPrompt);
    const isReasoning = this.supportsThinking();

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: converted,
      max_tokens: options?.maxTokens ?? this.config.defaultMaxTokens ?? 8192,
    };

    if (!isReasoning) {
      if (options?.temperature !== undefined) {
        body.temperature = options.temperature;
      } else if (this.config.defaultTemperature !== undefined) {
        body.temperature = this.config.defaultTemperature;
      }

      if (options?.topP !== undefined) {
        body.top_p = options.topP;
      }

      if (options?.stopSequences?.length) {
        body.stop = options.stopSequences;
      }
    }

    if (options?.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }

    if (tools?.length) {
      body.tools = tools.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
    }

    return body;
  }

  private convertMessages(messages: LLMMessage[], systemPrompt?: string): unknown[] {
    const converted: unknown[] = [];

    if (systemPrompt) {
      converted.push({ role: "system", content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === "system") {
        converted.push({
          role: "system",
          content:
            typeof msg.content === "string"
              ? msg.content
              : msg.content.map((p) => (p as { text: string }).text).join("\n"),
        });
      } else if (msg.role === "tool") {
        converted.push({
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        });
      } else {
        converted.push({
          role: msg.role,
          content: typeof msg.content === "string" ? msg.content : this.convertContent(msg.content),
        });
      }
    }

    return converted;
  }

  private convertContent(parts: LLMContentPart[]): string {
    // DeepSeek doesn't support multimodal; collapse to text
    return parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n");
  }

  private parseResponse(response: DeepSeekResponse): LLMResponse {
    const choice = response.choices[0];
    if (!choice) {
      return {
        content: "",
        toolCalls: [],
        finishReason: "error",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    const toolCalls: LLMToolCall[] = (choice.message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: this.safeParseJSON(tc.function.arguments),
    }));

    return {
      content: choice.message.content ?? "",
      toolCalls,
      thinking: choice.message.reasoning_content ?? undefined,
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        thinkingTokens: response.usage.completion_tokens_details?.reasoning_tokens,
      },
      raw: response,
    };
  }

  private mapFinishReason(reason: string): LLMResponse["finishReason"] {
    const map: Record<string, LLMResponse["finishReason"]> = {
      stop: "stop",
      tool_calls: "tool_calls",
      length: "length",
    };
    return map[reason] ?? "stop";
  }

  private safeParseJSON(str: string): Record<string, unknown> {
    try {
      return JSON.parse(str);
    } catch (error) {
      logger.debug("Failed to parse DeepSeek tool call arguments", {
        err: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }
}
