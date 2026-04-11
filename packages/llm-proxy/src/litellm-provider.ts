// ──────────────────────────────────────────────────────────────────────────────
// LiteLLM Provider Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { LLMProxyError } from "./errors.js";

export class LiteLLMConfig extends Schema.Class<LiteLLMConfig>("LiteLLMConfig")({
  baseUrl: Schema.String,
  model: Schema.String,
  apiKey: Schema.optional(Schema.String),
  timeout: Schema.Number,
}) {}

export class LLMRequest extends Schema.Class<LLMRequest>("LLMRequest")({
  model: Schema.String,
  messages: Schema.Array(
    Schema.Struct({
      role: Schema.Literals(["system", "user", "assistant"] as const),
      content: Schema.String,
    }),
  ),
  temperature: Schema.Number,
  maxTokens: Schema.optional(Schema.Number),
}) {}

export class LLMResponse extends Schema.Class<LLMResponse>("LLMResponse")({
  content: Schema.String,
  model: Schema.String,
  usage: Schema.Struct({
    promptTokens: Schema.Number,
    completionTokens: Schema.Number,
    totalTokens: Schema.Number,
  }),
  finishReason: Schema.String,
}) {}

export interface LiteLLMProviderService {
  readonly chat: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMProxyError>;
  readonly complete: (
    prompt: string,
    model?: string,
  ) => Effect.Effect<string, LLMProxyError>;
}

export class LiteLLMProvider extends ServiceMap.Service<
  LiteLLMProvider,
  LiteLLMProviderService
>()("@inspect/LiteLLMProvider") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const config = new LiteLLMConfig({
        baseUrl: "http://localhost:4000",
        model: "gpt-4o",
        timeout: 30000,
      });

      const chat = (request: LLMRequest) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({
            model: request.model,
            messageCount: request.messages.length,
          });

          const response = yield* Effect.tryPromise({
            try: async () => {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), config.timeout);

              try {
                const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
                  },
                  body: JSON.stringify({
                    model: request.model,
                    messages: request.messages,
                    temperature: request.temperature,
                    max_tokens: request.maxTokens,
                  }),
                  signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!res.ok) {
                  const errorText = await res.text();
                  throw new Error(`LiteLLM returned ${res.status}: ${errorText}`);
                }

                return res.json() as Promise<Record<string, unknown>>;
              } catch (error) {
                clearTimeout(timeoutId);
                throw error;
              }
            },
            catch: (cause) =>
              new LLMProxyError({
                reason: `LiteLLM request failed: ${String(cause)}`,
                provider: "litellm",
                cause,
              }),
          });

          const choices = response.choices as Array<{
            message: { content: string };
            finish_reason: string;
          }>;
          const usage = response.usage as {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
          };

          return new LLMResponse({
            content: choices[0]?.message.content ?? "",
            model: (response.model as string) ?? request.model,
            usage: {
              promptTokens: usage?.prompt_tokens ?? 0,
              completionTokens: usage?.completion_tokens ?? 0,
              totalTokens: usage?.total_tokens ?? 0,
            },
            finishReason: choices[0]?.finish_reason ?? "unknown",
          });
        }).pipe(Effect.withSpan("LiteLLMProvider.chat"));

      const complete = (prompt: string, model?: string) =>
        chat(
          new LLMRequest({
            model: model ?? config.model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
          }),
        ).pipe(
          Effect.map((response) => response.content),
          Effect.withSpan("LiteLLMProvider.complete"),
        );

      return { chat, complete } as const;
    }),
  );
}
