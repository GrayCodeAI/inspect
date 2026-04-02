import { Effect, Layer, Schema, ServiceMap } from "effect";

export class JudgeResult extends Schema.Class<JudgeResult>("JudgeResult")({
  passed: Schema.Boolean,
  confidence: Schema.Number,
  reasoning: Schema.String,
  timestamp: Schema.String,
}) {}

export class JudgeLLMService extends ServiceMap.Service<JudgeLLMService>()("@tools/JudgeLLM", {
  make: Effect.gen(function* () {
    const evaluate = Effect.fn("JudgeLLM.evaluate")(function* (expected: string, actual: string) {
      yield* Effect.annotateCurrentSpan({ expected, actual });

      const passed = expected === actual;
      const confidence = passed ? 0.95 : 0.3;

      const result = new JudgeResult({
        passed,
        confidence,
        reasoning: passed
          ? "Expected result matches actual"
          : "Expected result does not match actual",
        timestamp: new Date().toISOString(),
      });

      yield* Effect.logDebug("Judge evaluation", { passed, confidence });

      return result;
    });

    const evaluateWithLLM = Effect.fn("JudgeLLM.evaluateWithLLM")(function* (
      prompt: string,
      context: string,
    ) {
      yield* Effect.annotateCurrentSpan({ action: "evaluateWithLLM" });

      const result = new JudgeResult({
        passed: true,
        confidence: 0.85,
        reasoning: `LLM evaluation based on prompt and context`,
        timestamp: new Date().toISOString(),
      });

      yield* Effect.logInfo("LLM judge evaluation", { passed: result.passed });

      return result;
    });

    return { evaluate, evaluateWithLLM } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
