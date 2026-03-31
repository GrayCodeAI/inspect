/**
 * Anthropic Claude Provider
 */

import type { LLMClient, LLMClientConfig, ChatMessage, ChatOptions, ChatResponse } from "../client.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const API_URL = "https://api.anthropic.com/v1/messages";

export class AnthropicClient implements LLMClient {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private timeout: number;

  constructor(config: LLMClientConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.baseUrl = config.baseUrl ?? API_URL;
    this.timeout = config.timeout ?? 60_000;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    // Separate system message for Anthropic
    const systemMessages = messages.filter((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const body = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0,
      system: systemMessages.map((m) => m.content).join("\n\n") || undefined,
      messages: nonSystemMessages.map((m) => ({
        role: m.role === "system" ? "user" : m.role,
        content: m.content,
      })),
    };

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Anthropic API error (${response.status}): ${errorText.slice(0, 500)}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return this.parseResponse(data);
  }

  private parseResponse(data: Record<string, unknown>): ChatResponse {
    const content = data.content as Array<{ type: string; text?: string }>;
    const text =
      content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("") ?? "";

    const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;

    return {
      content: text,
      usage: {
        promptTokens: usage?.input_tokens ?? 0,
        completionTokens: usage?.output_tokens ?? 0,
        totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
      },
    };
  }
}
