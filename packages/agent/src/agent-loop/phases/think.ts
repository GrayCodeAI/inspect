/**
 * Think Phase - Agent Loop
 *
 * Calls LLM to plan next actions based on observations.
 * Part of: observe → think → act → finalize
 *
 * Task: 123 (think phase implementation)
 */

import type { AgentAction, AgentOutput } from "../index.js";
import type { AgentBrain } from "../brain.js";
import type { Observation } from "../index.js";

/**
 * Think input
 */
export interface ThinkInput {
  // Current observations (DOM, screenshot, etc.)
  observations: Observation[];

  // Agent's goal
  goal: string;

  // Agent's previous attempts (history of thinking)
  previousThoughts: AgentBrain[];

  // LLM provider
  llmProvider: any;

  // System prompt
  systemPrompt: string;

  // Model to use
  model: string;

  // Temperature for LLM
  temperature: number;

  // Max tokens for response
  maxTokens: number;
}

/**
 * Think output
 */
export interface ThinkOutput {
  // LLM brain with evaluation and planning
  brain: AgentBrain;

  // Planned actions
  actions: AgentAction[];

  // Confidence in plan (0-1)
  confidence: number;

  // Tokens used in LLM call
  tokensUsed: number;

  // Cost of LLM call (USD)
  costUSD: number;

  // LLM raw response (for debugging)
  rawResponse?: unknown;
}

/**
 * Think phase: Call LLM to plan next actions
 *
 * This phase:
 * 1. Formats observations for LLM
 * 2. Calls LLM with structured prompt
 * 3. Parses response into AgentBrain + Actions
 * 4. Validates plan and calculates confidence
 *
 * Estimated implementation: 100-150 LOC
 */
export async function thinkPhase(input: ThinkInput): Promise<ThinkOutput> {
  // Step 1: Format observations for LLM
  const formattedObservations = formatObservationsForLLM(input.observations);

  // Step 2: Build prompts
  const systemPrompt = buildSystemPrompt(input.systemPrompt);
  const userPrompt = buildUserPrompt(input.goal, formattedObservations, input.previousThoughts);

  // Step 3: Call LLM with structured output request
  let rawResponse: any;
  let tokensUsed = 0;
  let costUSD = 0;

  try {
    rawResponse = await input.llmProvider.chat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: input.model,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
    });

    // Extract token usage
    if (rawResponse.usage) {
      tokensUsed = (rawResponse.usage.input_tokens || 0) + (rawResponse.usage.output_tokens || 0);
      // Rough cost estimate: Claude 3 Sonnet ~$0.003 per 1K input, $0.015 per 1K output
      const inputCost = ((rawResponse.usage.input_tokens || 0) / 1000) * 0.003;
      const outputCost = ((rawResponse.usage.output_tokens || 0) / 1000) * 0.015;
      costUSD = inputCost + outputCost;
    }
  } catch (error) {
    // Fallback if LLM call fails
    return {
      brain: {
        evaluation: { success: false, assessment: `LLM call failed: ${error instanceof Error ? error.message : String(error)}` },
        memory: [],
        nextGoal: input.goal,
        confidence: 0,
      },
      actions: [],
      confidence: 0,
      tokensUsed: 0,
      costUSD: 0,
      rawResponse: error,
    };
  }

  // Step 4: Parse LLM response
  const responseContent = typeof rawResponse.content === "string" ? rawResponse.content : String(rawResponse.content);
  const parsed = parseLLMResponse(responseContent);

  // Step 5: Calculate confidence
  const confidence = calculateConfidence(parsed.brain, parsed.actions, 0.5);

  return {
    brain: parsed.brain,
    actions: parsed.actions,
    confidence,
    tokensUsed,
    costUSD,
    rawResponse,
  };
}

/**
 * Format observations for LLM
 */
function formatObservationsForLLM(observations: Observation[]): string {
  if (!observations || observations.length === 0) {
    return "No observations available.";
  }

  // Format each observation with its type
  const formatted = observations
    .map((obs: any) => {
      if (typeof obs === "object" && obs !== null) {
        const type = obs.type || "unknown";
        const content = obs.content || String(obs);
        return `[${type}] ${content}`;
      }
      return String(obs);
    })
    .join("\n");

  return formatted;
}

/**
 * Build system prompt
 */
function buildSystemPrompt(basePrompt: string): string {
  const outputFormatInstructions = `
You must respond with ONLY a valid JSON object in the following format:
{
  "evaluation": {
    "success": boolean,
    "assessment": "string describing what was observed",
    "lesson": "optional string with what was learned"
  },
  "memory": [
    { "content": "important fact", "importance": 0.9 }
  ],
  "nextGoal": "next step to take",
  "actions": [
    { "type": "click|type|scroll|navigate|wait|extract|hover|focus|submit|select", "params": {...} }
  ]
}`;

  return `${basePrompt}

${outputFormatInstructions}`;
}

/**
 * Build user prompt for current step
 */
function buildUserPrompt(
  goal: string,
  observations: string,
  previousThoughts: AgentBrain[],
): string {
  let prompt = `Goal: ${goal}\n\n`;

  prompt += `Current Observations:\n${observations}\n\n`;

  // Add previous attempts context
  if (previousThoughts && previousThoughts.length > 0) {
    prompt += `Previous Attempts:\n`;
    previousThoughts.slice(-3).forEach((thought, i) => {
      prompt += `${i + 1}. Assessment: ${thought.evaluation?.assessment || "unknown"}\n`;
      prompt += `   Next Goal: ${thought.nextGoal || "unknown"}\n`;
    });
    prompt += `\n`;
  }

  prompt += `Based on the observations and previous attempts, what are the next actions to take to achieve the goal? Respond with a JSON object as specified.`;

  return prompt;
}

/**
 * Parse LLM response into AgentBrain + Actions
 */
function parseLLMResponse(response: string): { brain: AgentBrain; actions: AgentAction[] } {
  try {
    // Extract JSON from response (handle cases where response has markdown or extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate brain structure
    const brain: AgentBrain = {
      evaluation: parsed.evaluation || { success: false, assessment: "parsed" },
      memory: parsed.memory || [],
      nextGoal: parsed.nextGoal || "continue",
      confidence: parsed.confidence,
    };

    // Extract and validate actions
    const actions: AgentAction[] = Array.isArray(parsed.actions)
      ? parsed.actions.map((action: any) => ({
          type: action.type || "click",
          params: action.params || {},
        }))
      : [];

    return { brain, actions };
  } catch (error) {
    // Return safe defaults if parsing fails
    return {
      brain: {
        evaluation: {
          success: false,
          assessment: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
        },
        memory: [],
        nextGoal: "retry",
      },
      actions: [],
    };
  }
}

/**
 * Calculate confidence in plan
 */
function calculateConfidence(
  brain: AgentBrain,
  actions: AgentAction[],
  previousSuccessRate: number,
): number {
  let confidence = brain.confidence ?? 0.5; // Start with LLM's stated confidence

  // Adjust based on whether evaluation was successful
  if (brain.evaluation?.success) {
    confidence = Math.min(1, confidence + 0.1);
  } else {
    confidence = Math.max(0, confidence - 0.2);
  }

  // Adjust based on number of actions (too many or too few might indicate uncertainty)
  if (actions.length === 0) {
    confidence = Math.max(0, confidence - 0.3); // No actions = low confidence
  } else if (actions.length > 5) {
    confidence = Math.max(0, confidence - 0.1); // Too many actions = some uncertainty
  }

  // Adjust based on previous success rate
  confidence = confidence * (0.7 + previousSuccessRate * 0.3);

  // Ensure confidence is in valid range
  return Math.max(0, Math.min(1, confidence));
}
