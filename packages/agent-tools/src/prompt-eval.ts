// ──────────────────────────────────────────────────────────────────────────────
// PromptEval — Structured prompt evaluation framework (Anthropic courses)
// Supports human-graded, code-graded, classification, and model-graded evals
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Option, Schema, ServiceMap } from "effect";

export type EvalGrade = "pass" | "fail" | "partial";

export const EvalGradeSchema = Schema.Literals(["pass", "fail", "partial"] as const);

export class EvalExample extends Schema.Class<EvalExample>("EvalExample")({
  id: Schema.String,
  input: Schema.String,
  expectedOutput: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
}) {}

export class EvalResult extends Schema.Class<EvalResult>("EvalResult")({
  exampleId: Schema.String,
  input: Schema.String,
  actualOutput: Schema.String,
  expectedOutput: Schema.String,
  grade: EvalGradeSchema,
  score: Schema.Number,
  feedback: Schema.String,
}) {}

export class EvalReport extends Schema.Class<EvalReport>("EvalReport")({
  totalExamples: Schema.Number,
  passed: Schema.Number,
  failed: Schema.Number,
  partial: Schema.Number,
  averageScore: Schema.Number,
  passRate: Schema.Number,
  results: Schema.Array(EvalResult),
  timestamp: Schema.String,
}) {}

export class GradingError extends Schema.ErrorClass<GradingError>("GradingError")({
  _tag: Schema.tag("GradingError"),
  errorMessage: Schema.String,
}) {}

export class LLMGradingError extends Schema.ErrorClass<LLMGradingError>("LLMGradingError")({
  _tag: Schema.tag("LLMGradingError"),
  errorMessage: Schema.String,
}) {}

export interface GradingResult {
  grade: EvalGrade;
  score: number;
  feedback: string;
}

export type EvalGrader = (
  input: string,
  actualOutput: string,
  expectedOutput: string,
) => Effect.Effect<GradingResult, GradingError>;

export type LLMCall = (prompt: string) => Effect.Effect<string, GradingError>;

const scoreToGrade = (score: number): EvalGrade => {
  if (score >= 70) return "pass";
  if (score >= 50) return "partial";
  return "fail";
};

/** Exact string match grader */
export const exactMatchGrader: EvalGrader = (input: string, actual: string, expected: string) =>
  Effect.sync(() => {
    const match = actual.trim() === expected.trim();
    return {
      grade: match ? "pass" : "fail",
      score: match ? 1 : 0,
      feedback: match ? "Exact match" : `Expected "${expected}", got "${actual}"`,
    };
  });

/** Contains check grader */
export const containsGrader: EvalGrader = (input: string, actual: string, expected: string) =>
  Effect.sync(() => {
    const match = actual.toLowerCase().includes(expected.toLowerCase());
    return {
      grade: match ? "pass" : "fail",
      score: match ? 1 : 0,
      feedback: match ? "Contains expected text" : `Missing "${expected}"`,
    };
  });

/** Classification eval grader */
export const classificationGrader: EvalGrader = (input: string, actual: string, expected: string) =>
  Effect.sync(() => {
    const match = actual.toLowerCase().trim() === expected.toLowerCase().trim();
    return {
      grade: match ? "pass" : "fail",
      score: match ? 1 : 0.5,
      feedback: match
        ? "Correct classification"
        : `Expected "${expected}", classified as "${actual}"`,
    };
  });

/** LLM-graded evaluation */
export const llmGradedGrader = (
  input: string,
  actual: string,
  expected: string,
  llmCall: Option.Option<LLMCall>,
) =>
  Effect.gen(function* () {
    if (Option.isNone(llmCall)) {
      return yield* containsGrader(input, actual, expected);
    }

    const prompt = [
      "You are an evaluator grading an AI's output quality.",
      `Input: ${input}`,
      `Expected: ${expected}`,
      `Actual: ${actual}`,
      "",
      "Grade from 0-100 where:",
      "- 90-100: Exceeds expectations",
      "- 70-89: Meets expectations",
      "- 50-69: Partially meets expectations",
      "- 0-49: Does not meet expectations",
      "",
      "Respond with JSON: { score, feedback }",
    ].join("\n");

    const response = yield* llmCall.value(prompt).pipe(
      Effect.catchTag("GradingError", (error) =>
        new LLMGradingError({
          errorMessage: `LLM grading failed: ${error.errorMessage}`,
        }).asEffect(),
      ),
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = yield* Effect.try({
        try: () => JSON.parse(jsonMatch[0]) as { score: number; feedback: string },
        catch: () => undefined,
      });

      if (parsed && typeof parsed.score === "number" && typeof parsed.feedback === "string") {
        return {
          grade: scoreToGrade(parsed.score),
          score: parsed.score,
          feedback: parsed.feedback,
        };
      }
    }

    return yield* containsGrader(input, actual, expected);
  });

/** Built-in graders for common evaluation patterns. */
export const graders = {
  exactMatch: exactMatchGrader,
  contains: containsGrader,
  classification: classificationGrader,
  llmGraded: llmGradedGrader,
};

/** Evaluate a set of examples with a grader function. */
export const runEval = (
  examples: EvalExample[],
  runFn: (input: string) => Effect.Effect<string>,
  gradeFn: EvalGrader,
) =>
  Effect.gen(function* () {
    const results: EvalResult[] = [];

    for (const example of examples) {
      const actualOutput = yield* runFn(example.input);
      const grading = yield* gradeFn(example.input, actualOutput, example.expectedOutput);

      results.push(
        new EvalResult({
          exampleId: example.id,
          input: example.input,
          actualOutput,
          expectedOutput: example.expectedOutput,
          grade: grading.grade,
          score: grading.score,
          feedback: grading.feedback,
        }),
      );
    }

    const passed = results.filter((r) => r.grade === "pass").length;
    const failed = results.filter((r) => r.grade === "fail").length;
    const partial = results.filter((r) => r.grade === "partial").length;
    const totalExamples = results.length;

    return new EvalReport({
      totalExamples,
      passed,
      failed,
      partial,
      averageScore:
        totalExamples > 0 ? results.reduce((sum, r) => sum + r.score, 0) / totalExamples : 0,
      passRate: totalExamples > 0 ? passed / totalExamples : 0,
      results,
      timestamp: new Date().toISOString(),
    });
  });

/** Format an eval report as a markdown table. */
export const formatEvalReport = (report: EvalReport): string => {
  const lines = [
    `# Prompt Evaluation Report`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Examples | ${report.totalExamples} |`,
    `| Passed | ${report.passed} |`,
    `| Failed | ${report.failed} |`,
    `| Partial | ${report.partial} |`,
    `| Pass Rate | ${(report.passRate * 100).toFixed(1)}% |`,
    `| Average Score | ${(report.averageScore * 100).toFixed(1)} |`,
    ``,
    `## Results`,
    ``,
    `| ID | Input | Grade | Score | Feedback |`,
    `|----|-------|-------|-------|----------|`,
    ...report.results.map(
      (r) =>
        `| ${r.exampleId} | ${r.input.slice(0, 50)}... | ${r.grade} | ${r.score} | ${r.feedback} |`,
    ),
  ];

  return lines.join("\n");
};

/** PromptEval service for dependency injection. */
export class PromptEval extends ServiceMap.Service<PromptEval>()("@agent-tools/PromptEval", {
  make: Effect.gen(function* () {
    return {
      runEval,
      formatReport: formatEvalReport,
      graders,
    } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
