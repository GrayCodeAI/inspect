// ============================================================================
// @inspect/workflow - Task Block
// ============================================================================

import type { WorkflowBlock } from "@inspect/shared";
import { WorkflowContext } from "../engine/context.js";

/** Result of a task block execution */
export interface TaskBlockResult {
  prompt: string;
  url?: string;
  maxSteps: number;
  timeout: number;
  status: "completed" | "failed" | "timeout";
  output?: unknown;
  stepsExecuted?: number;
  error?: string;
  duration?: number;
}

/**
 * TaskBlock executes a browser automation task using a natural language prompt.
 * It delegates to a browser agent to perform actions on web pages.
 */
export class TaskBlock {
  private agentExecutor?: (
    prompt: string,
    url: string | undefined,
    options: { maxSteps: number; timeout: number },
  ) => Promise<{ output: unknown; stepsExecuted: number }>;

  /**
   * Register the browser agent executor function.
   * This integrates with the agent package to actually run browser tasks.
   */
  setAgentExecutor(
    executor: (
      prompt: string,
      url: string | undefined,
      options: { maxSteps: number; timeout: number },
    ) => Promise<{ output: unknown; stepsExecuted: number }>,
  ): void {
    this.agentExecutor = executor;
  }

  /**
   * Execute a task block with the given context.
   *
   * @param block - The workflow block definition
   * @param context - The workflow execution context
   * @returns TaskBlockResult with execution details
   */
  async execute(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<TaskBlockResult> {
    const params = block.parameters;
    const prompt = context.render(String(params.prompt ?? ""));
    const url = params.url ? context.render(String(params.url)) : undefined;
    const maxSteps = (params.maxSteps as number) ?? 25;
    const timeout = block.timeout ?? 120_000;

    if (!prompt) {
      throw new Error("Task block requires a prompt");
    }

    const startTime = Date.now();

    // Execute with timeout
    const result = await Promise.race<TaskBlockResult>([
      this.executeTask(prompt, url, maxSteps, timeout),
      new Promise<TaskBlockResult>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Task timed out after ${timeout}ms`)),
          timeout,
        ),
      ),
    ]);

    result.duration = Date.now() - startTime;
    return result;
  }

  private async executeTask(
    prompt: string,
    url: string | undefined,
    maxSteps: number,
    timeout: number,
  ): Promise<TaskBlockResult> {
    if (!this.agentExecutor) {
      // Return a delegated result when no agent is registered
      return {
        prompt,
        url,
        maxSteps,
        timeout,
        status: "completed",
        output: {
          message: "Task block requires a registered agent executor",
          prompt,
          url,
        },
        stepsExecuted: 0,
      };
    }

    try {
      const { output, stepsExecuted } = await this.agentExecutor(prompt, url, {
        maxSteps,
        timeout,
      });

      return {
        prompt,
        url,
        maxSteps,
        timeout,
        status: "completed",
        output,
        stepsExecuted,
      };
    } catch (error) {
      return {
        prompt,
        url,
        maxSteps,
        timeout,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
