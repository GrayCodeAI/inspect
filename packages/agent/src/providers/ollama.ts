// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Ollama Provider (local models)
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

/** Ollama chat API response */
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: "assistant";
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/** Ollama streaming response chunk */
interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: "assistant";
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

/** Ollama model list response */
interface OllamaModelList {
  models: Array<{
    name: string;
    model: string;
    size: number;
    digest: string;
    modified_at: string;
    details: {
      format: string;
      family: string;
      parameter_size: string;
      quantization_level: string;
    };
  }>;
}

const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/** Models known to support vision */
const VISION_MODELS = new Set([
  "llava", "llava:13b", "llava:34b",
  "llava-llama3", "llava-phi3",
  "moondream", "moondream2",
  "bakllava",
]);

/**
 * Ollama provider for running local models.
 *
 * Supports any model available in Ollama including Llama 3, Mistral,
 * Phi-3, CodeLlama, and vision models like LLaVA.
 * Tool calling support depends on the specific model.
 */
export class OllamaProvider extends LLMProvider {
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    // Ollama doesn't require an API key
    super({ ...config, apiKey: config.apiKey || "ollama" });
    this.baseUrl = config.baseUrl ?? DEFAULT_OLLAMA_URL;
  }

  getName(): string {
    return "Ollama";
  }

  supportsVision(): boolean {
    const model = this.config.model.toLowerCase();
    return VISION_MODELS.has(model) ||
      model.includes("llava") ||
      model.includes("moondream") ||
      model.includes("vision");
  }

  supportsThinking(): boolean {
    const model = this.config.model.toLowerCase();
    return model.includes("deepseek-r1") || model.includes("qwq");
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse> {
    const body = this.buildRequestBody(messages, tools, options);
    body.stream = false;

    const response = await this.fetchJSON<OllamaChatResponse>(
      `${this.baseUrl}/api/chat`,
      body,
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
    let toolCallCounter = 0;

    const controller = new AbortController();
    const timeout = this.config.timeout ?? 300_000;
    const timer = setTimeout(() => controller.abort(), timeout);

    if (options?.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new LLMError(
          `Ollama error ${response.status}: ${errorBody}`,
          response.status,
          errorBody,
        );
      }

      if (!response.body) {
        throw new LLMError("Ollama returned no response body", 0);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let totalContent = "";
      let lastEvalCount = 0;
      let lastPromptEvalCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          let chunk: OllamaStreamChunk;
          try {
            chunk = JSON.parse(line);
          } catch {
            continue;
          }

          if (chunk.message.content) {
            totalContent += chunk.message.content;
            yield { content: chunk.message.content, done: false };
          }

          if (chunk.message.tool_calls) {
            for (const tc of chunk.message.tool_calls) {
              yield {
                toolCallDelta: {
                  id: `ollama-tc-${toolCallCounter++}`,
                  name: tc.function.name,
                  arguments: JSON.stringify(tc.function.arguments),
                },
                done: false,
              };
            }
          }

          if (chunk.done) {
            lastEvalCount = chunk.eval_count ?? 0;
            lastPromptEvalCount = chunk.prompt_eval_count ?? 0;
          }
        }
      }

      yield {
        done: true,
        finishReason: "stop",
        usage: {
          promptTokens: lastPromptEvalCount,
          completionTokens: lastEvalCount,
          totalTokens: lastPromptEvalCount + lastEvalCount,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * List available models on the local Ollama instance.
   */
  async listModels(): Promise<string[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new LLMError(`Ollama list error: ${response.status}`, response.status);
      }

      const data = (await response.json()) as OllamaModelList;
      return data.models.map((m) => m.name);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Check if the Ollama server is reachable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      try {
        const response = await fetch(`${this.baseUrl}/api/tags`, {
          signal: controller.signal,
        });
        return response.ok;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildRequestBody(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    options?: LLMRequestOptions,
  ): Record<string, unknown> {
    const converted = this.convertMessages(messages, options?.systemPrompt);

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: converted,
    };

    const ollamaOptions: Record<string, unknown> = {};

    if (options?.temperature !== undefined) {
      ollamaOptions.temperature = options.temperature;
    } else if (this.config.defaultTemperature !== undefined) {
      ollamaOptions.temperature = this.config.defaultTemperature;
    }

    if (options?.maxTokens ?? this.config.defaultMaxTokens) {
      ollamaOptions.num_predict = options?.maxTokens ?? this.config.defaultMaxTokens;
    }

    if (options?.topP !== undefined) {
      ollamaOptions.top_p = options.topP;
    }

    if (options?.stopSequences?.length) {
      ollamaOptions.stop = options.stopSequences;
    }

    if (Object.keys(ollamaOptions).length > 0) {
      body.options = ollamaOptions;
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

    if (options?.responseFormat === "json") {
      body.format = "json";
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
          content: typeof msg.content === "string"
            ? msg.content
            : msg.content.map((p) => (p as { text: string }).text).join("\n"),
        });
      } else if (msg.role === "tool") {
        converted.push({
          role: "tool",
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        });
      } else if (msg.role === "user" || msg.role === "assistant") {
        const converted_msg: Record<string, unknown> = { role: msg.role };

        if (typeof msg.content === "string") {
          converted_msg.content = msg.content;
        } else {
          // Handle multimodal content for vision models
          const textParts: string[] = [];
          const images: string[] = [];

          for (const part of msg.content) {
            if (part.type === "text") {
              textParts.push(part.text);
            } else if (part.type === "image_base64") {
              images.push(part.data);
            }
          }

          converted_msg.content = textParts.join("\n");
          if (images.length > 0) {
            converted_msg.images = images;
          }
        }

        converted.push(converted_msg);
      }
    }

    return converted;
  }

  private parseResponse(response: OllamaChatResponse): LLMResponse {
    const toolCalls: LLMToolCall[] = (response.message.tool_calls ?? []).map((tc, i) => ({
      id: `ollama-tc-${i}`,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    return {
      content: response.message.content,
      toolCalls,
      finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
      usage: {
        promptTokens: response.prompt_eval_count ?? 0,
        completionTokens: response.eval_count ?? 0,
        totalTokens: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
      },
      raw: response,
    };
  }
}
