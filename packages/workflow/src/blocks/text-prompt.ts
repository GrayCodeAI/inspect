// ──────────────────────────────────────────────────────────────────────────────
// @inspect/workflow - Text Prompt Block
//
// Sends a prompt to an LLM and returns the response.
// ──────────────────────────────────────────────────────────────────────────────

import type { WorkflowBlock } from "@inspect/shared";

export interface TextPromptResult {
  type: "text_prompt";
  prompt: string;
  systemPrompt?: string;
  response?: string;
  status: "completed" | "delegated";
  message?: string;
}

/**
 * Text prompt block sends a prompt to an LLM handler.
 *
 * Usage in YAML:
 * ```yaml
 * steps:
 *   - type: text_prompt
 *     parameters:
 *       prompt: "Summarize this page"
 *       systemPrompt: "You are a helpful assistant"
 * ```
 */
export class TextPromptBlock {
  private llmHandler?: (prompt: string, systemPrompt?: string) => Promise<string>;

  setLLMHandler(handler: (prompt: string, systemPrompt?: string) => Promise<string>): void {
    this.llmHandler = handler;
  }

  async execute(block: WorkflowBlock, context: Record<string, unknown>): Promise<TextPromptResult> {
    const params = block.parameters;
    const render = context.render as ((s: string) => string) | undefined;
    const prompt = render ? render(String(params.prompt ?? "")) : String(params.prompt ?? "");
    const systemPrompt = params.systemPrompt
      ? render
        ? render(String(params.systemPrompt))
        : String(params.systemPrompt)
      : undefined;

    if (this.llmHandler) {
      try {
        const response = await this.llmHandler(prompt, systemPrompt);
        return { type: "text_prompt", prompt, systemPrompt, response, status: "completed" };
      } catch (err) {
        return {
          type: "text_prompt",
          prompt,
          systemPrompt,
          status: "delegated",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return {
      type: "text_prompt",
      prompt,
      systemPrompt,
      status: "delegated",
      message: "No LLM handler registered. Call setLLMHandler() to enable.",
    };
  }
}
