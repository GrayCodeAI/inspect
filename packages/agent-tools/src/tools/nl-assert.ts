import { Schema, Predicate } from "effect";

export const AssertionContext = Schema.Struct({
  pageContent: Schema.String,
  screenshot: Schema.optional(Schema.String),
  consoleLogs: Schema.optional(Schema.Array(Schema.String)),
  url: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
});
export type AssertionContext = typeof AssertionContext.Type;

export const AssertionResult = Schema.Struct({
  passed: Schema.Boolean,
  confidence: Schema.Number,
  reasoning: Schema.String,
  evidence: Schema.Array(Schema.String),
  tokenUsage: Schema.Number,
});
export type AssertionResult = typeof AssertionResult.Type;

interface LLMProvider {
  chat: (
    messages: Array<{ role: string; content: unknown }>,
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

function buildUserContent(prompt: string, context: AssertionContext): string {
  let textContent = prompt + "\n\n";

  if (context.url) textContent += `**URL:** ${context.url}\n`;
  if (context.title) textContent += `**Title:** ${context.title}\n`;
  textContent += `\n**Page content:**\n\`\`\`\n${context.pageContent.slice(0, 15000)}\n\`\`\`\n`;

  if (context.consoleLogs && context.consoleLogs.length > 0) {
    textContent += `\n**Console logs:**\n${context.consoleLogs.slice(0, 20).join("\n")}\n`;
  }

  return textContent;
}

function buildFallbackVerdict(content: string, totalTokens: number): AssertionResult {
  const text = content.toLowerCase();
  const passed = text.includes("true") || text.includes("passed");

  return {
    passed,
    confidence: 0.3,
    reasoning: `Could not parse structured response: ${content.slice(0, 200)}`,
    evidence: [],
    tokenUsage: totalTokens,
  };
}

function parseVerdictJson(content: string, totalTokens: number): AssertionResult {
  try {
    const parsed = JSON.parse(content) as {
      passed?: boolean;
      confidence?: number;
      reasoning?: string;
      evidence?: string[];
    };

    if (!Predicate.isObject(parsed) || typeof parsed.passed !== "boolean") {
      return buildFallbackVerdict(content, totalTokens);
    }

    return {
      passed: parsed.passed,
      confidence: normalizeConfidence(parsed.confidence ?? 0.5),
      reasoning: parsed.reasoning ?? "No reasoning provided",
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      tokenUsage: totalTokens,
    };
  } catch {
    return buildFallbackVerdict(content, totalTokens);
  }
}

const ASSERTION_SYSTEM_PROMPT = `You are a precise UI testing assertion verifier. Your job is to determine whether a given assertion about a web page is TRUE or FALSE based on the provided page state.

Rules:
- Respond ONLY with a JSON object in this exact format: {"passed": true/false, "confidence": 0.0-1.0, "reasoning": "...", "evidence": ["..."]}
- Be strict: the assertion must be clearly supported by the evidence
- If the evidence is ambiguous, set confidence lower and explain why
- Look at the page content, structure, and any visible text
- For numeric assertions, verify exact values
- For visual assertions with a screenshot, describe what you observe`;

export class NLAssert {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async verify(assertion: string, context: AssertionContext): Promise<AssertionResult> {
    const userContent = buildUserContent(`Verify this assertion: "${assertion}"`, context);

    const response = await this.provider.chat([{ role: "user", content: userContent }], {
      systemPrompt: ASSERTION_SYSTEM_PROMPT,
      temperature: 0,
      maxTokens: 500,
      responseFormat: "json",
    });

    return parseVerdictJson(response.content, response.usage.totalTokens);
  }

  async verifyBatch(assertions: string[], context: AssertionContext): Promise<AssertionResult[]> {
    if (assertions.length === 0) return [];
    if (assertions.length === 1) return [await this.verify(assertions[0], context)];

    const numbered = assertions.map((a, i) => `${i + 1}. ${a}`).join("\n");

    const userContent = buildUserContent(
      `Verify each of these assertions and respond with a JSON array of results (one per assertion):\n\n${numbered}`,
      context,
    );

    const response = await this.provider.chat([{ role: "user", content: userContent }], {
      systemPrompt:
        ASSERTION_SYSTEM_PROMPT +
        "\n\nFor batch mode: respond with a JSON array of result objects, one per assertion.",
      temperature: 0,
      maxTokens: 1000,
      responseFormat: "json",
    });

    try {
      const parsed = JSON.parse(response.content) as Array<{
        passed?: boolean;
        confidence?: number;
        reasoning?: string;
        evidence?: string[];
      }>;

      const perTokenCost = Math.floor(response.usage.totalTokens / assertions.length);

      return parsed.map((r) => ({
        passed: r.passed === true,
        confidence: normalizeConfidence(r.confidence ?? 0.5),
        reasoning: r.reasoning ?? "",
        evidence: Array.isArray(r.evidence) ? r.evidence : [],
        tokenUsage: perTokenCost,
      }));
    } catch {
      return Promise.all(assertions.map((a) => this.verify(a, context)));
    }
  }
}
