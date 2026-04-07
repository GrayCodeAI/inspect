/**
 * Think Phase - Effect-TS Implementation
 *
 * Calls LLM to plan next actions based on observations.
 * Part of: observe → think → act → finalize
 */

import { Effect, Schema } from "effect";
import { LLMProviderService, LLMMessage } from "@inspect/llm";
import type { AgentAction } from "../types.js";
import type { AgentBrain } from "../brain.js";
import type { Observation } from "../types.js";

export class ThinkInput extends Schema.Class<ThinkInput>("ThinkInput")({
  observations: Schema.Array(Schema.Unknown),
  goal: Schema.String,
  previousThoughts: Schema.Array(Schema.Unknown),
  systemPrompt: Schema.String,
  model: Schema.String,
  temperature: Schema.Number,
  maxTokens: Schema.Number,
  llmProvider: Schema.optional(Schema.String),
}) {}

export class ThinkOutput extends Schema.Class<ThinkOutput>("ThinkOutput")({
  brain: Schema.Unknown,
  actions: Schema.Array(Schema.Unknown),
  confidence: Schema.Number,
  tokensUsed: Schema.Number,
  costUSD: Schema.Number,
  rawResponse: Schema.optional(Schema.Unknown),
}) {}

export const thinkPhase = (
  input: ThinkInput,
): Effect.Effect<ThinkOutput, LLMResponseParseError, LLMProviderService> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ goal: input.goal, model: input.model });

    const formattedObservations = yield* formatObservationsForLLM(
      input.observations as Observation[],
    );
    const systemPrompt = yield* buildSystemPrompt(input.systemPrompt);
    const userPrompt = yield* buildUserPrompt(
      input.goal,
      formattedObservations,
      input.previousThoughts as AgentBrain[],
    );

    const messages = [
      new LLMMessage({ role: "system", content: systemPrompt }),
      new LLMMessage({ role: "user", content: userPrompt }),
    ] as const;

    const llmResponse = yield* callLLM(
      input.llmProvider ?? "anthropic",
      input.model,
      messages,
      input.temperature,
      input.maxTokens,
    );

    const parsed = yield* parseLLMResponse(llmResponse.text, input.goal);
    const confidence = yield* calculateConfidence(
      parsed.brain as AgentBrain,
      parsed.actions as AgentAction[],
      0.5,
    );

    return new ThinkOutput({
      brain: parsed.brain,
      actions: parsed.actions,
      confidence,
      tokensUsed: llmResponse.totalTokens,
      costUSD: llmResponse.costUSD,
      rawResponse: llmResponse.raw,
    });
  });

const callLLM = Effect.fn("ThinkPhase.callLLM")(function* (
  provider: string,
  model: string,
  messages: readonly LLMMessage[],
  _temperature: number,
  _maxTokens: number,
) {
  yield* Effect.annotateCurrentSpan({ provider, model });

  const llm = yield* LLMProviderService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = yield* llm.complete(provider as any, model, messages);

  const inputTokens = (response as { inputTokens?: number }).inputTokens ?? 0;
  const outputTokens =
    (response as { outputTokens?: number }).outputTokens ??
    (response as { totalTokens?: number }).totalTokens ??
    0;
  const totalTokens = inputTokens + outputTokens;

  const inputCost = (inputTokens / 1000) * 0.003;
  const outputCost = (outputTokens / 1000) * 0.015;
  const costUSD = inputCost + outputCost;

  yield* Effect.logDebug("LLM call completed", {
    provider,
    model,
    totalTokens,
    costUSD,
  });

  return {
    text: response.text,
    totalTokens,
    costUSD,
    raw: response,
  };
});

const formatObservationsForLLM = Effect.fn("ThinkPhase.formatObservations")(function* (
  observations: Observation[],
) {
  if (!observations || observations.length === 0) {
    return "No observations available.";
  }

  return observations
    .map((obs) => {
      if (typeof obs === "object" && obs !== null) {
        const type = (obs as { type?: string }).type ?? "unknown";
        const content = (obs as { content?: string }).content ?? String(obs);
        return `[${type}] ${content}`;
      }
      return String(obs);
    })
    .join("\n");
});

const buildSystemPrompt = Effect.fn("ThinkPhase.buildSystemPrompt")(function* (basePrompt: string) {
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

  return `${basePrompt}\n\n${outputFormatInstructions}`;
});

const buildUserPrompt = Effect.fn("ThinkPhase.buildUserPrompt")(function* (
  goal: string,
  observations: string,
  previousThoughts: AgentBrain[],
) {
  let prompt = `Goal: ${goal}\n\n`;
  prompt += `Current Observations:\n${observations}\n\n`;

  if (previousThoughts && previousThoughts.length > 0) {
    prompt += `Previous Attempts:\n`;
    previousThoughts.slice(-3).forEach((thought, i) => {
      prompt += `${i + 1}. Assessment: ${thought.evaluation?.assessment ?? "unknown"}\n`;
      prompt += `   Next Goal: ${thought.nextGoal ?? "unknown"}\n`;
    });
    prompt += `\n`;
  }

  prompt += `Based on the observations and previous attempts, what are the next actions to take to achieve the goal? Respond with a JSON object as specified.`;

  return prompt;
});

const parseLLMResponse = Effect.fn("ThinkPhase.parseLLMResponse")(function* (
  response: string,
  _goal: string,
) {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return yield* new LLMResponseParseError({ reason: "No JSON found" }).asEffect();
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const brain: AgentBrain = {
      evaluation: (parsed.evaluation as AgentBrain["evaluation"]) ?? {
        success: false,
        assessment: "parsed",
      },
      memory: parsed.memory ?? [],
      nextGoal: parsed.nextGoal ?? "continue",
      confidence: parsed.confidence,
    };

    const actions: AgentAction[] = Array.isArray(parsed.actions)
      ? parsed.actions.map((action: { type?: string; params?: Record<string, unknown> }) => ({
          type: action.type ?? "click",
          params: action.params ?? {},
        }))
      : [];

    return { brain, actions };
  } catch (error) {
    if (error instanceof LLMResponseParseError) {
      return yield* error.asEffect();
    }
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
});

const calculateConfidence = Effect.fn("ThinkPhase.calculateConfidence")(function* (
  brain: AgentBrain,
  actions: AgentAction[],
  previousSuccessRate: number,
) {
  let confidence = brain.confidence ?? 0.5;

  if (brain.evaluation?.success) {
    confidence = Math.min(1, confidence + 0.1);
  } else {
    confidence = Math.max(0, confidence - 0.2);
  }

  if (actions.length === 0) {
    confidence = Math.max(0, confidence - 0.3);
  } else if (actions.length > 5) {
    confidence = Math.max(0, confidence - 0.1);
  }

  confidence = confidence * (0.7 + previousSuccessRate * 0.3);

  return Math.max(0, Math.min(1, confidence));
});

export class LLMResponseParseError extends Schema.ErrorClass<LLMResponseParseError>(
  "LLMResponseParseError",
)({
  _tag: Schema.tag("LLMResponseParseError"),
  reason: Schema.String,
}) {
  message = `LLM response parse failed: ${this.reason}`;
}
