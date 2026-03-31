/**
 * OpenAI Provider
 */

import type { LLMClient, LLMClientConfig, ChatMessage, ChatOptions, ChatResponse } from "../client.js";

const DEFAULT_MODEL = "gpt-4o";
const API_URL = "https://api.openai.com/v1/chat/completions";

export class OpenAIClient implements LLMClient {
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
    const body = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`OpenAI API error (${response.status}): ${errorText.slice(0, 500)}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return this.parseResponse(data);
  }

  private parseResponse(data: Record<string, unknown>): ChatResponse {
    const choices = data.choices as Array<{ message?: { content?: string } }>;
    const text = choices?.[0]?.message?.content ?? "";

    const usage = data.usage as {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    } | undefined;

    return {
      content: text,
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
    };
  }
}
