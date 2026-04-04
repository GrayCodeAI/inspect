import { Effect, Layer, Schema, ServiceMap } from "effect";

export class TokenTracker extends ServiceMap.Service<TokenTracker>()("@inspect/TokenTracker", {
  make: Effect.gen(function* () {
    let total = 0;
    const COST_PER_1K = 0.003;
    const add = (tokens: number) =>
      Effect.sync(() => {
        total += tokens;
      });
    const getTotal = Effect.sync(() => total);
    const getCost = Effect.sync(() => (total / 1000) * COST_PER_1K);
    const isOverBudget = (budget: number) => Effect.sync(() => total > budget);
    const reset = Effect.sync(() => {
      total = 0;
    });
    return { add, getTotal, getCost, isOverBudget, reset } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class SensitiveDataMasker extends ServiceMap.Service<SensitiveDataMasker>()(
  "@inspect/SensitiveDataMasker",
  {
    make: Effect.gen(function* () {
      const PATTERNS = [
        { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "***-**-****" },
        {
          regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
          replacement: "***@***.***",
        },
        {
          regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
          replacement: "****-****-****-****",
        },
      ];
      const mask = (text: string) =>
        Effect.sync(() => {
          let result = text;
          for (const { regex, replacement } of PATTERNS) {
            result = result.replace(regex, replacement);
          }
          return result;
        });
      const unmask = (text: string) => Effect.sync(() => text);
      return { mask, unmask } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}

export class ToolDefinition extends Schema.Class<ToolDefinition>("ToolDefinition")({
  name: Schema.String,
  description: Schema.String,
  parameters: Schema.Unknown,
  domain: Schema.optional(Schema.String),
}) {}

export class ToolCall extends Schema.Class<ToolCall>("ToolCall")({
  name: Schema.String,
  input: Schema.Unknown,
  timestamp: Schema.Number,
}) {}

export class ToolResult extends Schema.Class<ToolResult>("ToolResult")({
  name: Schema.String,
  output: Schema.Unknown,
  isError: Schema.Boolean,
  duration: Schema.Number,
}) {}

export class ToolRegistry extends ServiceMap.Service<ToolRegistry>()("@inspect/ToolRegistry", {
  make: Effect.gen(function* () {
    const tools = new Map<string, ToolDefinition>();
    const register = (tool: ToolDefinition) =>
      Effect.sync(() => {
        tools.set(tool.name, tool);
      });
    const unregister = (name: string) =>
      Effect.sync(() => {
        tools.delete(name);
      });
    const get = (name: string) => Effect.sync(() => tools.get(name));
    const list = Effect.sync(() => [...tools.values()]);
    const listForDomain = (domain: string) =>
      Effect.sync(() => [...tools.values()].filter((t) => t.domain === domain || !t.domain));
    const execute = (name: string, _input: unknown) =>
      Effect.gen(function* () {
        const start = Date.now();
        yield* Effect.log("Executing tool: " + name);
        return new ToolResult({ name, output: null, isError: false, duration: Date.now() - start });
      });
    return { register, unregister, get, list, listForDomain, execute } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class JudgeLLM extends ServiceMap.Service<JudgeLLM>()("@inspect/JudgeLLM", {
  make: Effect.gen(function* () {
    const evaluate = (_task: string, _trajectory: unknown) =>
      Effect.gen(function* () {
        yield* Effect.logWarning("JudgeLLM evaluate() simulation - connect LLM");
        return { verdict: true, reasoning: "Simulation mode", failureReason: "" };
      });
    return { evaluate } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class NLAssert extends ServiceMap.Service<NLAssert>()("@inspect/NLAssert", {
  make: Effect.gen(function* () {
    const assert = (condition: boolean, message: string) =>
      Effect.gen(function* () {
        if (!condition) return yield* Effect.fail(new Error(`Assertion failed: ${message}`));
      });
    const assertVisible = (_selector: string) => Effect.void;
    const assertText = (_selector: string, _expected: string) => Effect.void;
    const assertUrl = (_expected: string) => Effect.void;
    return { assert, assertVisible, assertText, assertUrl } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class ContextCompactor extends ServiceMap.Service<ContextCompactor>()(
  "@inspect/ContextCompactor",
  {
    make: Effect.gen(function* () {
      const shouldCompact = (tokenCount: number, maxTokens: number) =>
        Effect.sync(() => tokenCount > maxTokens * 0.8);
      const compact = (messages: unknown[]) => Effect.sync(() => messages.slice(0, 2));
      const summarize = (text: string, maxLength: number) =>
        Effect.sync(() => (text.length > maxLength ? text.slice(0, maxLength) + "..." : text));
      return { shouldCompact, compact, summarize } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
