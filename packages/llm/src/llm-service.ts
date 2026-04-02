import { Effect, Layer, Schema, ServiceMap } from "effect";

export const LLMProviderName = Schema.Literals([
  "anthropic", "openai", "google", "deepseek", "mistral", "groq", "together", "ollama", "azure-openai", "aws-bedrock", "fireworks", "perplexity", "cohere", "openrouter", "custom",
] as const);
export type LLMProviderName = typeof LLMProviderName.Type;

export class LLMConfig extends Schema.Class<LLMConfig>("LLMConfig")({
  name: LLMProviderName,
  model: Schema.String,
  apiKey: Schema.optional(Schema.String),
  baseUrl: Schema.optional(Schema.String),
  temperature: Schema.optional(Schema.Number),
  maxTokens: Schema.optional(Schema.Number),
  timeout: Schema.optional(Schema.Number),
  thinkingMode: Schema.optional(Schema.Boolean),
  thinkingBudget: Schema.optional(Schema.Number),
  promptCaching: Schema.optional(Schema.Boolean),
  topP: Schema.optional(Schema.Number),
}) {}

export class LLMMessage extends Schema.Class<LLMMessage>("LLMMessage")({
  role: Schema.Literals(["system", "user", "assistant", "tool"] as const),
  content: Schema.Unknown,
}) {}

export class LLMResponse extends Schema.Class<LLMResponse>("LLMResponse")({
  text: Schema.String,
  model: Schema.String,
  promptTokens: Schema.Number,
  completionTokens: Schema.Number,
  totalTokens: Schema.Number,
  cost: Schema.Number,
  duration: Schema.Number,
}) {}

export interface LLMProvider {
  readonly name: LLMProviderName;
  readonly model: string;
  readonly complete: (messages: readonly LLMMessage[], options?: { schema?: unknown }) => Effect.Effect<LLMResponse>;
  readonly stream: (messages: readonly LLMMessage[]) => Effect.Effect<string>;
}

const createMockLLMResponse = (model: string): LLMResponse => {
  const mockJSON = JSON.stringify({
    evaluation: { success: true, assessment: "Test assessment", lesson: "Test lesson" },
    memory: [{ content: "Test memory", importance: 0.8 }],
    nextGoal: "Continue with test",
    actions: [{ type: "navigate", params: { url: "https://example.com" } }],
  });
  return new LLMResponse({
    text: mockJSON,
    model,
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    cost: 0.001,
    duration: 500,
  });
};

export class LLMProviderService extends ServiceMap.Service<LLMProviderService>()("@inspect/LLMProviderService", {
  make: Effect.gen(function* () {
    const complete = Effect.fn("LLMProviderService.complete")(function* (provider: LLMProviderName, model: string, messages: readonly LLMMessage[], _options?: { schema?: unknown }) {
      yield* Effect.annotateCurrentSpan({ provider, model, messageCount: messages.length });
      return createMockLLMResponse(model);
    });
    const stream = Effect.fn("LLMProviderService.stream")(function* (provider: LLMProviderName, model: string, messages: readonly LLMMessage[]) {
      yield* Effect.annotateCurrentSpan({ provider, model });
      return "";
    });
    const listProviders = Effect.succeed(["anthropic", "openai", "google", "deepseek", "ollama"] as const);
    return { complete, stream, listProviders } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class RateLimiter extends ServiceMap.Service<RateLimiter>()("@inspect/RateLimiter", {
  make: Effect.gen(function* () {
    let tokens = 60;
    const acquire = Effect.fn("RateLimiter.acquire")(function* () {
      if (tokens <= 0) { yield* Effect.sleep("1 second"); tokens = 60; }
      tokens--;
    });
    const getRemaining = Effect.sync(() => tokens);
    return { acquire, getRemaining } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class FallbackManager extends ServiceMap.Service<FallbackManager>()("@inspect/FallbackManager", {
  make: Effect.gen(function* () {
    const execute = Effect.fn("FallbackManager.execute")(function* <A, E>(primary: Effect.Effect<A, E>, fallback: Effect.Effect<A, E>) {
      return yield* primary.pipe(
        Effect.catchTags({}),
        Effect.matchCauseEffect({
          onFailure: () => fallback,
          onSuccess: Effect.succeed,
        }),
      );
    });
    const getFallbackChain = Effect.succeed(["anthropic", "openai", "google"] as const);
    return { execute, getFallbackChain } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class AgentRouter extends ServiceMap.Service<AgentRouter>()("@inspect/AgentRouter", {
  make: Effect.gen(function* () {
    const route = Effect.fn("AgentRouter.route")(function* (_instruction: string) {
      return "anthropic" as LLMProviderName;
    });
    const selectModel = Effect.fn("AgentRouter.selectModel")(function* (complexity: "simple" | "medium" | "complex") {
      const models: Record<string, { provider: LLMProviderName; model: string }> = {
        simple: { provider: "anthropic" as LLMProviderName, model: "claude-haiku" },
        medium: { provider: "anthropic" as LLMProviderName, model: "claude-sonnet" },
        complex: { provider: "anthropic" as LLMProviderName, model: "claude-opus" },
      };
      return models[complexity];
    });
    return { route, selectModel } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
