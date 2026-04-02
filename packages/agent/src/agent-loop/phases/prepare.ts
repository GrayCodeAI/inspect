/**
 * Prepare Phase - Agent Loop
 *
 * Initializes state and loads memory for a new iteration.
 * Part of: observe → think → act → finalize
 *
 * Task: 124 (prepare phase implementation)
 */

import type { AgentBrain } from "../brain.js";
import type { Observation } from "../index.js";

/**
 * Prepare input
 */
export interface PrepareInput {
  // Agent's goal/task
  goal: string;

  // Step number (0 for first step)
  stepNumber: number;

  // Available memory from previous steps
  previousMemory?: AgentBrain[];

  // Action history
  actionHistory?: Array<{ action: string; result: boolean }>;

  // Max steps allowed
  maxSteps: number;

  // Max failures allowed before stopping
  maxFailures: number;

  // Number of failures so far
  currentFailures: number;
}

/**
 * Prepare output
 */
export interface PrepareOutput {
  // Step is valid and can proceed
  canProceed: boolean;

  // Reason if cannot proceed
  stopReason?: "max_steps_exceeded" | "max_failures_exceeded" | "goal_achieved";

  // Initial observations for this step
  observations: Observation[];

  // Agent brain state with loaded memory
  brain: AgentBrain;

  // Whether this is first step
  isFirstStep: boolean;

  // Progress information
  progress: {
    stepNumber: number;
    stepsRemaining: number;
    failuresRemaining: number;
  };
}

/**
 * Prepare phase: Initialize state for new iteration
 *
 * This phase:
 * 1. Validates we can continue (steps/failures)
 * 2. Loads memory from previous steps
 * 3. Prepares initial observations
 * 4. Sets up brain for thinking
 *
 * Estimated implementation: 30-50 LOC
 */
export async function preparePhase(input: PrepareInput): Promise<PrepareOutput> {
  // Step 1: Check if we can continue
  const validation = validateCanContinue(
    input.stepNumber,
    input.maxSteps,
    input.currentFailures,
    input.maxFailures,
  );

  if (!validation.canContinue) {
    return {
      canProceed: false,
      stopReason: validation.reason as any,
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
    };
  }

  // Step 2: Load memory from previous steps
  const loadedMemory = loadMemory(input.previousMemory);

  // Step 3: Create initial observations
  const observations = createInitialObservations(input.stepNumber);

  // Step 4: Initialize brain with loaded memory
  const brain = initializeBrain(input.goal, loadedMemory);

  return {
    canProceed: true,
    observations,
    brain,
    isFirstStep: input.stepNumber === 0,
    progress: {
      stepNumber: input.stepNumber,
      stepsRemaining: input.maxSteps - input.stepNumber,
      failuresRemaining: input.maxFailures - input.currentFailures,
    },
  };
}

/**
 * Validate that we can continue
 */
function validateCanContinue(
  stepNumber: number,
  maxSteps: number,
  currentFailures: number,
  maxFailures: number,
): { canContinue: boolean; reason?: "max_steps_exceeded" | "max_failures_exceeded" } {
  // Check step limit
  if (stepNumber >= maxSteps) {
    return { canContinue: false, reason: "max_steps_exceeded" };
  }

  // Check failure limit
  if (currentFailures >= maxFailures) {
    return { canContinue: false, reason: "max_failures_exceeded" };
  }

  return { canContinue: true };
}

/**
 * Load memory from history
 */
function loadMemory(
  previousMemory: AgentBrain[] | undefined,
): { content: string; importance: number }[] {
  // Extract important items from history
  if (!previousMemory || previousMemory.length === 0) {
    return [];
  }

  // Collect high-importance memory items from all previous steps
  const allMemory: { content: string; importance: number }[] = [];

  // Iterate through all previous brains, collecting high-importance items
  for (const brain of previousMemory) {
    if (brain.memory && Array.isArray(brain.memory)) {
      // Include items with importance > 0.7 (high importance)
      const important = brain.memory.filter((m) => m.importance >= 0.7);
      allMemory.push(...important);
    }
  }

  // If no high-importance items, return recent memory from last step
  if (allMemory.length === 0 && previousMemory.length > 0) {
    return previousMemory[previousMemory.length - 1].memory || [];
  }

  return allMemory;
}

/**
 * Create initial brain for this step
 */
function initializeBrain(
  goal: string,
  loadedMemory: { content: string; importance: number }[],
): AgentBrain {
  // Create brain for this iteration with:
  // - Clear goal statement
  // - Important memories from previous steps
  // - Initial evaluation (not yet started)

  return {
    evaluation: {
      success: false,
      assessment: "Starting new iteration - goal: " + goal,
      lesson: undefined,
    },
    memory: loadedMemory,
    nextGoal: goal,
    confidence: loadedMemory.length > 0 ? 0.7 : 0.5, // Higher confidence if we have prior memory
  };
}

/**
 * Create initial observations for step
 */
function createInitialObservations(stepNumber: number): Observation[] {
  // Capture current state as observations
  // In full implementation, would:
  // - Take screenshot
  // - Capture DOM tree
  // - Get accessibility tree
  // - Monitor network requests
  // - Capture console output

  // For now, return step metadata observation
  return [
    {
      type: "metadata",
      content: `Step ${stepNumber + 1} initialized`,
      timestamp: Date.now(),
    },
  ];
}
