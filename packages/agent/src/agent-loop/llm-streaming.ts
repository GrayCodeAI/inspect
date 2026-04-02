/**
 * LLM Streaming Support
 *
 * Streaming responses for real-time LLM interaction
 */

/**
 * Streaming LLM response interface
 */
export interface StreamingLLMProvider {
  /**
   * Stream response from LLM
   */
  stream(config: {
    messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
    model: string;
    temperature: number;
    maxTokens: number;
    onChunk?: (chunk: string) => void;
  }): AsyncIterableIterator<string>;

  /**
   * Collect streaming response into full text
   */
  collectStream(
    config: Parameters<StreamingLLMProvider["stream"]>[0],
  ): Promise<{
    content: string;
    usage?: { input_tokens: number; output_tokens: number };
  }>;
}

/**
 * Streaming LLM wrapper for backwards compatibility
 */
export class StreamingLLMWrapper {
  constructor(private provider: any) {}

  /**
   * Wrap streaming provider for use with existing code
   */
  async chat(config: {
    messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
    model: string;
    temperature: number;
    max_tokens: number;
  }): Promise<{
    content: string;
    usage?: { input_tokens: number; output_tokens: number };
  }> {
    // Check if provider has stream method
    if (this.provider.stream) {
      return this.collectStreamingResponse(config);
    }

    // Fall back to regular chat
    return this.provider.chat(config);
  }

  /**
   * Collect streaming response
   */
  private async collectStreamingResponse(config: {
    messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
    model: string;
    temperature: number;
    max_tokens: number;
  }): Promise<{ content: string; usage?: { input_tokens: number; output_tokens: number } }> {
    let fullContent = "";
    let chunkCount = 0;

    // Collect chunks from stream
    for await (const chunk of this.provider.stream({
      messages: config.messages,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.max_tokens,
      onChunk: (text: string) => {
        // Could update UI in real scenario
      },
    })) {
      fullContent += chunk;
      chunkCount++;
    }

    // Estimate token usage from content length
    // Rough estimate: 4 chars per token
    const outputTokens = Math.ceil(fullContent.length / 4);
    const inputTokens = config.messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0);

    return {
      content: fullContent,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    };
  }
}

/**
 * Fallback chain for LLM providers
 *
 * Tries primary provider, falls back to secondary on failure
 */
export class FallbackLLMChain {
  constructor(
    private primary: any,
    private fallback: any,
  ) {}

  async chat(config: {
    messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
    model: string;
    temperature: number;
    max_tokens: number;
  }): Promise<{
    content: string;
    usage?: { input_tokens: number; output_tokens: number };
    provider?: string;
  }> {
    try {
      // Try primary provider
      const result = await this.primary.chat(config);
      return { ...result, provider: "primary" };
    } catch (primaryError) {
      try {
        // Fall back to secondary
        const result = await this.fallback.chat(config);
        return { ...result, provider: "fallback" };
      } catch (fallbackError) {
        throw new Error(
          `Both LLM providers failed. Primary: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}, Fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        );
      }
    }
  }
}

/**
 * LLM response validator
 *
 * Validates and fixes common response issues
 */
export class LLMResponseValidator {
  /**
   * Validate JSON response from LLM
   */
  static validateJSON(response: string): {
    valid: boolean;
    parsed?: Record<string, unknown>;
    error?: string;
  } {
    try {
      // Extract JSON if wrapped in markdown or other text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { valid: false, error: "No JSON object found in response" };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.evaluation || !Array.isArray(parsed.actions)) {
        return {
          valid: false,
          error: "Missing required fields: evaluation or actions",
        };
      }

      return { valid: true, parsed };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Fix common response issues
   */
  static fixResponse(response: string): string {
    // Remove markdown code blocks
    let fixed = response.replace(/^```json\n?/, "").replace(/\n?```$/, "");

    // Remove trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, "$1");

    // Add missing fields if minimal response
    if (!fixed.includes("evaluation")) {
      fixed = `{"evaluation":{"success":true,"assessment":""},"memory":[],"nextGoal":"","actions":${fixed}}`;
    }

    return fixed;
  }

  /**
   * Validate and fix response
   */
  static validateAndFix(response: string): {
    valid: boolean;
    content: string;
    error?: string;
  } {
    // First try validation
    const validation = this.validateJSON(response);
    if (validation.valid) {
      return { valid: true, content: response };
    }

    // Try fixing
    const fixed = this.fixResponse(response);
    const fixedValidation = this.validateJSON(fixed);

    if (fixedValidation.valid) {
      return { valid: true, content: fixed };
    }

    return {
      valid: false,
      content: fixed,
      error: fixedValidation.error,
    };
  }
}

/**
 * LLM token budget manager
 */
export class TokenBudgetManager {
  private tokensUsed = 0;
  private costAccumulated = 0;

  constructor(
    private inputCostPerK = 0.003, // $0.003 per 1K input tokens
    private outputCostPerK = 0.015, // $0.015 per 1K output tokens
  ) {}

  /**
   * Add tokens from LLM response
   */
  addTokens(inputTokens: number, outputTokens: number): void {
    this.tokensUsed += inputTokens + outputTokens;

    const inputCost = (inputTokens / 1000) * this.inputCostPerK;
    const outputCost = (outputTokens / 1000) * this.outputCostPerK;
    this.costAccumulated += inputCost + outputCost;
  }

  /**
   * Get current budget status
   */
  getStatus(): {
    tokensUsed: number;
    costAccumulated: number;
    estimatedPercentageOfDay: number;
  } {
    // Assume $20/day budget
    const dailyBudget = 20;
    const estimatedPercentage = (this.costAccumulated / dailyBudget) * 100;

    return {
      tokensUsed: this.tokensUsed,
      costAccumulated: parseFloat(this.costAccumulated.toFixed(4)),
      estimatedPercentageOfDay: parseFloat(estimatedPercentage.toFixed(2)),
    };
  }

  /**
   * Check if within budget
   */
  isWithinBudget(maxCostUSD = 20): boolean {
    return this.costAccumulated < maxCostUSD;
  }

  /**
   * Reset budget
   */
  reset(): void {
    this.tokensUsed = 0;
    this.costAccumulated = 0;
  }
}
