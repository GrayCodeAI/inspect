/**
 * Finalize Phase - Effect-TS Implementation
 *
 * Updates history, calculates metrics, and prepares for next iteration.
 * Part of: observe → think → act → finalize
 */

import { Effect, Schema } from "effect";
import type { AgentBrain } from "../brain.js";
import type { AgentHistoryEntry, BrowserState } from "../history.js";
import { AgentHistoryList } from "../history.js";

export class FinalizeInput extends Schema.Class<FinalizeInput>("FinalizeInput")({
  stepNumber: Schema.Number,
  actionResults: Schema.Array(
    Schema.Struct({
      success: Schema.Boolean,
      output: Schema.optional(Schema.Unknown),
      error: Schema.optional(Schema.String),
    }),
  ),
  brain: Schema.Unknown,
  browserState: Schema.Unknown,
  stepDuration: Schema.Number,
  tokensUsed: Schema.Number,
  costUSD: Schema.Number,
}) {}

export class FinalizeOutput extends Schema.Class<FinalizeOutput>("FinalizeOutput")({
  recorded: Schema.Boolean,
  history: Schema.Unknown,
  metrics: Schema.Struct({
    stepNumber: Schema.Number,
    duration: Schema.Number,
    tokensUsed: Schema.Number,
    cost: Schema.Number,
    successRate: Schema.Number,
  }),
}) {}

export const finalizePhase = Effect.fn("FinalizePhase.execute")(function* (input: FinalizeInput) {
  yield* Effect.annotateCurrentSpan({ stepNumber: input.stepNumber });

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
    browserState: input.browserState as BrowserState,
    metadata: {
      stepNumber: input.stepNumber,
      startTime: now - input.stepDuration,
      endTime: now,
      durationMs: input.stepDuration,
      tokensUsed: input.tokensUsed,
      cost: input.costUSD,
    },
  };

  const history = new AgentHistoryList({
    entries: [historyEntry],
    sessionId: `session-${now}`,
  });

  yield* resetPhaseState();

  yield* Effect.logDebug("Step finalized", {
    stepNumber: input.stepNumber,
    successRate,
    tokensUsed: input.tokensUsed,
    costUSD: input.costUSD,
  });

  return new FinalizeOutput({
    recorded: true,
    history,
    metrics,
  });
});

export const resetPhaseState = Effect.fn("FinalizePhase.reset")(function* () {
  yield* Effect.logDebug("Phase state reset for next iteration");
});
