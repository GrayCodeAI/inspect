import { Effect, Schema } from "effect";

export class AgentLoopNotImplementedError extends Schema.ErrorClass<AgentLoopNotImplementedError>(
  "AgentLoopNotImplementedError",
)({
  _tag: Schema.tag("AgentLoopNotImplementedError"),
  detail: Schema.String,
}) {
  message = `Agent loop is not yet implemented: ${this.detail}`;
}

export type AgentConfig = { maxSteps?: number };
export type AgentOutput = unknown;
export type ActionResult = unknown;

export function runAgentLoop(
  _config: AgentConfig,
): Effect.Effect<never, AgentLoopNotImplementedError> {
  return new AgentLoopNotImplementedError({
    detail: "The full agent loop (observe/think/act/finalize) has not been implemented yet.",
  }).asEffect();
}
