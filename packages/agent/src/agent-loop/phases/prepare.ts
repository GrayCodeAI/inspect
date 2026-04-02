/**
 * Prepare Phase - Effect-TS Implementation
 *
 * Initializes state and loads memory for a new iteration.
 * Part of: observe → think → act → finalize
 */

import { Effect, Schema } from "effect";
import type { AgentBrain } from "../brain.js";
import type { Observation } from "../index.js";

export class PrepareInput extends Schema.Class<PrepareInput>("PrepareInput")({
  goal: Schema.String,
  stepNumber: Schema.Number,
  previousMemory: Schema.optional(Schema.Array(Schema.Unknown)),
  actionHistory: Schema.optional(
    Schema.Array(
      Schema.Struct({
        action: Schema.String,
        result: Schema.Boolean,
      }),
    ),
  ),
  maxSteps: Schema.Number,
  maxFailures: Schema.Number,
  currentFailures: Schema.Number,
}) {}

export class PrepareOutput extends Schema.Class<PrepareOutput>("PrepareOutput")({
  canProceed: Schema.Boolean,
  stopReason: Schema.optional(
    Schema.Literals(["max_steps_exceeded", "max_failures_exceeded", "goal_achieved"] as const),
  ),
  observations: Schema.Array(Schema.Unknown),
  brain: Schema.Unknown,
  isFirstStep: Schema.Boolean,
  progress: Schema.Struct({
    stepNumber: Schema.Number,
    stepsRemaining: Schema.Number,
    failuresRemaining: Schema.Number,
  }),
}) {}

export const preparePhase = Effect.fn("PreparePhase.execute")(function* (input: PrepareInput) {
  yield* Effect.annotateCurrentSpan({ stepNumber: input.stepNumber, goal: input.goal });

  const validation = yield* validateCanContinue(
    input.stepNumber,
    input.maxSteps,
    input.currentFailures,
    input.maxFailures,
  );

  if (!validation.canContinue) {
    yield* Effect.logDebug("Cannot proceed", { reason: validation.reason });
    return new PrepareOutput({
      canProceed: false,
      stopReason: validation.reason as PrepareOutput["stopReason"],
      observations: [],
      brain: {
        evaluation: { success: false, assessment: "Cannot proceed - limits exceeded" },
        memory: [],
        nextGoal: input.goal,
      },
      isFirstStep: false,
      progress: {
        stepNumber: input.stepNumber,
        stepsRemaining: Math.max(0, input.maxSteps - input.stepNumber),
        failuresRemaining: Math.max(0, input.maxFailures - input.currentFailures),
      },
    });
  }

  const loadedMemory = yield* loadMemory(input.previousMemory as AgentBrain[] | undefined);
  const observations = yield* createInitialObservations(input.stepNumber);
  const brain = yield* initializeBrain(input.goal, loadedMemory);

  return new PrepareOutput({
    canProceed: true,
    observations,
    brain,
    isFirstStep: input.stepNumber === 0,
    progress: {
      stepNumber: input.stepNumber,
      stepsRemaining: input.maxSteps - input.stepNumber,
      failuresRemaining: input.maxFailures - input.currentFailures,
    },
  });
});

const validateCanContinue = Effect.fn("PreparePhase.validateCanContinue")(function* (
  stepNumber: number,
  maxSteps: number,
  currentFailures: number,
  maxFailures: number,
) {
  if (stepNumber >= maxSteps) {
    return { canContinue: false, reason: "max_steps_exceeded" as const };
  }
  if (currentFailures >= maxFailures) {
    return { canContinue: false, reason: "max_failures_exceeded" as const };
  }
  return { canContinue: true };
});

const loadMemory = Effect.fn("PreparePhase.loadMemory")(function* (
  previousMemory: AgentBrain[] | undefined,
) {
  if (!previousMemory || previousMemory.length === 0) {
    return [] as { content: string; importance: number }[];
  }

  const allMemory: { content: string; importance: number }[] = [];

  for (const brain of previousMemory) {
    if (brain.memory && Array.isArray(brain.memory)) {
      const important = brain.memory.filter((m) => m.importance >= 0.7);
      allMemory.push(...important);
    }
  }

  if (allMemory.length === 0 && previousMemory.length > 0) {
    return previousMemory[previousMemory.length - 1].memory || [];
  }

  return allMemory;
});

const initializeBrain = Effect.fn("PreparePhase.initializeBrain")(function* (
  goal: string,
  loadedMemory: { content: string; importance: number }[],
) {
  return {
    evaluation: {
      success: false,
      assessment: `Starting new iteration - goal: ${goal}`,
      lesson: undefined,
    },
    memory: loadedMemory,
    nextGoal: goal,
    confidence: loadedMemory.length > 0 ? 0.7 : 0.5,
  };
});

const createInitialObservations = Effect.fn("PreparePhase.createInitialObservations")(function* (
  stepNumber: number,
) {
  return [
    {
      type: "metadata",
      content: `Step ${stepNumber + 1} initialized`,
      timestamp: Date.now(),
    } as Observation,
  ];
});
