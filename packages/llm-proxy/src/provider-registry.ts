// ──────────────────────────────────────────────────────────────────────────────
// Provider Registry Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { LLMProxyError } from "./errors.js";

export type ProviderType = "litellm" | "openrouter" | "custom";

export class ProviderRegistration extends Schema.Class<ProviderRegistration>(
  "ProviderRegistration",
)({
  name: Schema.String,
  type: Schema.Literals(["litellm", "openrouter", "custom"] as const),
  config: Schema.Record(Schema.String, Schema.String),
}) {}

export interface LLMProvider {
  readonly chat: (
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    model?: string,
  ) => Effect.Effect<string, LLMProxyError>;
}

export interface ProviderRegistryService {
  readonly register: (name: string, provider: LLMProvider) => Effect.Effect<void>;
  readonly get: (name: string) => Effect.Effect<LLMProvider, LLMProxyError>;
  readonly list: Effect.Effect<string[]>;
  readonly chat: (
    provider: string,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    model?: string,
  ) => Effect.Effect<string, LLMProxyError>;
}

export class ProviderRegistry extends ServiceMap.Service<
  ProviderRegistry,
  ProviderRegistryService
>()("@inspect/ProviderRegistry") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const providers = new Map<string, LLMProvider>();

      const register = (name: string, provider: LLMProvider) =>
        Effect.sync(() => {
          providers.set(name, provider);
        }).pipe(
          Effect.tap(() => Effect.logInfo("LLM provider registered", { name })),
          Effect.withSpan("ProviderRegistry.register"),
        );

      const get = (name: string) =>
        Effect.gen(function* () {
          const provider = providers.get(name);
          if (!provider) {
            return yield* new LLMProxyError({
              reason: `Provider not found: ${name}`,
              provider: name,
            });
          }
          return provider;
        }).pipe(Effect.withSpan("ProviderRegistry.get"));

      const list = Effect.sync(() => Array.from(providers.keys())).pipe(
        Effect.withSpan("ProviderRegistry.list"),
      );

      const chat = (
        providerName: string,
        messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
        model?: string,
      ) =>
        Effect.gen(function* () {
          const provider = yield* get(providerName);
          return yield* provider.chat(messages, model);
        }).pipe(Effect.withSpan("ProviderRegistry.chat"));

      return { register, get, list, chat } as const;
    }),
  );
}
