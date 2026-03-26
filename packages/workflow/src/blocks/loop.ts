// ============================================================================
// @inspect/workflow - For Loop Block
// ============================================================================

import type { WorkflowBlock } from "@inspect/shared";
import { WorkflowContext } from "../engine/context.js";

/** Result of a single loop iteration */
export interface LoopIterationResult {
  index: number;
  item: unknown;
  output: unknown;
  error?: string;
}

/** Result of the entire loop */
export interface ForLoopResult {
  iterations: number;
  results: LoopIterationResult[];
  completed: number;
  failed: number;
}

/**
 * ForLoopBlock iterates over an array of data, executing inner blocks
 * for each element. The loop index and current item are passed to each
 * iteration's context.
 */
export class ForLoopBlock {
  private blockExecutor?: (
    block: WorkflowBlock,
    context: WorkflowContext,
  ) => Promise<unknown>;

  /**
   * Register the block executor for running inner blocks.
   */
  setBlockExecutor(
    executor: (
      block: WorkflowBlock,
      context: WorkflowContext,
    ) => Promise<unknown>,
  ): void {
    this.blockExecutor = executor;
  }

  /**
   * Execute a for-loop block.
   *
   * The block's parameters should include:
   * - items: string key of the array variable in context, or an inline array
   * - blocks: array of inner WorkflowBlock definitions to execute per iteration
   * - continueOnError: boolean to continue on iteration failure
   * - maxIterations: optional cap on number of iterations
   *
   * The context is augmented with:
   * - loopIndex: current iteration index
   * - loopItem: current array element
   * - loopLength: total array length
   */
  async execute(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<ForLoopResult> {
    const params = block.parameters;
    const continueOnError = (params.continueOnError as boolean) ?? block.continueOnFailure ?? false;
    const maxIterations = params.maxIterations as number | undefined;

    // Resolve the items array
    let items: unknown[];
    if (Array.isArray(params.items)) {
      items = params.items;
    } else if (typeof params.items === "string") {
      const resolved = context.get<unknown[]>(params.items);
      if (!Array.isArray(resolved)) {
        throw new Error(
          `For-loop items variable '${params.items}' is not an array or is undefined`,
        );
      }
      items = resolved;
    } else {
      throw new Error(
        "For-loop block requires 'items' parameter (array or context variable name)",
      );
    }

    // Apply max iterations cap
    if (maxIterations !== undefined && maxIterations > 0) {
      items = items.slice(0, maxIterations);
    }

    const innerBlocks = (params.blocks as WorkflowBlock[]) ?? [];
    const results: LoopIterationResult[] = [];
    let completed = 0;
    let failed = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const iterationResult: LoopIterationResult = {
        index: i,
        item,
        output: undefined,
      };

      try {
        // Create child context with loop variables
        const childContext = context.createChild({
          loopIndex: i,
          loopItem: item,
          loopLength: items.length,
          loopIsFirst: i === 0,
          loopIsLast: i === items.length - 1,
        });

        // If the item is an object, also spread its properties into context
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
            childContext.set(`item_${key}`, value);
          }
        }

        // Execute each inner block sequentially
        let lastOutput: unknown;
        for (const innerBlock of innerBlocks) {
          if (this.blockExecutor) {
            lastOutput = await this.blockExecutor(innerBlock, childContext);
          }
          if (lastOutput !== undefined) {
            childContext.set("lastOutput", lastOutput);
          }
        }

        iterationResult.output = lastOutput;
        completed++;
      } catch (error) {
        failed++;
        iterationResult.error =
          error instanceof Error ? error.message : String(error);

        if (!continueOnError) {
          results.push(iterationResult);
          throw new Error(
            `For-loop iteration ${i} failed: ${iterationResult.error}`,
          );
        }
      }

      results.push(iterationResult);
    }

    // Store aggregated results in context
    context.set("loopResults", results.map((r) => r.output));

    return {
      iterations: items.length,
      results,
      completed,
      failed,
    };
  }
}
