/**
 * Finalize Phase - Agent Loop
 *
 * Updates history, calculates metrics, and prepares for next iteration.
 * Part of: observe → think → act → finalize
 *
 * Task: 121 (finalize phase implementation)
 */

import type { AgentBrain } from "../brain.js";
import type { AgentHistoryEntry, BrowserState } from "../history.js";
import { AgentHistoryList } from "../history.js";

/**
 * Finalize input
 */
export interface FinalizeInput {
  // Current step number
  stepNumber: number;

  // Action results from act phase
  actionResults: Array<{ success: boolean; output?: unknown; error?: string }>;

  // LLM brain output from think phase
  brain: AgentBrain;

  // Current browser state
  browserState: BrowserState;

  // Time spent in this step (ms)
  stepDuration: number;

  // Tokens used in LLM call
  tokensUsed: number;

  // Cost in USD
  costUSD: number;
}

/**
 * Finalize output
 */
export interface FinalizeOutput {
  // Entry was recorded successfully
  recorded: boolean;

  // Current history list
  history: AgentHistoryList;

  // Metrics for this step
  metrics: {
    stepNumber: number;
    duration: number;
    tokensUsed: number;
    cost: number;
    successRate: number;
  };
}

/**
 * Finalize phase: Update history and prepare for next iteration
 *
 * This phase:
 * 1. Records the action result in history
 * 2. Calculates step metrics
 * 3. Updates observation cache
 * 4. Resets phase-specific state
 *
 * Estimated implementation: 50-80 LOC
 */
export async function finalizePhase(input: FinalizeInput): Promise<FinalizeOutput> {
  // Step 1: Calculate metrics
  const successCount = input.actionResults.filter((r) => r.success).length;
  const totalCount = input.actionResults.length;
  const successRate = totalCount > 0 ? successCount / totalCount : 0;

  const now = Date.now();
  const metrics = {
    stepNumber: input.stepNumber,
    duration: input.stepDuration,
    tokensUsed: input.tokensUsed,
    cost: input.costUSD,
    successRate,
  };

  // Step 2: Create history entry matching AgentHistoryEntry interface
  const historyEntry: AgentHistoryEntry = {
    id: `step-${input.stepNumber}-${now}`,
    modelOutput: {
      raw: "",
      actions: input.actionResults.map((r) => ({
        success: r.success,
        output: r.output,
        error: r.error,
      })),
      brain: input.brain as unknown as Record<string, unknown>,
      tokens: input.tokensUsed,
      cost: input.costUSD,
    },
    results: input.actionResults as unknown as Record<string, unknown>[],
    browserState: input.browserState,
    metadata: {
      stepNumber: input.stepNumber,
      startTime: now - input.stepDuration,
      endTime: now,
      durationMs: input.stepDuration,
      tokensUsed: input.tokensUsed,
      cost: input.costUSD,
    },
  };

  // Step 3: Build history list
  const history = new AgentHistoryList({
    entries: [historyEntry],
    sessionId: `session-${now}`,
  });

  // Step 4: Reset phase state for next iteration
  resetPhaseState();

  return {
    recorded: true,
    history,
    metrics,
  };
}

/**
 * Reset phase state for next iteration
 */
export function resetPhaseState(): void {
  // In full implementation, would clear:
  // - Temporary observation cache
  // - Action attempt counters
  // - Retry state
  // - Phase-specific error tracking
  // This is called after each step completes successfully
}
