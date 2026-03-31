// ============================================================================
// @inspect/workflow - Wait Block
// ============================================================================

import { runInNewContext } from "node:vm";
import type { WorkflowBlock } from "@inspect/core";
import { WorkflowContext } from "../engine/context.js";
import { createLogger } from "@inspect/core";

const logger = createLogger("workflow/blocks/wait");

/** Wait block result */
export interface WaitResult {
  waitedMs: number;
  conditionMet: boolean;
  condition?: string;
  timedOut: boolean;
}

/**
 * WaitBlock pauses workflow execution for a duration or until a condition is met.
 * Supports fixed duration, polling condition, and combined timeout with condition.
 */
export class WaitBlock {
  /**
   * Execute the wait block.
   *
   * Parameters:
   * - duration: fixed wait time in milliseconds
   * - condition: JS expression to poll (resolves when truthy)
   * - pollInterval: interval between condition checks (default: 1000ms)
   * - maxWait: maximum time to wait for condition (default: 60000ms)
   */
  async execute(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<WaitResult> {
    const params = block.parameters;
    const duration = params.duration as number | undefined;
    const condition = params.condition
      ? context.render(String(params.condition))
      : undefined;
    const pollInterval = (params.pollInterval as number) ?? 1_000;
    const maxWait = (params.maxWait as number) ?? 60_000;

    const startTime = Date.now();

    // If only duration is specified, just wait
    if (duration !== undefined && !condition) {
      await this.sleep(duration);
      return {
        waitedMs: duration,
        conditionMet: true,
        timedOut: false,
      };
    }

    // If condition is specified, poll until met or timeout
    if (condition) {
      const timeout = duration ?? maxWait;

      while (Date.now() - startTime < timeout) {
        const met = this.evaluateCondition(condition, context);
        if (met) {
          return {
            waitedMs: Date.now() - startTime,
            conditionMet: true,
            condition,
            timedOut: false,
          };
        }
        await this.sleep(Math.min(pollInterval, timeout - (Date.now() - startTime)));
      }

      return {
        waitedMs: Date.now() - startTime,
        conditionMet: false,
        condition,
        timedOut: true,
      };
    }

    // Default: wait 1 second
    await this.sleep(1_000);
    return {
      waitedMs: 1_000,
      conditionMet: true,
      timedOut: false,
    };
  }

  /**
   * Evaluate a condition expression against the context.
   */
  private evaluateCondition(
    condition: string,
    context: WorkflowContext,
  ): boolean {
    try {
      const sandbox = { ...context.toObject(), __result: false };
      sandbox.__result = runInNewContext(`Boolean(${condition})`, sandbox, {
        timeout: 5_000,
      });
      return Boolean(sandbox.__result);
    } catch (error) {
      logger.debug("Condition evaluation failed", { condition, error });
      return false;
    }
  }

  /**
   * Sleep for a given number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }
}
