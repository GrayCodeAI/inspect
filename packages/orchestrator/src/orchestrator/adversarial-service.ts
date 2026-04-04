import { Effect, Layer, Schema, ServiceMap } from "effect";

export class AdversarialFinding extends Schema.Class<AdversarialFinding>("AdversarialFinding")({
  severity: Schema.Literals(["critical", "high", "medium", "low", "info"] as const),
  category: Schema.Literals([
    "security",
    "functionality",
    "ux",
    "performance",
    "accessibility",
  ] as const),
  instruction: Schema.String,
  finding: Schema.String,
  steps: Schema.Array(Schema.String),
  expected: Schema.String,
  actual: Schema.String,
}) {}

export class AdversarialExecutor extends ServiceMap.Service<
  AdversarialExecutor,
  {
    readonly generateTests: (
      instruction: string,
      intensity: "basic" | "standard" | "aggressive",
    ) => Effect.Effect<readonly string[]>;
    readonly execute: (test: string) => Effect.Effect<AdversarialFinding | undefined>;
  }
>()("@inspect/AdversarialExecutor") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const generateTests = Effect.fn("AdversarialExecutor.generateTests")(function* (
        instruction: string,
        intensity: "basic" | "standard" | "aggressive",
      ) {
        const tests: string[] = [
          "Empty input submission",
          "Maximum length input",
          "Special characters injection",
          "SQL injection attempt",
          "XSS payload injection",
        ];
        if (intensity === "standard" || intensity === "aggressive") {
          tests.push("Race condition: double submit", "Unicode edge cases");
        }
        if (intensity === "aggressive") {
          tests.push("Concurrent session manipulation", "Memory exhaustion");
        }
        return tests;
      });
      const execute = Effect.fn("AdversarialExecutor.execute")(function* (_test: string) {
        return undefined;
      });
      return { generateTests, execute } as const;
    }),
  );
}
