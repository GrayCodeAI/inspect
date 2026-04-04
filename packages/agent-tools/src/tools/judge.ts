import { Schema, Predicate } from "effect";

export const JudgeInput = Schema.Struct({
  task: Schema.String,
  url: Schema.String,
  stepsSummary: Schema.String,
  finalPageState: Schema.String,
  screenshot: Schema.optional(Schema.String),
  errors: Schema.Array(Schema.String),
});
export type JudgeInput = typeof JudgeInput.Type;

export const JudgeVerdict = Schema.Struct({
  success: Schema.Boolean,
  confidence: Schema.Number,
  reason: Schema.String,
  evidence: Schema.Array(Schema.String),
  suggestions: Schema.Array(Schema.String),
});
export type JudgeVerdict = typeof JudgeVerdict.Type;

interface LLMProvider {
  chat: (
    messages: Array<{ role: string; content: string }>,
    options?: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      responseFormat?: string;
    },
  ) => Promise<{ content: string; usage: { totalTokens: number } }>;
}

function normalizeConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildUserContent(input: JudgeInput): string {
  return [
    `Task: ${input.task}`,
    `URL: ${input.url}`,
    "",
    `Steps taken:`,
    input.stepsSummary,
    "",
    `Errors encountered: ${input.errors.length > 0 ? input.errors.join("; ") : "None"}`,
    "",
    `Final page state:`,
    input.finalPageState.slice(0, 5000),
  ].join("\n");
}

function buildFallbackVerdict(content: string): JudgeVerdict {
  const text = content.toLowerCase();
  return {
    success: text.includes("success") && !text.includes("not success"),
    confidence: 0.3,
    reason: content.slice(0, 200),
    evidence: [],
    suggestions: [],
  };
}

function parseVerdictJson(content: string): JudgeVerdict {
  try {
    const parsed = JSON.parse(content) as {
      success?: boolean;
      confidence?: number;
      reason?: string;
      evidence?: string[];
      suggestions?: string[];
    };

    if (!Predicate.isObject(parsed) || typeof parsed.success !== "boolean") {
      return buildFallbackVerdict(content);
    }

    return {
      success: parsed.success,
      confidence: normalizeConfidence(parsed.confidence ?? 0.5),
      reason: parsed.reason ?? "No reason provided",
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    };
  } catch {
    return buildFallbackVerdict(content);
  }
}

const JUDGE_PROMPT = `You are a strict QA judge. Your job is to determine whether a browser automation agent ACTUALLY accomplished its task.

Rules:
- Be strict: "steps passed" does not mean "task accomplished"
- Look at the FINAL page state — is the expected outcome visible?
- If the agent clicked random things without achieving the goal, that's a FAILURE
- Return JSON: {"success": true/false, "confidence": 0.0-1.0, "reason": "...", "evidence": ["..."], "suggestions": ["..."]}`;

export class JudgeLLM {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async evaluate(input: JudgeInput): Promise<JudgeVerdict> {
    const userContent = buildUserContent(input);

    const response = await this.provider.chat([{ role: "user", content: userContent }], {
      systemPrompt: JUDGE_PROMPT,
      temperature: 0,
      maxTokens: 500,
      responseFormat: "json",
    });

    return parseVerdictJson(response.content);
  }
}
