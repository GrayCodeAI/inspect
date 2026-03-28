// ──────────────────────────────────────────────────────────────────────────────
// @inspect/sdk - Agent Handler: Multi-step autonomous browser agent
// ──────────────────────────────────────────────────────────────────────────────

import type {
  AgentAction,
  TokenMetrics,
  TestStep,
  PageSnapshot,
} from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("sdk/agent");
import type { LLMClient, PageInterface } from "./act.js";
import { ActHandler, type ActResult } from "./act.js";
import { ExtractHandler, type ExtractResult } from "./extract.js";
import { ObserveHandler, type ObserveResult, type ActionSuggestion } from "./observe.js";

/** Agent execution options */
export interface AgentOptions {
  /** Maximum steps the agent can take (default: 25) */
  maxSteps?: number;
  /** Whether to stream step-by-step events (default: false) */
  streaming?: boolean;
  /** Callback fired after each step */
  onStep?: (step: AgentStep) => void | Promise<void>;
  /** Callback for streaming events */
  onEvent?: (event: AgentStreamEvent) => void;
  /** Require user confirmation before destructive actions (default: false) */
  requireConfirmation?: boolean;
  /** Confirmation handler (must return true to proceed) */
  onConfirmation?: (action: AgentAction, step: number) => Promise<boolean>;
  /** Variables for template substitution */
  variables?: Record<string, string>;
  /** Per-step timeout in ms (default: 60000) */
  stepTimeoutMs?: number;
  /** LLM temperature (default: 0) */
  temperature?: number;
  /** Maximum consecutive failures before aborting (default: 3) */
  maxConsecutiveFailures?: number;
  /** Custom system prompt for the agent */
  systemPrompt?: string;
}

/** A single agent step */
export interface AgentStep {
  /** Step index (0-based) */
  index: number;
  /** The thought/reasoning for this step */
  thought: string;
  /** The action taken */
  action: AgentAction | null;
  /** Result of the action */
  result: ActResult | null;
  /** Observations from the page */
  observations: ActionSuggestion[];
  /** Page URL after the step */
  url: string;
  /** Duration in ms */
  durationMs: number;
  /** Token usage for this step */
  tokenUsage: TokenMetrics;
  /** Screenshot after the step (base64) */
  screenshot?: string;
  /** Whether the agent believes the goal is complete */
  goalComplete: boolean;
  /** Error if the step failed */
  error?: string;
}

/** Streaming event from the agent */
export interface AgentStreamEvent {
  type: "thought" | "action" | "observation" | "screenshot" | "complete" | "error" | "step_start" | "step_end";
  data: unknown;
  stepIndex: number;
  timestamp: number;
}

/** Complete agent execution result */
export interface AgentResult {
  /** Whether the agent believes it completed the goal */
  success: boolean;
  /** Summary of what was accomplished */
  summary: string;
  /** All steps taken */
  steps: AgentStep[];
  /** Total token usage */
  tokenUsage: TokenMetrics;
  /** Total duration in ms */
  durationMs: number;
  /** Total number of actions performed */
  actionCount: number;
  /** Final page URL */
  finalUrl: string;
  /** Extracted data (if the goal involved extraction) */
  extractedData?: unknown;
  /** Error if the agent failed */
  error?: string;
}

/** Agent planning response from LLM */
interface AgentPlan {
  thought: string;
  action: {
    type: string;
    instruction: string;
    value?: string;
  } | null;
  goalComplete: boolean;
  extractedData?: unknown;
  summary?: string;
}

/**
 * AgentHandler orchestrates multi-step browser automation.
 * The agent loop:
 * 1. Observe the current page state
 * 2. Think about the next step (LLM planning)
 * 3. Execute the action
 * 4. Check if the goal is complete
 * 5. Repeat until done or max steps reached
 */
export class AgentHandler {
  private llm: LLMClient;
  private actHandler: ActHandler;
  private extractHandler: ExtractHandler;
  private observeHandler: ObserveHandler;

  constructor(
    llm: LLMClient,
    options?: {
      actHandler?: ActHandler;
      extractHandler?: ExtractHandler;
      observeHandler?: ObserveHandler;
    },
  ) {
    this.llm = llm;
    this.actHandler = options?.actHandler ?? new ActHandler(llm);
    this.extractHandler = options?.extractHandler ?? new ExtractHandler(llm);
    this.observeHandler = options?.observeHandler ?? new ObserveHandler(llm);
  }

  /**
   * Execute a multi-step agent task.
   *
   * @param page - Page to automate
   * @param instruction - High-level goal (e.g. "Log in and download the latest invoice")
   * @param options - Agent execution options
   * @returns Complete execution result
   */
  async execute(
    page: PageInterface,
    instruction: string,
    options?: AgentOptions,
  ): Promise<AgentResult> {
    const startTime = performance.now();
    const maxSteps = options?.maxSteps ?? 25;
    const maxConsecutiveFailures = options?.maxConsecutiveFailures ?? 3;

    const steps: AgentStep[] = [];
    const history: Array<{ role: string; content: string }> = [];
    let consecutiveFailures = 0;
    let goalComplete = false;
    let extractedData: unknown = undefined;
    let summary = "";

    let totalTokens: TokenMetrics = {
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      inferenceTimeMs: 0,
      cost: 0,
    };

    // Build initial system message
    const systemMessage = this.buildSystemPrompt(
      instruction,
      options?.systemPrompt,
      options?.variables,
    );
    history.push({ role: "system", content: systemMessage });

    for (let stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
      const stepStart = performance.now();

      // Emit step_start event
      this.emitEvent(options, {
        type: "step_start",
        data: { stepIndex, maxSteps },
        stepIndex,
        timestamp: Date.now(),
      });

      try {
        // Step 1: Get page snapshot
        const snapshot = await page.getSnapshot();
        const pageDescription = this.buildPageDescription(snapshot);

        // Step 2: Ask LLM what to do next
        history.push({
          role: "user",
          content: `Current page state:\n${pageDescription}\n\nStep ${stepIndex + 1}/${maxSteps}. What should I do next?`,
        });

        const inferenceStart = performance.now();
        const planResponse = await this.llm.chat(history, {
          temperature: options?.temperature ?? 0,
          maxTokens: 1024,
        });
        const inferenceMs = Math.round(performance.now() - inferenceStart);

        const stepTokens: TokenMetrics = {
          promptTokens: planResponse.usage.promptTokens,
          completionTokens: planResponse.usage.completionTokens,
          reasoningTokens: 0,
          cachedInputTokens: 0,
          inferenceTimeMs: inferenceMs,
          cost: 0,
        };

        // Parse the agent's plan
        const plan = this.parsePlan(planResponse.content);

        // Emit thought
        this.emitEvent(options, {
          type: "thought",
          data: plan.thought,
          stepIndex,
          timestamp: Date.now(),
        });

        // Add assistant response to history
        history.push({ role: "assistant", content: planResponse.content });

        // Check if goal is complete
        if (plan.goalComplete) {
          goalComplete = true;
          extractedData = plan.extractedData;
          summary = plan.summary ?? `Completed: ${instruction}`;

          const step: AgentStep = {
            index: stepIndex,
            thought: plan.thought,
            action: null,
            result: null,
            observations: [],
            url: page.url(),
            durationMs: Math.round(performance.now() - stepStart),
            tokenUsage: stepTokens,
            goalComplete: true,
          };

          steps.push(step);
          totalTokens = addTokens(totalTokens, stepTokens);

          if (options?.onStep) await options.onStep(step);

          this.emitEvent(options, {
            type: "complete",
            data: { summary, extractedData },
            stepIndex,
            timestamp: Date.now(),
          });

          break;
        }

        // Step 3: Execute the planned action
        let actResult: ActResult | null = null;
        let actionPerformed: AgentAction | null = null;

        if (plan.action) {
          // Safety confirmation
          if (options?.requireConfirmation && options?.onConfirmation) {
            const action: AgentAction = {
              type: plan.action.type,
              value: plan.action.value,
              description: plan.action.instruction,
              timestamp: Date.now(),
            };

            const confirmed = await options.onConfirmation(action, stepIndex);
            if (!confirmed) {
              history.push({
                role: "user",
                content: "The user declined this action. Please try a different approach.",
              });
              continue;
            }
          }

          this.emitEvent(options, {
            type: "action",
            data: plan.action,
            stepIndex,
            timestamp: Date.now(),
          });

          // Execute via ActHandler
          actResult = await this.actHandler.execute(
            page,
            plan.action.instruction,
            { variables: options?.variables },
          );

          totalTokens = addTokens(totalTokens, actResult.tokenUsage);

          if (actResult.success) {
            consecutiveFailures = 0;
            actionPerformed = actResult.action ?? null;

            history.push({
              role: "user",
              content: `Action succeeded: ${actResult.description}`,
            });
          } else {
            consecutiveFailures++;
            history.push({
              role: "user",
              content: `Action failed: ${actResult.error ?? "Unknown error"}. Try a different approach.`,
            });
          }
        }

        // Build step record
        const step: AgentStep = {
          index: stepIndex,
          thought: plan.thought,
          action: actionPerformed,
          result: actResult,
          observations: [],
          url: page.url(),
          durationMs: Math.round(performance.now() - stepStart),
          tokenUsage: addTokens(stepTokens, actResult?.tokenUsage ?? emptyTokens()),
          goalComplete: false,
        };

        steps.push(step);
        totalTokens = addTokens(totalTokens, stepTokens);

        if (options?.onStep) await options.onStep(step);

        this.emitEvent(options, {
          type: "step_end",
          data: { stepIndex, success: actResult?.success ?? true },
          stepIndex,
          timestamp: Date.now(),
        });

        // Abort on too many consecutive failures
        if (consecutiveFailures >= maxConsecutiveFailures) {
          summary = `Aborted after ${maxConsecutiveFailures} consecutive failures`;
          break;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        consecutiveFailures++;

        const step: AgentStep = {
          index: stepIndex,
          thought: "Step failed with an error",
          action: null,
          result: null,
          observations: [],
          url: page.url(),
          durationMs: Math.round(performance.now() - stepStart),
          tokenUsage: emptyTokens(),
          goalComplete: false,
          error: errorMsg,
        };

        steps.push(step);

        this.emitEvent(options, {
          type: "error",
          data: errorMsg,
          stepIndex,
          timestamp: Date.now(),
        });

        if (options?.onStep) await options.onStep(step);

        if (consecutiveFailures >= maxConsecutiveFailures) {
          summary = `Aborted after ${maxConsecutiveFailures} consecutive failures`;
          break;
        }

        history.push({
          role: "user",
          content: `Error occurred: ${errorMsg}. Please recover and try again.`,
        });
      }
    }

    if (!goalComplete && !summary) {
      summary = `Reached maximum steps (${maxSteps}) without completing the goal`;
    }

    const actionCount = steps.filter((s) => s.action !== null).length;

    return {
      success: goalComplete,
      summary,
      steps,
      tokenUsage: totalTokens,
      durationMs: Math.round(performance.now() - startTime),
      actionCount,
      finalUrl: page.url(),
      extractedData,
      error: goalComplete ? undefined : summary,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildSystemPrompt(
    instruction: string,
    customPrompt?: string,
    variables?: Record<string, string>,
  ): string {
    let resolvedInstruction = instruction;
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        resolvedInstruction = resolvedInstruction.replace(
          new RegExp(`\\{\\{${key}\\}\\}`, "g"),
          value,
        );
      }
    }

    if (customPrompt) {
      return `${customPrompt}\n\nGoal: ${resolvedInstruction}`;
    }

    return `You are an autonomous browser agent. Your goal is to accomplish the following task by taking actions on web pages.

Goal: ${resolvedInstruction}

For each step, analyze the current page state and respond with a JSON object:
{
  "thought": "your reasoning about what to do next",
  "action": {
    "type": "click|fill|selectOption|hover|scroll|press|navigate",
    "instruction": "natural language instruction for the action",
    "value": "optional value for fill/select actions"
  },
  "goalComplete": false,
  "extractedData": null,
  "summary": null
}

When the goal is complete, set "goalComplete" to true, include any extracted data in "extractedData", and provide a summary in "summary". Set "action" to null when the goal is complete.

Rules:
- Take one action at a time
- Be precise with element selection
- If an action fails, try an alternative approach
- Do not repeat the same failed action
- Always respond with valid JSON`;
  }

  private buildPageDescription(snapshot: PageSnapshot): string {
    const parts: string[] = [];
    parts.push(`URL: ${snapshot.url}`);
    parts.push(`Title: ${snapshot.title}`);
    parts.push("");

    const elements = snapshot.elements
      .filter((e) => e.visible)
      .slice(0, 100);

    const interactable = elements.filter((e) => e.interactable);
    const nonInteractable = elements.filter((e) => !e.interactable && e.textContent);

    if (interactable.length > 0) {
      parts.push("Interactive elements:");
      for (const el of interactable) {
        let desc = `  [${el.ref}] ${el.role} "${el.name}"`;
        if (el.tagName) desc += ` <${el.tagName}>`;
        if (el.value) desc += ` value="${el.value}"`;
        if (el.textContent && el.textContent !== el.name) {
          desc += ` text="${el.textContent.slice(0, 100)}"`;
        }
        parts.push(desc);
      }
    }

    if (nonInteractable.length > 0) {
      parts.push("");
      parts.push("Page text content (key visible elements):");
      for (const el of nonInteractable.slice(0, 30)) {
        if (el.textContent) {
          parts.push(`  [${el.ref}] ${el.role}: ${el.textContent.slice(0, 200)}`);
        }
      }
    }

    return parts.join("\n");
  }

  private parsePlan(content: string): AgentPlan {
    let jsonStr = content.trim();

    // Handle markdown code blocks
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Find JSON object
    const jsonStart = jsonStr.indexOf("{");
    if (jsonStart > 0) {
      jsonStr = jsonStr.slice(jsonStart);
    }

    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      return {
        thought: String(parsed.thought ?? ""),
        action: parsed.action
          ? {
              type: String((parsed.action as Record<string, unknown>).type ?? "click"),
              instruction: String((parsed.action as Record<string, unknown>).instruction ?? ""),
              value: (parsed.action as Record<string, unknown>).value
                ? String((parsed.action as Record<string, unknown>).value)
                : undefined,
            }
          : null,
        goalComplete: Boolean(parsed.goalComplete),
        extractedData: parsed.extractedData ?? undefined,
        summary: parsed.summary ? String(parsed.summary) : undefined,
      };
    } catch (error) {
      logger.debug("Failed to parse agent plan JSON, using plain text", { error });
      return {
        thought: content.slice(0, 200),
        action: null,
        goalComplete: false,
      };
    }
  }

  private emitEvent(
    options: AgentOptions | undefined,
    event: AgentStreamEvent,
  ): void {
    if (options?.onEvent) {
      try {
        options.onEvent(event);
      } catch (error) {
        logger.debug("Agent event handler threw an error", { eventType: event.type, error });
      }
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function emptyTokens(): TokenMetrics {
  return {
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    inferenceTimeMs: 0,
    cost: 0,
  };
}

function addTokens(a: TokenMetrics, b: TokenMetrics): TokenMetrics {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    inferenceTimeMs: a.inferenceTimeMs + b.inferenceTimeMs,
    cost: a.cost + b.cost,
  };
}
