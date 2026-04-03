// ──────────────────────────────────────────────────────────────────────────────
// PromptEval — Structured prompt evaluation framework (Anthropic courses)
// Supports human-graded, code-graded, classification, and model-graded evals
// ──────────────────────────────────────────────────────────────────────────────

export type EvalGrade = "pass" | "fail" | "partial";

export interface EvalExample {
  id: string;
  input: string;
  expectedOutput: string;
  metadata?: Record<string, unknown>;
}

export interface EvalResult {
  exampleId: string;
  input: string;
  actualOutput: string;
  expectedOutput: string;
  grade: EvalGrade;
  score: number;
  feedback: string;
}

export interface EvalReport {
  totalExamples: number;
  passed: number;
  failed: number;
  partial: number;
  averageScore: number;
  passRate: number;
  results: EvalResult[];
  timestamp: string;
}

export type EvalGrader = (
  input: string,
  actualOutput: string,
  expectedOutput: string,
) => Promise<{ grade: EvalGrade; score: number; feedback: string }>;

/** Built-in graders for common evaluation patterns. */
export const graders = {
  /** Exact string match */
  exactMatch: async (_input: string, actual: string, expected: string) => {
    const match = actual.trim() === expected.trim();
    return {
      grade: match ? "pass" : "fail",
      score: match ? 1 : 0,
      feedback: match ? "Exact match" : `Expected "${expected}", got "${actual}"`,
    };
  },

  /** Contains check — expected substring in actual output */
  contains: async (_input: string, actual: string, expected: string) => {
    const match = actual.toLowerCase().includes(expected.toLowerCase());
    return {
      grade: match ? "pass" : "fail",
      score: match ? 1 : 0,
      feedback: match ? "Contains expected text" : `Missing "${expected}"`,
    };
  },

  /** LLM-graded evaluation — uses an LLM to judge output quality */
  llmGraded: async (
    input: string,
    actual: string,
    expected: string,
    llmCall?: (prompt: string) => Promise<string>,
  ) => {
    if (!llmCall) {
      return graders.contains(input, actual, expected);
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

    try {
      const response = await llmCall(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { score: number; feedback: string };
        const grade: EvalGrade =
          parsed.score >= 70 ? "pass" : parsed.score >= 50 ? "partial" : "fail";
        return { grade, score: parsed.score, feedback: parsed.feedback };
      }
    } catch {
      // Fallback to contains
    }

    return graders.contains(input, actual, expected);
  },

  /** Classification eval — check if output matches expected category */
  classification: async (_input: string, actual: string, expected: string) => {
    const match = actual.toLowerCase().trim() === expected.toLowerCase().trim();
    return {
      grade: match ? "pass" : "fail",
      score: match ? 1 : 0.5,
      feedback: match
        ? "Correct classification"
        : `Expected "${expected}", classified as "${actual}"`,
    };
  },
};

/** Evaluate a set of examples with a grader function. */
export async function runEval(
  examples: EvalExample[],
  runFn: (input: string) => Promise<string>,
  gradeFn: EvalGrader,
): Promise<EvalReport> {
  const results: EvalResult[] = [];

  for (const example of examples) {
    const actualOutput = await runFn(example.input);
    const grading = await gradeFn(example.input, actualOutput, example.expectedOutput);

    results.push({
      exampleId: example.id,
      input: example.input,
      actualOutput,
      expectedOutput: example.expectedOutput,
      grade: grading.grade,
      score: grading.score,
      feedback: grading.feedback,
    });
  }

  const passed = results.filter((r) => r.grade === "pass").length;
  const failed = results.filter((r) => r.grade === "fail").length;
  const partial = results.filter((r) => r.grade === "partial").length;

  return {
    totalExamples: results.length,
    passed,
    failed,
    partial,
    averageScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
    passRate: passed / results.length,
    results,
    timestamp: new Date().toISOString(),
  };
}

/** Format an eval report as a markdown table. */
export function formatEvalReport(report: EvalReport): string {
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
}
