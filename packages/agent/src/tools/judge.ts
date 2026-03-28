// ============================================================================
// @inspect/agent - Judge LLM
//
// Separate LLM call that verifies whether the agent ACTUALLY accomplished
// the task — not just "did the steps pass" but "was the goal achieved?"
// Inspired by Browser Use's judge_llm.
// ============================================================================

import type { LLMProvider, LLMMessage } from "../providers/base.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/judge");

export interface JudgeInput {
  /** The original task/instruction */
  task: string;
  /** URL that was tested */
  url: string;
  /** Summary of steps taken */
  stepsSummary: string;
  /** Final page state (ARIA snapshot or text) */
  finalPageState: string;
  /** Optional screenshot (base64) */
  screenshot?: string;
  /** Errors encountered */
  errors: string[];
}

export interface JudgeVerdict {
  /** Whether the task was accomplished */
  success: boolean;
  /** Confidence 0-1 */
  confidence: number;
  /** Explanation of the verdict */
  reason: string;
  /** Specific evidence found */
  evidence: string[];
  /** Suggestions for improvement */
  suggestions: string[];
}

const JUDGE_PROMPT = `You are a strict QA judge. Your job is to determine whether a browser automation agent ACTUALLY accomplished its task.

Rules:
- Be strict: "steps passed" does not mean "task accomplished"
- Look at the FINAL page state — is the expected outcome visible?
- If the agent clicked random things without achieving the goal, that's a FAILURE
- Return JSON: {"success": true/false, "confidence": 0.0-1.0, "reason": "...", "evidence": ["..."], "suggestions": ["..."]}`;

/**
 * JudgeLLM validates whether the agent actually accomplished the task.
 *
 * Usage:
 * ```ts
 * const judge = new JudgeLLM(provider);
 * const verdict = await judge.evaluate({
 *   task: "Login to the app",
 *   url: "https://example.com",
 *   stepsSummary: "Clicked Quick Play, clicked Play (failed), clicked Leave",
 *   finalPageState: "[heading] Lobby [button] Play...",
 *   errors: ["Could not find element: Play"],
 * });
 *
 * if (!verdict.success) {
 *   // Agent claimed it tested, but judge says goal wasn't met
 * }
 * ```
 */
export class JudgeLLM {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async evaluate(input: JudgeInput): Promise<JudgeVerdict> {
    const userContent = [
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

    const messages: LLMMessage[] = [
      { role: "user", content: userContent },
    ];

    const response = await this.provider.chat(messages, undefined, {
      systemPrompt: JUDGE_PROMPT,
      temperature: 0,
      maxTokens: 500,
      responseFormat: "json",
    });

    try {
      const parsed = JSON.parse(response.content) as Partial<JudgeVerdict>;
      return {
        success: parsed.success === true,
        confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
        reason: parsed.reason ?? "No reason provided",
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    } catch (error) {
      logger.warn("Failed to parse judge verdict JSON", { err: error instanceof Error ? error.message : String(error) });
      const text = response.content.toLowerCase();
      return {
        success: text.includes("success") && !text.includes("not success"),
        confidence: 0.3,
        reason: response.content.slice(0, 200),
        evidence: [],
        suggestions: [],
      };
    }
  }
}
