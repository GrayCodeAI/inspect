// ============================================================================
// @inspect/agent - Natural Language Assertion Verifier
//
// Uses an LLM to evaluate whether a natural language assertion holds true
// given the current page state (ARIA snapshot, screenshot, console logs).
// ============================================================================

// import type { LLMProvider, LLMMessage, LLMContentPart } from "@inspect/llm";
// TODO: Refactor to use Effect-TS LLMProviderService
interface LLMProvider {
  chat: (
    messages: unknown[],
    options?: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      responseFormat?: string;
    },
  ) => Promise<{ content: string; usage: { totalTokens: number } }>;
}
type LLMMessage = { role: string; content: unknown };
type LLMContentPart = { type: string; text?: string; media_type?: string; data?: string };
import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/nl-assert");

export interface AssertionContext {
  /** ARIA tree or markdown representation of the page */
  pageContent: string;
  /** Optional base64-encoded screenshot for vision-based assertions */
  screenshot?: string;
  /** Console messages from the page */
  consoleLogs?: string[];
  /** Current page URL */
  url?: string;
  /** Current page title */
  title?: string;
}

export interface AssertionResult {
  /** Whether the assertion passed */
  passed: boolean;
  /** Confidence score (0-1) */
  confidence: number;
  /** Explanation of the verdict */
  reasoning: string;
  /** Specific evidence found (or not found) on the page */
  evidence: string[];
  /** Token usage for this assertion check */
  tokenUsage: number;
}

const ASSERTION_SYSTEM_PROMPT = `You are a precise UI testing assertion verifier. Your job is to determine whether a given assertion about a web page is TRUE or FALSE based on the provided page state.

Rules:
- Respond ONLY with a JSON object in this exact format: {"passed": true/false, "confidence": 0.0-1.0, "reasoning": "...", "evidence": ["..."]}
- Be strict: the assertion must be clearly supported by the evidence
- If the evidence is ambiguous, set confidence lower and explain why
- Look at the page content, structure, and any visible text
- For numeric assertions, verify exact values
- For visual assertions with a screenshot, describe what you observe
- "evidence" should list specific text/elements you found (or expected but didn't find)`;

/**
 * NLAssert evaluates natural language assertions against page state.
 *
 * Examples:
 *   - "the cart shows 3 items"
 *   - "the login form has an error message about invalid password"
 *   - "the navigation menu has a 'Settings' link"
 *   - "no console errors are present"
 *   - "the page title contains 'Dashboard'"
 */
export class NLAssert {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  /**
   * Verify a natural language assertion against the current page state.
   */
  async verify(assertion: string, context: AssertionContext): Promise<AssertionResult> {
    const messages = this.buildMessages(assertion, context);

    const response = await this.provider.chat(messages, {
      systemPrompt: ASSERTION_SYSTEM_PROMPT,
      temperature: 0,
      maxTokens: 500,
      responseFormat: "json",
    });

    const tokenUsage = response.usage.totalTokens;

    try {
      const parsed = JSON.parse(response.content) as {
        passed?: boolean;
        confidence?: number;
        reasoning?: string;
        evidence?: string[];
      };

      return {
        passed: parsed.passed === true,
        confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
        reasoning: parsed.reasoning ?? "No reasoning provided",
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
        tokenUsage,
      };
    } catch (error) {
      logger.warn("Failed to parse assertion result JSON", {
        err: error instanceof Error ? error.message : String(error),
      });
      const text = response.content.toLowerCase();
      const passed = text.includes("true") || text.includes("passed");

      return {
        passed,
        confidence: 0.3,
        reasoning: `Could not parse structured response: ${response.content.slice(0, 200)}`,
        evidence: [],
        tokenUsage,
      };
    }
  }

  /**
   * Verify multiple assertions in a single LLM call (batch mode).
   */
  async verifyBatch(assertions: string[], context: AssertionContext): Promise<AssertionResult[]> {
    if (assertions.length === 0) return [];
    if (assertions.length === 1) return [await this.verify(assertions[0], context)];

    const numbered = assertions.map((a, i) => `${i + 1}. ${a}`).join("\n");

    const userContent = this.buildUserContent(
      `Verify each of these assertions and respond with a JSON array of results (one per assertion):\n\n${numbered}`,
      context,
    );

    const messages: LLMMessage[] = [{ role: "user", content: userContent }];

    const response = await this.provider.chat(messages, {
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
        confidence: Math.max(0, Math.min(1, r.confidence ?? 0.5)),
        reasoning: r.reasoning ?? "",
        evidence: Array.isArray(r.evidence) ? r.evidence : [],
        tokenUsage: perTokenCost,
      }));
    } catch (error) {
      logger.warn(
        "Failed to parse batch assertion results, falling back to individual verification",
        { err: error instanceof Error ? error.message : String(error) },
      );
      return Promise.all(assertions.map((a) => this.verify(a, context)));
    }
  }

  private buildMessages(assertion: string, context: AssertionContext): LLMMessage[] {
    const userContent = this.buildUserContent(`Verify this assertion: "${assertion}"`, context);

    return [{ role: "user", content: userContent }];
  }

  private buildUserContent(prompt: string, context: AssertionContext): string | LLMContentPart[] {
    let textContent = prompt + "\n\n";

    if (context.url) textContent += `**URL:** ${context.url}\n`;
    if (context.title) textContent += `**Title:** ${context.title}\n`;
    textContent += `\n**Page content:**\n\`\`\`\n${context.pageContent.slice(0, 15000)}\n\`\`\`\n`;

    if (context.consoleLogs && context.consoleLogs.length > 0) {
      textContent += `\n**Console logs:**\n${context.consoleLogs.slice(0, 20).join("\n")}\n`;
    }

    // If we have a screenshot, send as multimodal
    if (context.screenshot) {
      const parts: LLMContentPart[] = [
        { type: "text", text: textContent },
        {
          type: "image_base64",
          media_type: "image/png",
          data: context.screenshot,
        },
      ];
      return parts;
    }

    return textContent;
  }
}
