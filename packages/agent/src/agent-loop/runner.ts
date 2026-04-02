/**
 * Agent Loop Runner
 *
 * Orchestrates the four phases: prepare → think → act → finalize
 * Task: 125 (agent loop runner)
 */

import { preparePhase } from "./phases/prepare.js";
import { thinkPhase } from "./phases/think.js";
import { actPhase } from "./phases/act.js";
import { finalizePhase } from "./phases/finalize.js";
import type { AgentConfig } from "./index.js";
import type { AgentBrain } from "./brain.js";

/**
 * Agent loop step - Execute all four phases for one iteration
 */
export async function runAgentStep(config: {
  // Agent configuration
  config: AgentConfig;

  // Current step number
  stepNumber: number;

  // Current failures
  currentFailures: number;

  // Previous thoughts/brain
  previousBrains: AgentBrain[];

  // Browser page object
  page: any;

  // LLM provider
  llmProvider: any;

  // Agent goal
  goal: string;
}): Promise<{
  success: boolean;
  stepNumber: number;
  reason?: string;
  brain?: AgentBrain;
}> {
  try {
    // Phase 1: PREPARE
    // Initialize state and load memory
    const prepareOutput = await preparePhase({
      goal: config.goal,
      stepNumber: config.stepNumber,
      previousMemory: config.previousBrains,
      maxSteps: config.config.maxSteps ?? 50,
      maxFailures: config.config.maxFailures ?? 5,
      currentFailures: config.currentFailures,
    });

    if (!prepareOutput.canProceed) {
      return {
        success: false,
        stepNumber: config.stepNumber,
        reason: prepareOutput.stopReason || "unknown",
      };
    }

    // Phase 2: THINK
    // Call LLM to plan next actions
    const thinkOutput = await thinkPhase({
      observations: prepareOutput.observations,
      goal: config.goal,
      previousThoughts: config.previousBrains,
      llmProvider: config.llmProvider,
      systemPrompt: "You are a helpful AI agent. Plan the next action.",
      model: config.config.model ?? "claude-3-sonnet",
      temperature: config.config.temperature ?? 0.7,
      maxTokens: 2000,
    });

    // Phase 3: ACT
    // Execute planned actions
    const actOutput = await actPhase({
      page: config.page,
      actions: thinkOutput.actions,
      browserState: {
        url: "placeholder",
        title: "placeholder",
        timestamp: Date.now(),
      },
      timeout: config.config.stepTimeout ?? 5000,
      maxRetries: 3,
    });

    // Phase 4: FINALIZE
    // Record results and update history
    const finalizeOutput = await finalizePhase({
      stepNumber: config.stepNumber,
      actionResults: actOutput.results.map((r) => ({
        success: r.success,
        output: r.output,
        error: r.error,
      })),
      brain: thinkOutput.brain,
      browserState: actOutput.finalBrowserState,
      stepDuration: actOutput.totalDuration,
      tokensUsed: thinkOutput.tokensUsed,
      costUSD: thinkOutput.costUSD,
    });

    return {
      success: actOutput.overallSuccess,
      stepNumber: config.stepNumber,
      brain: thinkOutput.brain,
    };
  } catch (error) {
    return {
      success: false,
      stepNumber: config.stepNumber,
      reason: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Run complete agent loop until goal achieved or limits exceeded
 */
export async function runFullAgentLoop(config: {
  // Agent configuration
  config: AgentConfig;

  // Browser page object
  page: any;

  // LLM provider
  llmProvider: any;

  // Agent goal
  goal: string;
}): Promise<{
  completed: boolean;
  stepsExecuted: number;
  finalBrain?: AgentBrain;
  reason: string;
}> {
  let stepCount = 0;
  let failureCount = 0;
  const previousBrains: AgentBrain[] = [];
  const maxSteps = config.config.maxSteps ?? 50;
  const maxFailures = config.config.maxFailures ?? 5;

  // Main agent loop
  while (stepCount < maxSteps && failureCount < maxFailures) {
    try {
      // Execute one step
      const stepResult = await runAgentStep({
        config: config.config,
        stepNumber: stepCount,
        currentFailures: failureCount,
        previousBrains,
        page: config.page,
        llmProvider: config.llmProvider,
        goal: config.goal,
      });

      stepCount++;

      // Check if step succeeded
      if (!stepResult.success) {
        failureCount++;

        // If hit failure limit, stop
        if (failureCount >= maxFailures) {
          return {
            completed: false,
            stepsExecuted: stepCount,
            reason: `Failed to complete after ${failureCount} failures`,
          };
        }

        // If hit step limit, stop
        if (stepCount >= maxSteps) {
          return {
            completed: false,
            stepsExecuted: stepCount,
            reason: `Reached maximum steps (${maxSteps})`,
          };
        }
      }

      // Store brain for next iteration
      if (stepResult.brain) {
        previousBrains.push(stepResult.brain);

        // Check for goal achievement (simplified: if success and confidence > 0.8)
        if (stepResult.success && stepResult.brain.confidence && stepResult.brain.confidence > 0.8) {
          return {
            completed: true,
            stepsExecuted: stepCount,
            finalBrain: stepResult.brain,
            reason: "Goal achieved with high confidence",
          };
        }
      }
    } catch (error) {
      failureCount++;
      if (failureCount >= maxFailures) {
        return {
          completed: false,
          stepsExecuted: stepCount,
          reason: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  // Loop completed (either max steps or max failures reached)
  const finalBrain = previousBrains.length > 0 ? previousBrains[previousBrains.length - 1] : undefined;

  return {
    completed: failureCount < maxFailures,
    stepsExecuted: stepCount,
    finalBrain,
    reason: stepCount >= maxSteps ? `Reached maximum steps (${maxSteps})` : `Exceeded failure limit (${maxFailures})`,
  };
}
