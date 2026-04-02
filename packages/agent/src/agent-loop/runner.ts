/**
 * Agent Loop Runner - Effect-TS Implementation
 *
 * Orchestrates the four phases: prepare → think → act → finalize
 */

import { Effect, Schema } from "effect";
import { preparePhase, PrepareInput } from "./phases/prepare.js";
import { thinkPhase, ThinkInput } from "./phases/think.js";
import { actPhase, ActInput } from "./phases/act.js";
import { finalizePhase, FinalizeInput } from "./phases/finalize.js";
import type { AgentConfig } from "./index.js";
import type { AgentBrain } from "./brain.js";
import { BrowserManagerService } from "@inspect/browser";

export class AgentStepResult extends Schema.Class<AgentStepResult>("AgentStepResult")({
  success: Schema.Boolean,
  stepNumber: Schema.Number,
  reason: Schema.optional(Schema.String),
  brain: Schema.optional(Schema.Unknown),
}) {}

export class FullLoopResult extends Schema.Class<FullLoopResult>("FullLoopResult")({
  completed: Schema.Boolean,
  stepsExecuted: Schema.Number,
  finalBrain: Schema.optional(Schema.Unknown),
  reason: Schema.String,
}) {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBrowserService(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return BrowserManagerService as any;
}

export const runAgentStep = Effect.fn("AgentLoopRunner.runAgentStep")(function* (config: {
  config: AgentConfig;
  stepNumber: number;
  currentFailures: number;
  previousBrains: AgentBrain[];
  goal: string;
}) {
  yield* Effect.annotateCurrentSpan({ stepNumber: config.stepNumber, goal: config.goal });

  const prepareInput = new PrepareInput({
    goal: config.goal,
    stepNumber: config.stepNumber,
    previousMemory: config.previousBrains,
    maxSteps: config.config.maxSteps ?? 50,
    maxFailures: config.config.maxFailures ?? 5,
    currentFailures: config.currentFailures,
  });

  const prepareOutput = yield* preparePhase(prepareInput);

  if (!prepareOutput.canProceed) {
    return new AgentStepResult({
      success: false,
      stepNumber: config.stepNumber,
      reason: prepareOutput.stopReason ?? "unknown",
    });
  }

  const thinkInput = new ThinkInput({
    observations: prepareOutput.observations,
    goal: config.goal,
    previousThoughts: config.previousBrains,
    systemPrompt: "You are a helpful AI agent. Plan the next action.",
    model: config.config.model ?? "claude-3-sonnet",
    temperature: config.config.temperature ?? 0.7,
    maxTokens: 2000,
  });

  const thinkOutput = yield* thinkPhase(thinkInput);

  const browser = yield* getBrowserService();
  const session = yield* browser.launch({ headless: true });

  const browserState = {
    url: yield* session.url,
    title: yield* session.title,
    timestamp: Date.now(),
  };

  const actInput = new ActInput({
    actions: thinkOutput.actions,
    browserState,
    timeout: config.config.stepTimeout ?? 5000,
    maxRetries: 3,
  });

  const actOutput = yield* actPhase(actInput);

  const finalizeInput = new FinalizeInput({
    stepNumber: config.stepNumber,
    actionResults: actOutput.results.map((r) => ({
      success: r.success,
      output: r.output,
      error: r.error,
    })),
    brain: thinkOutput.brain as AgentBrain,
    browserState: actOutput.finalBrowserState,
    stepDuration: actOutput.totalDuration,
    tokensUsed: thinkOutput.tokensUsed,
    costUSD: thinkOutput.costUSD,
  });

  yield* finalizePhase(finalizeInput);

  // Clean up browser session
  yield* session.close;

  return new AgentStepResult({
    success: actOutput.overallSuccess,
    stepNumber: config.stepNumber,
    brain: thinkOutput.brain,
  });
});

export const runFullAgentLoop = Effect.fn("AgentLoopRunner.runFullAgentLoop")(function* (config: {
  config: AgentConfig;
  goal: string;
}) {
  yield* Effect.annotateCurrentSpan({ goal: config.goal });

  let stepCount = 0;
  let failureCount = 0;
  const previousBrains: AgentBrain[] = [];
  const maxSteps = config.config.maxSteps ?? 50;
  const maxFailures = config.config.maxFailures ?? 5;

  while (stepCount < maxSteps && failureCount < maxFailures) {
    const stepResult = yield* runAgentStep({
      config: config.config,
      stepNumber: stepCount,
      currentFailures: failureCount,
      previousBrains,
      goal: config.goal,
    });

    stepCount++;

    if (!stepResult.success) {
      failureCount++;

      if (failureCount >= maxFailures) {
        return new FullLoopResult({
          completed: false,
          stepsExecuted: stepCount,
          reason: `Failed to complete after ${failureCount} failures`,
        });
      }

      if (stepCount >= maxSteps) {
        return new FullLoopResult({
          completed: false,
          stepsExecuted: stepCount,
          reason: `Reached maximum steps (${maxSteps})`,
        });
      }
    }

    if (stepResult.brain) {
      previousBrains.push(stepResult.brain as AgentBrain);

      const brain = stepResult.brain as { confidence?: number };
      if (stepResult.success && brain.confidence && brain.confidence > 0.8) {
        return new FullLoopResult({
          completed: true,
          stepsExecuted: stepCount,
          finalBrain: stepResult.brain,
          reason: "Goal achieved with high confidence",
        });
      }
    }
  }

  const finalBrain =
    previousBrains.length > 0 ? previousBrains[previousBrains.length - 1] : undefined;

  return new FullLoopResult({
    completed: failureCount < maxFailures,
    stepsExecuted: stepCount,
    finalBrain,
    reason:
      stepCount >= maxSteps
        ? `Reached maximum steps (${maxSteps})`
        : `Exceeded failure limit (${maxFailures})`,
  });
});
