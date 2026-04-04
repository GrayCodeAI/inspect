// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - OpenAI Provider
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

const logger = createLogger("agent/provider-openai");

/** OpenAI chat completion response */
interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

interface OpenAIMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface OpenAIStreamDelta {
  id: string;
  object: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
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
  usage?: OpenAIResponse["usage"];
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
}

const DEFAULT_OPENAI_URL = "https://api.openai.com";

/** Reasoning models that use a different parameter set */
const REASONING_MODELS = new Set(["o1", "o1-preview", "o1-mini", "o3", "o3-mini", "o4-mini"]);

/** Models supporting vision inputs */
const VISION_MODELS = new Set([
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4o-2024-11-20",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "o1",
  "o3",
  "o4-mini",
]);

/**
 * OpenAI provider.
 *
 * Supports GPT-4o, GPT-4.1 family, o1/o3 reasoning models,
 * vision, function calling (tool use), and streaming.
 */
export class OpenAIProvider extends LLMProvider {
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? DEFAULT_OPENAI_URL;
  }

  getName(): string {
    return "OpenAI";
  }

  supportsVision(): boolean {
    return (
      VISION_MODELS.has(this.config.model) ||
      this.config.model.startsWith("gpt-4o") ||
      this.config.model.startsWith("gpt-4.1")
    );
  }

  supportsThinking(): boolean {
    // o1/o3 models do reasoning internally but don't expose thinking tokens
    // in the same way Anthropic does. Return true for reasoning models.
    return this.isReasoningModel();
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse> {
    const body = this.buildRequestBody(messages, tools, options);
    const response = await this.fetchJSON<OpenAIResponse>(
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
    body.stream_options = { include_usage: true };

    const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();
    let lastUsage: LLMResponse["usage"] | undefined;
    let finishReason: LLMResponse["finishReason"] = "stop";

    for await (const line of this.fetchSSE(
      `${this.baseUrl}/v1/chat/completions`,
      body,
      this.getHeaders(),
      options?.signal,
    )) {
      let delta: OpenAIStreamDelta;
      try {
        delta = JSON.parse(line);
      } catch (error) {
        logger.debug("Failed to parse OpenAI stream chunk", {
          err: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      // Track usage if present
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

        if (d.tool_calls) {
          for (const tc of d.tool_calls) {
            const existing = pendingToolCalls.get(tc.index);
            if (!existing) {
              pendingToolCalls.set(tc.index, {
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                args: tc.function?.arguments ?? "",
              });
            } else {
              if (tc.function?.arguments) {
                existing.args += tc.function.arguments;
              }
            }

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
      usage: lastUsage ?? {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private isReasoningModel(): boolean {
    return (
      REASONING_MODELS.has(this.config.model) ||
      this.config.model.startsWith("o1") ||
      this.config.model.startsWith("o3") ||
      this.config.model.startsWith("o4")
    );
  }

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
    const isReasoning = this.isReasoningModel();

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: converted,
    };

    // Reasoning models use max_completion_tokens instead of max_tokens
    if (isReasoning) {
      body.max_completion_tokens = options?.maxTokens ?? this.config.defaultMaxTokens ?? 16384;
      // Reasoning models handle their own "thinking" via reasoning_effort
      if (options?.thinking && options.thinkingBudget) {
        body.reasoning_effort =
          options.thinkingBudget > 8000 ? "high" : options.thinkingBudget > 3000 ? "medium" : "low";
      }
    } else {
      body.max_tokens = options?.maxTokens ?? this.config.defaultMaxTokens ?? 8192;

      if (options?.temperature !== undefined) {
        body.temperature = options.temperature;
      } else if (this.config.defaultTemperature !== undefined) {
        body.temperature = this.config.defaultTemperature;
      }

      if (options?.topP !== undefined) {
        body.top_p = options.topP;
      }
    }

    if (options?.stopSequences?.length && !isReasoning) {
      body.stop = options.stopSequences;
    }

    if (options?.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }

    if (tools?.length) {
      body.tools = tools.map(this.convertTool);
    }

    return body;
  }

  private convertMessages(messages: LLMMessage[], systemPrompt?: string): unknown[] {
    const converted: unknown[] = [];
    const isReasoning = this.isReasoningModel();

    if (systemPrompt) {
      // Reasoning models use "developer" role instead of "system"
      converted.push({
        role: isReasoning ? "developer" : "system",
        content: systemPrompt,
      });
    }

    for (const msg of messages) {
      if (msg.role === "system") {
        converted.push({
          role: isReasoning ? "developer" : "system",
          content: typeof msg.content === "string" ? msg.content : this.convertContent(msg.content),
        });
        continue;
      }

      if (msg.role === "tool") {
        converted.push({
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        });
        continue;
      }

      if (msg.role === "user") {
        converted.push({
          role: "user",
          content: typeof msg.content === "string" ? msg.content : this.convertContent(msg.content),
        });
        continue;
      }

      if (msg.role === "assistant") {
        converted.push({
          role: "assistant",
          content: typeof msg.content === "string" ? msg.content : this.convertContent(msg.content),
        });
      }
    }

    return converted;
  }

  private convertContent(parts: LLMContentPart[]): unknown[] {
    return parts.map((part) => {
      switch (part.type) {
        case "text":
          return { type: "text", text: part.text };
        case "image_url":
          return {
            type: "image_url",
            image_url: {
              url: part.image_url.url,
              detail: part.image_url.detail ?? "auto",
            },
          };
        case "image_base64":
          return {
            type: "image_url",
            image_url: {
              url: `data:${part.media_type};base64,${part.data}`,
              detail: "auto",
            },
          };
        default:
          return { type: "text", text: String(part) };
      }
    });
  }

  private convertTool(tool: LLMToolDefinition): OpenAITool {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }

  private parseResponse(response: OpenAIResponse): LLMResponse {
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
      content_filter: "content_filter",
    };
    return map[reason] ?? "stop";
  }

  private safeParseJSON(str: string): Record<string, unknown> {
    try {
      return JSON.parse(str);
    } catch (error) {
      logger.debug("Failed to parse OpenAI tool call arguments", {
        err: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }
}
