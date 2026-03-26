// ──────────────────────────────────────────────────────────────────────────────
// @inspect/sdk - Extract Handler: Structured data extraction from pages
// ──────────────────────────────────────────────────────────────────────────────

import type { PageSnapshot, TokenMetrics } from "@inspect/shared";
import type { LLMClient, PageInterface } from "./act.js";

/** Zod-like schema interface for validation */
export interface SchemaLike {
  parse(data: unknown): unknown;
  safeParse(data: unknown): { success: boolean; data?: unknown; error?: { message: string } };
}

/** Options for extraction */
export interface ExtractOptions {
  /** Zod schema for output validation */
  schema?: SchemaLike;
  /** Maximum retries on validation failure (default: 3) */
  maxRetries?: number;
  /** LLM temperature (default: 0) */
  temperature?: number;
  /** LLM max tokens (default: 4096) */
  maxTokens?: number;
  /** Include page screenshot in context (default: false) */
  includeScreenshot?: boolean;
  /** Timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Custom system prompt */
  systemPrompt?: string;
}

/** Result of an extraction */
export interface ExtractResult<T = unknown> {
  /** Whether extraction succeeded */
  success: boolean;
  /** The extracted data */
  data: T | null;
  /** Raw LLM response text */
  rawResponse: string;
  /** Number of attempts made */
  attempts: number;
  /** Token usage for all attempts */
  tokenUsage: TokenMetrics;
  /** Duration in milliseconds */
  durationMs: number;
  /** Validation error if schema validation failed */
  validationError?: string;
  /** Error message if extraction failed */
  error?: string;
}

/**
 * ExtractHandler extracts structured data from web pages using LLM analysis.
 * Sends the page snapshot (and optionally screenshot) along with the instruction
 * and schema to the LLM, then validates the response against the schema.
 */
export class ExtractHandler {
  private llm: LLMClient;

  constructor(llm: LLMClient) {
    this.llm = llm;
  }

  /**
   * Extract structured data from a page based on a natural-language instruction.
   *
   * @param page - Page to extract from
   * @param instruction - What to extract (e.g. "Extract all product names and prices")
   * @param options - Extraction options including optional Zod schema
   * @returns Extraction result with typed data
   */
  async execute<T = unknown>(
    page: PageInterface,
    instruction: string,
    options?: ExtractOptions,
  ): Promise<ExtractResult<T>> {
    const startTime = performance.now();
    const maxRetries = options?.maxRetries ?? 3;
    const temperature = options?.temperature ?? 0;
    const maxTokens = options?.maxTokens ?? 4096;

    let totalTokens: TokenMetrics = {
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      inferenceTimeMs: 0,
      cost: 0,
    };

    let lastRawResponse = "";
    let lastValidationError: string | undefined;
    let lastError: string | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Get page snapshot
        const snapshot = await page.getSnapshot();

        // Build extraction prompt
        const prompt = this.buildPrompt(
          instruction,
          snapshot,
          options?.schema,
          options?.systemPrompt,
          // Include validation error from previous attempt
          attempt > 0 ? lastValidationError : undefined,
          attempt > 0 ? lastRawResponse : undefined,
        );

        // Call LLM
        const inferenceTimer = performance.now();
        const response = await this.llm.chat(
          [{ role: "user", content: prompt }],
          { temperature, maxTokens },
        );
        const inferenceTimeMs = Math.round(performance.now() - inferenceTimer);

        totalTokens = {
          promptTokens: totalTokens.promptTokens + response.usage.promptTokens,
          completionTokens: totalTokens.completionTokens + response.usage.completionTokens,
          reasoningTokens: 0,
          cachedInputTokens: 0,
          inferenceTimeMs: totalTokens.inferenceTimeMs + inferenceTimeMs,
          cost: 0,
        };

        lastRawResponse = response.content;

        // Parse JSON from LLM response
        const parsed = this.parseJsonResponse(response.content);
        if (parsed === null) {
          lastValidationError = "LLM response was not valid JSON";
          continue;
        }

        // Validate with schema if provided
        if (options?.schema) {
          const validation = options.schema.safeParse(parsed);
          if (!validation.success) {
            lastValidationError = validation.error?.message ?? "Schema validation failed";
            continue;
          }

          return {
            success: true,
            data: validation.data as T,
            rawResponse: response.content,
            attempts: attempt + 1,
            tokenUsage: totalTokens,
            durationMs: Math.round(performance.now() - startTime),
          };
        }

        // No schema - return parsed data directly
        return {
          success: true,
          data: parsed as T,
          rawResponse: response.content,
          attempts: attempt + 1,
          tokenUsage: totalTokens,
          durationMs: Math.round(performance.now() - startTime),
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      success: false,
      data: null,
      rawResponse: lastRawResponse,
      attempts: maxRetries,
      tokenUsage: totalTokens,
      durationMs: Math.round(performance.now() - startTime),
      validationError: lastValidationError,
      error: lastError ?? lastValidationError ?? "Extraction failed after all retries",
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Build the extraction prompt with page context and schema.
   */
  private buildPrompt(
    instruction: string,
    snapshot: PageSnapshot,
    schema?: SchemaLike,
    systemPrompt?: string,
    previousError?: string,
    previousResponse?: string,
  ): string {
    const parts: string[] = [];

    if (systemPrompt) {
      parts.push(systemPrompt);
      parts.push("");
    } else {
      parts.push(
        "You are a data extraction agent. Extract structured data from the web page content based on the given instruction.",
      );
      parts.push("Respond ONLY with a valid JSON object or array. No explanations, no markdown.");
      parts.push("");
    }

    parts.push(`Page URL: ${snapshot.url}`);
    parts.push(`Page Title: ${snapshot.title}`);
    parts.push("");

    // Include element content
    const elementsContent = snapshot.elements
      .filter((e) => e.visible && e.textContent)
      .slice(0, 200)
      .map((e) => {
        let desc = `[${e.ref}] ${e.role}`;
        if (e.name) desc += ` "${e.name}"`;
        if (e.textContent) desc += `: ${e.textContent.slice(0, 300)}`;
        if (e.value) desc += ` (value: ${e.value})`;
        return desc;
      })
      .join("\n");

    parts.push("Page Content:");
    parts.push(elementsContent);
    parts.push("");

    // Include schema description if available
    if (schema) {
      parts.push("Expected output schema (Zod):");
      parts.push("The response must be valid JSON matching the provided schema.");
      parts.push("");
    }

    parts.push(`Instruction: ${instruction}`);

    // Include feedback from previous failed attempt
    if (previousError && previousResponse) {
      parts.push("");
      parts.push("IMPORTANT: Your previous response failed validation:");
      parts.push(`Previous response: ${previousResponse.slice(0, 500)}`);
      parts.push(`Error: ${previousError}`);
      parts.push("Please fix the response to match the expected format.");
    }

    return parts.join("\n");
  }

  /**
   * Parse JSON from an LLM response, handling markdown code blocks.
   */
  private parseJsonResponse(content: string): unknown {
    let jsonStr = content.trim();

    // Strip markdown code blocks
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Try to find JSON object or array
    const jsonStart = jsonStr.search(/[{[]/);
    if (jsonStart > 0) {
      jsonStr = jsonStr.slice(jsonStart);
    }

    try {
      return JSON.parse(jsonStr);
    } catch {
      // Try to extract JSON from mixed content
      const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      const match = objectMatch || arrayMatch;

      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          return null;
        }
      }

      return null;
    }
  }
}
