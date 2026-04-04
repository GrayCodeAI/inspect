// ──────────────────────────────────────────────────────────────────────────────
// @inspect/sdk - Observe Handler: Analyze pages and suggest actions
// ──────────────────────────────────────────────────────────────────────────────

import type { PageSnapshot, TokenMetrics } from "@inspect/shared";
import type { LLMClient, PageInterface } from "./act.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("sdk/observe");

/** A suggested action based on page analysis */
export interface ActionSuggestion {
  /** CSS selector or element reference for the target */
  selector: string;
  /** Human-readable description of the action */
  description: string;
  /** Type of action to perform */
  action: "click" | "fill" | "selectOption" | "hover" | "scroll" | "press" | "check" | "navigate";
  /** Arguments for the action (e.g. text to fill) */
  arguments?: Record<string, string>;
  /** Confidence score (0-1) */
  confidence: number;
  /** Element reference ID */
  ref?: string;
}

/** Options for observe operations */
export interface ObserveOptions {
  /** Only return top N suggestions (default: 10) */
  maxSuggestions?: number;
  /** LLM temperature (default: 0) */
  temperature?: number;
  /** LLM max tokens (default: 2048) */
  maxTokens?: number;
  /** Timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Filter to specific action types */
  actionTypes?: ActionSuggestion["action"][];
  /** Custom system prompt */
  systemPrompt?: string;
}

/** Result of an observe operation */
export interface ObserveResult {
  /** Whether observation succeeded */
  success: boolean;
  /** Suggested actions */
  suggestions: ActionSuggestion[];
  /** Token usage */
  tokenUsage: TokenMetrics;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
}

/**
 * ObserveHandler analyzes a page's current state and returns actionable
 * suggestions. It sends the page snapshot to an LLM which identifies
 * interactive elements and possible next steps.
 */
export class ObserveHandler {
  private llm: LLMClient;

  constructor(llm: LLMClient) {
    this.llm = llm;
  }

  /**
   * Observe a page and return action suggestions.
   *
   * @param page - Page to analyze
   * @param instruction - Context about what the user is trying to accomplish
   * @param options - Observation options
   * @returns Observation result with action suggestions
   */
  async execute(
    page: PageInterface,
    instruction: string,
    options?: ObserveOptions,
  ): Promise<ObserveResult> {
    const startTime = performance.now();
    const maxSuggestions = options?.maxSuggestions ?? 10;
    const temperature = options?.temperature ?? 0;
    const maxTokens = options?.maxTokens ?? 2048;

    try {
      // Get page snapshot
      const snapshot = await page.getSnapshot();

      // Build analysis prompt
      const prompt = this.buildPrompt(
        instruction,
        snapshot,
        maxSuggestions,
        options?.actionTypes,
        options?.systemPrompt,
      );

      // Call LLM
      const inferenceTimer = performance.now();
      const response = await this.llm.chat([{ role: "user", content: prompt }], {
        temperature,
        maxTokens,
      });
      const inferenceTimeMs = Math.round(performance.now() - inferenceTimer);

      const tokenUsage: TokenMetrics = {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        inferenceTimeMs,
        cost: 0,
      };

      // Parse suggestions from LLM response
      const suggestions = this.parseSuggestions(response.content, snapshot, maxSuggestions);

      // Filter by action types if specified
      const filtered = options?.actionTypes
        ? suggestions.filter((s) => options.actionTypes!.includes(s.action))
        : suggestions;

      return {
        success: true,
        suggestions: filtered,
        tokenUsage,
        durationMs: Math.round(performance.now() - startTime),
      };
    } catch (error) {
      return {
        success: false,
        suggestions: [],
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          reasoningTokens: 0,
          cachedInputTokens: 0,
          inferenceTimeMs: 0,
          cost: 0,
        },
        durationMs: Math.round(performance.now() - startTime),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Build the observation analysis prompt.
   */
  private buildPrompt(
    instruction: string,
    snapshot: PageSnapshot,
    maxSuggestions: number,
    actionTypes?: ActionSuggestion["action"][],
    systemPrompt?: string,
  ): string {
    const parts: string[] = [];

    if (systemPrompt) {
      parts.push(systemPrompt);
    } else {
      parts.push(
        "You are a browser analysis agent. Examine the current page state and suggest possible actions the user could take to accomplish their goal.",
      );
    }
    parts.push("");

    parts.push(`Page URL: ${snapshot.url}`);
    parts.push(`Page Title: ${snapshot.title}`);
    parts.push("");

    // List interactive elements
    const interactiveElements = snapshot.elements
      .filter((e) => e.interactable && e.visible)
      .slice(0, 150);

    parts.push("Interactive elements on the page:");
    for (const el of interactiveElements) {
      let desc = `[${el.ref}] ${el.role} "${el.name}"`;
      if (el.tagName) desc += ` <${el.tagName}>`;
      if (el.value) desc += ` value="${el.value}"`;
      if (el.cssSelector) desc += ` css="${el.cssSelector}"`;
      parts.push(desc);
    }
    parts.push("");

    if (actionTypes && actionTypes.length > 0) {
      parts.push(`Only suggest these action types: ${actionTypes.join(", ")}`);
      parts.push("");
    }

    parts.push(`User's goal: ${instruction}`);
    parts.push("");
    parts.push(
      `Suggest up to ${maxSuggestions} actions as a JSON array. Each action object should have:`,
    );
    parts.push(`{`);
    parts.push(`  "selector": "CSS selector or element ref",`);
    parts.push(`  "description": "what this action does",`);
    parts.push(`  "action": "click|fill|selectOption|hover|scroll|press|check|navigate",`);
    parts.push(`  "arguments": { "value": "..." } (if applicable),`);
    parts.push(`  "confidence": 0.0-1.0,`);
    parts.push(`  "ref": "element reference (e.g. e1)"`);
    parts.push(`}`);
    parts.push("");
    parts.push("Respond ONLY with a JSON array. No explanations.");

    return parts.join("\n");
  }

  /**
   * Parse action suggestions from LLM response.
   */
  private parseSuggestions(
    content: string,
    snapshot: PageSnapshot,
    maxSuggestions: number,
  ): ActionSuggestion[] {
    let jsonStr = content.trim();

    // Handle markdown code blocks
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Find array start
    const arrayStart = jsonStr.indexOf("[");
    if (arrayStart >= 0) {
      jsonStr = jsonStr.slice(arrayStart);
    }

    try {
      const parsed = JSON.parse(jsonStr) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) return [];

      const suggestions: ActionSuggestion[] = [];

      for (const item of parsed.slice(0, maxSuggestions)) {
        if (!item.action || !item.description) continue;

        const action = String(item.action) as ActionSuggestion["action"];
        const validActions = [
          "click",
          "fill",
          "selectOption",
          "hover",
          "scroll",
          "press",
          "check",
          "navigate",
        ];
        if (!validActions.includes(action)) continue;

        // Validate ref if provided
        const ref = item.ref ? String(item.ref) : undefined;
        if (ref) {
          const elementExists = snapshot.elements.some((e) => e.ref === ref);
          if (!elementExists) continue;
        }

        suggestions.push({
          selector: String(item.selector ?? item.ref ?? ""),
          description: String(item.description),
          action,
          arguments: item.arguments as Record<string, string> | undefined,
          confidence:
            typeof item.confidence === "number" ? Math.min(1, Math.max(0, item.confidence)) : 0.5,
          ref,
        });
      }

      // Sort by confidence descending
      suggestions.sort((a, b) => b.confidence - a.confidence);

      return suggestions;
    } catch (error) {
      logger.warn("Failed to parse action suggestions from LLM response", {
        error: error instanceof Error ? error.message : error,
      });
      return [];
    }
  }
}
