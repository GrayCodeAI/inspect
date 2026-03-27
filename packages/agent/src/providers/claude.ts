// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Anthropic Claude Provider
// ──────────────────────────────────────────────────────────────────────────────

import {
  LLMProvider,
  LLMError,
  type ProviderConfig,
  type LLMMessage,
  type LLMToolDefinition,
  type LLMRequestOptions,
  type LLMResponse,
  type LLMChunk,
  type LLMContentPart,
  type LLMToolCall,
} from "./base.js";

/** Anthropic API content block types */
interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicThinkingBlock {
  type: "thinking";
  thinking: string;
}

interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<{ type: "text"; text: string } | { type: "image"; source: AnthropicImageSource }>;
  is_error?: boolean;
}

interface AnthropicImageSource {
  type: "base64";
  media_type: string;
  data: string;
}

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicThinkingBlock
  | AnthropicToolUseBlock;

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  content_block?: AnthropicContentBlock;
  delta?: {
    type: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
  };
  message?: AnthropicResponse;
  usage?: AnthropicResponse["usage"];
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const DEFAULT_ANTHROPIC_URL = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";

/** Models known to support extended thinking */
const THINKING_MODELS = new Set([
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-3-7-sonnet-20250219",
]);

/**
 * Anthropic Claude provider.
 *
 * Supports Claude 3.5 Sonnet, Claude 4 Opus, Claude 4 Sonnet,
 * vision, tool use, and extended thinking.
 */
export class ClaudeProvider extends LLMProvider {
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? DEFAULT_ANTHROPIC_URL;
  }

  getName(): string {
    return "Anthropic Claude";
  }

  supportsVision(): boolean {
    return true;
  }

  supportsThinking(): boolean {
    return THINKING_MODELS.has(this.config.model) ||
      this.config.model.startsWith("claude-sonnet-4") ||
      this.config.model.startsWith("claude-opus-4");
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse> {
    const body = this.buildRequestBody(messages, tools, options);
    const response = await this.fetchJSON<AnthropicResponse>(
      `${this.baseUrl}/v1/messages`,
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

    let currentBlockType: string | null = null;
    let toolCallId = "";
    let toolCallName = "";
    let toolCallArgs = "";
    const toolCalls: LLMToolCall[] = [];
    let totalContent = "";
    let totalThinking = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const line of this.fetchSSE(
      `${this.baseUrl}/v1/messages`,
      body,
      this.getHeaders(),
      options?.signal,
    )) {
      let event: AnthropicStreamEvent;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      switch (event.type) {
        case "content_block_start": {
          const block = event.content_block;
          if (block?.type === "tool_use") {
            currentBlockType = "tool_use";
            toolCallId = block.id;
            toolCallName = block.name;
            toolCallArgs = "";
          } else if (block?.type === "thinking") {
            currentBlockType = "thinking";
          } else {
            currentBlockType = "text";
          }
          break;
        }

        case "content_block_delta": {
          const delta = event.delta;
          if (!delta) break;

          if (delta.type === "text_delta" && delta.text) {
            totalContent += delta.text;
            yield { content: delta.text, done: false };
          } else if (delta.type === "thinking_delta" && delta.thinking) {
            totalThinking += delta.thinking;
            yield { thinking: delta.thinking, done: false };
          } else if (delta.type === "input_json_delta" && delta.partial_json) {
            toolCallArgs += delta.partial_json;
            yield {
              toolCallDelta: {
                id: toolCallId,
                name: toolCallName,
                arguments: delta.partial_json,
              },
              done: false,
            };
          }
          break;
        }

        case "content_block_stop": {
          if (currentBlockType === "tool_use" && toolCallId) {
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = JSON.parse(toolCallArgs || "{}");
            } catch {
              // Malformed tool call args
            }
            toolCalls.push({
              id: toolCallId,
              name: toolCallName,
              arguments: parsedArgs,
            });
          }
          currentBlockType = null;
          break;
        }

        case "message_start": {
          // Capture input token usage from the initial message
          if (event.message?.usage) {
            inputTokens = event.message.usage.input_tokens ?? 0;
          }
          break;
        }

        case "message_stop":
          break;

        case "message_delta": {
          // Capture output token usage from the final delta
          if (event.usage) {
            outputTokens = event.usage.output_tokens ?? 0;
          }
          break;
        }
      }
    }

    // Yield final chunk with actual usage data
    yield {
      done: true,
      finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private getHeaders(): Record<string, string> {
    return {
      "x-api-key": this.config.apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-beta": "interleaved-thinking-2025-05-14",
    };
  }

  private buildRequestBody(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    options?: LLMRequestOptions,
  ): Record<string, unknown> {
    const { systemPrompt, converted } = this.convertMessages(messages, options?.systemPrompt);

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: converted,
      max_tokens: options?.maxTokens ?? this.config.defaultMaxTokens ?? 8192,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    } else if (this.config.defaultTemperature !== undefined) {
      body.temperature = this.config.defaultTemperature;
    }

    if (options?.topP !== undefined) {
      body.top_p = options.topP;
    }

    if (options?.stopSequences?.length) {
      body.stop_sequences = options.stopSequences;
    }

    if (tools?.length) {
      body.tools = tools.map(this.convertTool);
    }

    // Extended thinking
    if (options?.thinking && this.supportsThinking()) {
      body.thinking = {
        type: "enabled",
        budget_tokens: options.thinkingBudget ?? 10000,
      };
      // Temperature must be 1 when thinking is enabled
      delete body.temperature;
    }

    return body;
  }

  private convertMessages(
    messages: LLMMessage[],
    systemOverride?: string,
  ): { systemPrompt: string | null; converted: unknown[] } {
    let systemPrompt: string | null = systemOverride ?? null;
    const converted: unknown[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        // Merge system messages
        const text = typeof msg.content === "string"
          ? msg.content
          : msg.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("\n");
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${text}` : text;
        continue;
      }

      if (msg.role === "tool") {
        converted.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.toolCallId ?? '',
              content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
            } satisfies AnthropicToolResultBlock,
          ],
        });
        continue;
      }

      if (msg.role === "user" || msg.role === "assistant") {
        converted.push({
          role: msg.role,
          content: this.convertContent(msg.content),
        });
      }
    }

    return { systemPrompt, converted };
  }

  private convertContent(
    content: string | LLMContentPart[],
  ): string | unknown[] {
    if (typeof content === "string") return content;

    return content.map((part) => {
      switch (part.type) {
        case "text":
          return { type: "text", text: part.text };
        case "image_url":
          // Anthropic uses base64, try to handle URL
          return {
            type: "image",
            source: {
              type: "url",
              url: part.image_url.url,
            },
          };
        case "image_base64":
          return {
            type: "image",
            source: {
              type: "base64",
              media_type: part.media_type,
              data: part.data,
            } satisfies AnthropicImageSource,
          };
        default:
          return { type: "text", text: String(part) };
      }
    });
  }

  private convertTool(tool: LLMToolDefinition): AnthropicTool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    };
  }

  private parseResponse(response: AnthropicResponse): LLMResponse {
    let content = "";
    let thinking = "";
    const toolCalls: LLMToolCall[] = [];

    for (const block of response.content) {
      switch (block.type) {
        case "text":
          content += block.text;
          break;
        case "thinking":
          thinking += block.thinking;
          break;
        case "tool_use":
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input,
          });
          break;
      }
    }

    const finishReasonMap: Record<string, LLMResponse["finishReason"]> = {
      end_turn: "stop",
      tool_use: "tool_calls",
      max_tokens: "length",
      stop_sequence: "stop",
    };

    return {
      content,
      toolCalls,
      thinking: thinking || undefined,
      finishReason: finishReasonMap[response.stop_reason] ?? "stop",
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      raw: response,
    };
  }
}
