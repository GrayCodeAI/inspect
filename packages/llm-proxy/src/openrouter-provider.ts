// ──────────────────────────────────────────────────────────────────────────────
// OpenRouter Provider Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { LLMProxyError } from "./errors.js";

export class OpenRouterConfig extends Schema.Class<OpenRouterConfig>("OpenRouterConfig")({
  apiKey: Schema.String,
  model: Schema.String,
  baseUrl: Schema.String,
  timeout: Schema.Number,
}) {}

export interface OpenRouterProviderService {
  readonly chat: (
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    model?: string,
  ) => Effect.Effect<string, LLMProxyError>;
  readonly streamChat: (
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    model?: string,
  ) => Effect.Effect<Stream<string>, LLMProxyError>;
}

export class OpenRouterProvider extends ServiceMap.Service<
  OpenRouterProvider,
  OpenRouterProviderService
>()("@inspect/OpenRouterProvider") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const config = new OpenRouterConfig({
        apiKey: "sk-or-placeholder",
        model: "openai/gpt-4o",
        baseUrl: "https://openrouter.ai/api/v1",
        timeout: 60000,
      });

      const chat = (
        messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
        model?: string,
      ) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({
            model: model ?? config.model,
            messageCount: messages.length,
          });

          const response = yield* Effect.tryPromise({
            try: async () => {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), config.timeout);

              try {
                const res = await fetch(`${config.baseUrl}/chat/completions`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${config.apiKey}`,
                    "HTTP-Referer": "https://inspect.dev",
                    "X-Title": "Inspect",
                  },
                  body: JSON.stringify({
                    model: model ?? config.model,
                    messages,
                  }),
                  signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!res.ok) {
                  const errorText = await res.text();
                  throw new Error(`OpenRouter returned ${res.status}: ${errorText}`);
                }

                return res.json() as Promise<Record<string, unknown>>;
              } catch (error) {
                clearTimeout(timeoutId);
                throw error;
              }
            },
            catch: (cause) =>
              new LLMProxyError({
                message: `OpenRouter request failed: ${String(cause)}`,
                provider: "openrouter",
                cause,
              }),
          });

          const choices = response.choices as Array<{
            message: { content: string };
          }>;

          return choices[0]?.message.content ?? "";
        }).pipe(Effect.withSpan("OpenRouterProvider.chat"));

      const streamChat = (
        messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
        model?: string,
      ) =>
        Effect.fail(
          new LLMProxyError({
            message: "Streaming not yet implemented for OpenRouter",
            provider: "openrouter",
          }),
        ).pipe(Effect.withSpan("OpenRouterProvider.streamChat"));

      return { chat, streamChat } as const;
    }),
  );
}
