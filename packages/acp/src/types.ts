import { Schema } from "effect";

export const AgentProvider = Schema.Literal(
  "claude",
  "codex",
  "copilot",
  "gemini",
  "cursor",
  "opencode",
  "droid",
);
export type AgentProvider = typeof AgentProvider.Type;

export const AcpSessionUpdate = Schema.Union(
  Schema.Struct({
    sessionUpdate: Schema.Literal("agent_message_chunk"),
    content: Schema.Struct({
      type: Schema.Literal("text"),
      text: Schema.String,
    }),
  }),
  Schema.Struct({
    sessionUpdate: Schema.Literal("agent_thought_chunk"),
    content: Schema.Struct({
      type: Schema.Literal("text"),
      text: Schema.String,
    }),
  }),
  Schema.Struct({
    sessionUpdate: Schema.Literal("tool_call"),
    toolCall: Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      input: Schema.Unknown,
    }),
  }),
  Schema.Struct({
    sessionUpdate: Schema.Literal("tool_call_update"),
    toolCallUpdate: Schema.Struct({
      id: Schema.String,
      status: Schema.String,
      output: Schema.Unknown,
    }),
  }),
  Schema.Struct({
    sessionUpdate: Schema.Literal("run_finished"),
  }),
  Schema.Struct({
    sessionUpdate: Schema.Literal("error"),
    error: Schema.String,
  }),
  Schema.Struct({
    sessionUpdate: Schema.Literal("config_option_update"),
    configOptions: Schema.Array(Schema.Unknown),
  }),
);
export type AcpSessionUpdate = typeof AcpSessionUpdate.Type;

export class AgentStreamOptions extends Schema.Class<AgentStreamOptions>("AgentStreamOptions")({
  cwd: Schema.String,
  sessionId: Schema.OptionFromSelf(Schema.String),
  prompt: Schema.String,
  systemPrompt: Schema.OptionFromSelf(Schema.String),
  mcpEnv: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      value: Schema.String,
    }),
  ),
  modelPreference: Schema.optional(
    Schema.Struct({
      configId: Schema.String,
      value: Schema.String,
    }),
  ),
}) {}
