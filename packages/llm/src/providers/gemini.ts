// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Google Gemini Provider
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
import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/provider-gemini");

/** Gemini content types */
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { content: unknown } } }
  | { thought: boolean; text: string };

interface GeminiToolDeclaration {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      role: "model";
      parts: GeminiPart[];
    };
    finishReason: "STOP" | "MAX_TOKENS" | "SAFETY" | "RECITATION" | "OTHER";
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    thoughtsTokenCount?: number;
  };
  modelVersion?: string;
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      role: "model";
      parts: GeminiPart[];
    };
    finishReason?: string;
  }>;
  usageMetadata?: GeminiResponse["usageMetadata"];
}

const DEFAULT_GEMINI_URL = "https://generativelanguage.googleapis.com";

/** Models that support thinking budget */
const THINKING_MODELS = new Set([
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-pro-preview-05-06",
]);

/**
 * Google Gemini provider.
 *
 * Supports Gemini 2.5 Pro/Flash, vision, function calling,
 * thinking budget, and streaming.
 */
export class GeminiProvider extends LLMProvider {
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? DEFAULT_GEMINI_URL;
  }

  getName(): string {
    return "Google Gemini";
  }

  supportsVision(): boolean {
    return true; // All Gemini models support vision
  }

  supportsThinking(): boolean {
    return THINKING_MODELS.has(this.config.model) || this.config.model.startsWith("gemini-2.5");
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse> {
    const { url, body } = this.buildRequest(messages, tools, options, false);
    const response = await this.fetchJSON<GeminiResponse>(url, body, {
      "x-goog-api-key": this.config.apiKey,
    });
    return this.parseResponse(response);
  }

  async *stream(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    options?: LLMRequestOptions,
  ): AsyncGenerator<LLMChunk> {
    const { url, body } = this.buildRequest(messages, tools, options, true);

    // Gemini streaming uses a different endpoint format (streamGenerateContent)
    // and returns newline-delimited JSON, not SSE
    const controller = new AbortController();
    const timeout = this.config.timeout ?? 300_000;
    const timer = setTimeout(() => controller.abort(), timeout);

    if (options?.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.config.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        const truncatedBody = errorBody.length > 500 ? errorBody.slice(0, 500) + "..." : errorBody;
        throw new LLMError(
          `Gemini API error ${response.status}: ${truncatedBody}`,
          response.status,
          truncatedBody,
        );
      }

      if (!response.body) {
        throw new LLMError("Gemini returned no response body", 0);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastUsage: LLMResponse["usage"] | undefined;
      let finishReason: LLMResponse["finishReason"] = "stop";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Gemini streaming returns a JSON array, with chunks separated by commas
        // Try to parse complete JSON objects from the buffer
        const chunks = this.extractJSONChunks(buffer);
        buffer = chunks.remaining;

        for (const chunk of chunks.parsed) {
          const result = this.parseStreamChunk(chunk);
          if (result.content) {
            yield { content: result.content, done: false };
          }
          if (result.thinking) {
            yield { thinking: result.thinking, done: false };
          }
          if (result.toolCallDelta) {
            yield { toolCallDelta: result.toolCallDelta, done: false };
          }
          if (result.usage) {
            lastUsage = result.usage;
          }
          if (result.finishReason) {
            finishReason = result.finishReason;
          }
        }
      }

      yield {
        done: true,
        finishReason,
        usage: lastUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildRequest(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    options?: LLMRequestOptions,
    streaming?: boolean,
  ): { url: string; body: Record<string, unknown> } {
    const { systemInstruction, contents } = this.convertMessages(messages, options?.systemPrompt);
    const action = streaming ? "streamGenerateContent" : "generateContent";
    const altParam = streaming ? "?alt=sse" : "";
    const url = `${this.baseUrl}/v1beta/models/${this.config.model}:${action}${altParam}`;

    const body: Record<string, unknown> = {
      contents,
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const generationConfig: Record<string, unknown> = {};

    if (options?.maxTokens ?? this.config.defaultMaxTokens) {
      generationConfig.maxOutputTokens = options?.maxTokens ?? this.config.defaultMaxTokens ?? 8192;
    }

    if (options?.temperature !== undefined) {
      generationConfig.temperature = options.temperature;
    } else if (this.config.defaultTemperature !== undefined) {
      generationConfig.temperature = this.config.defaultTemperature;
    }

    if (options?.topP !== undefined) {
      generationConfig.topP = options.topP;
    }

    if (options?.stopSequences?.length) {
      generationConfig.stopSequences = options.stopSequences;
    }

    if (options?.responseFormat === "json") {
      generationConfig.responseMimeType = "application/json";
    }

    // Thinking budget for supported models
    if (options?.thinking && this.supportsThinking()) {
      generationConfig.thinkingConfig = {
        thinkingBudget: options.thinkingBudget ?? 10000,
      };
    }

    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    if (tools?.length) {
      body.tools = [this.convertTools(tools)];
    }

    return { url, body };
  }

  private convertMessages(
    messages: LLMMessage[],
    systemPrompt?: string,
  ): { systemInstruction: string | null; contents: GeminiContent[] } {
    let systemInstruction: string | null = systemPrompt ?? null;
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        const text =
          typeof msg.content === "string"
            ? msg.content
            : msg.content
                .filter((p) => p.type === "text")
                .map((p) => (p as { text: string }).text)
                .join("\n");
        systemInstruction = systemInstruction ? `${systemInstruction}\n\n${text}` : text;
        continue;
      }

      if (msg.role === "tool") {
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: msg.name ?? "tool",
                response: {
                  content:
                    typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
                },
              },
            },
          ],
        });
        continue;
      }

      const role: "user" | "model" = msg.role === "assistant" ? "model" : "user";
      contents.push({
        role,
        parts: this.convertParts(msg.content),
      });
    }

    return { systemInstruction, contents };
  }

  private convertParts(content: string | LLMContentPart[]): GeminiPart[] {
    if (typeof content === "string") {
      return [{ text: content }];
    }

    return content.map((part): GeminiPart => {
      switch (part.type) {
        case "text":
          return { text: part.text };
        case "image_base64":
          return {
            inlineData: {
              mimeType: part.media_type,
              data: part.data,
            },
          };
        case "image_url":
          // Gemini prefers inline data; for URLs, we pass as-is
          // The caller should convert to base64 when possible
          return { text: `[Image: ${part.image_url.url}]` };
        default:
          return { text: String(part) };
      }
    });
  }

  private convertTools(tools: LLMToolDefinition[]): GeminiToolDeclaration {
    return {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    };
  }

  private parseResponse(response: GeminiResponse): LLMResponse {
    const candidate = response.candidates?.[0];
    if (!candidate) {
      return {
        content: "",
        toolCalls: [],
        finishReason: "error",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    let content = "";
    let thinking = "";
    const toolCalls: LLMToolCall[] = [];
    let toolCallIndex = 0;

    for (const part of candidate.content.parts) {
      if ("text" in part && !("thought" in part)) {
        content += part.text;
      } else if ("thought" in part && part.thought) {
        thinking += part.text;
      } else if ("functionCall" in part) {
        toolCalls.push({
          id: `gemini-tc-${toolCallIndex++}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args,
        });
      }
    }

    const finishReasonMap: Record<string, LLMResponse["finishReason"]> = {
      STOP: "stop",
      MAX_TOKENS: "length",
      SAFETY: "content_filter",
      RECITATION: "content_filter",
    };

    return {
      content,
      toolCalls,
      thinking: thinking || undefined,
      finishReason:
        toolCalls.length > 0 ? "tool_calls" : (finishReasonMap[candidate.finishReason] ?? "stop"),
      usage: {
        promptTokens: response.usageMetadata.promptTokenCount,
        completionTokens: response.usageMetadata.candidatesTokenCount,
        totalTokens: response.usageMetadata.totalTokenCount,
        thinkingTokens: response.usageMetadata.thoughtsTokenCount,
      },
      raw: response,
    };
  }

  private parseStreamChunk(
    chunk: GeminiStreamChunk,
  ): Partial<LLMChunk> & { usage?: LLMResponse["usage"] } {
    const result: Partial<LLMChunk> & { usage?: LLMResponse["usage"] } = {};

    if (chunk.candidates?.[0]?.content?.parts) {
      for (const part of chunk.candidates[0].content.parts) {
        if ("text" in part && !("thought" in part)) {
          result.content = (result.content ?? "") + part.text;
        } else if ("thought" in part && part.thought) {
          result.thinking = (result.thinking ?? "") + part.text;
        } else if ("functionCall" in part) {
          result.toolCallDelta = {
            id: `gemini-tc-stream`,
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          };
        }
      }
    }

    if (chunk.candidates?.[0]?.finishReason) {
      const map: Record<string, LLMResponse["finishReason"]> = {
        STOP: "stop",
        MAX_TOKENS: "length",
        SAFETY: "content_filter",
      };
      result.finishReason = map[chunk.candidates[0].finishReason] ?? "stop";
    }

    if (chunk.usageMetadata) {
      result.usage = {
        promptTokens: chunk.usageMetadata.promptTokenCount,
        completionTokens: chunk.usageMetadata.candidatesTokenCount,
        totalTokens: chunk.usageMetadata.totalTokenCount,
        thinkingTokens: chunk.usageMetadata.thoughtsTokenCount,
      };
    }

    return result;
  }

  private extractJSONChunks(buffer: string): { parsed: GeminiStreamChunk[]; remaining: string } {
    const parsed: GeminiStreamChunk[] = [];
    const remaining = buffer;

    // SSE format: data: {...}\n\n
    const lines = remaining.split("\n");
    const unprocessed: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;
        try {
          parsed.push(JSON.parse(data));
        } catch (error) {
          logger.debug("Failed to parse Gemini stream chunk", {
            err: error instanceof Error ? error.message : String(error),
          });
          unprocessed.push(line);
        }
      } else if (trimmed) {
        unprocessed.push(line);
      }
    }

    return { parsed, remaining: unprocessed.join("\n") };
  }
}
