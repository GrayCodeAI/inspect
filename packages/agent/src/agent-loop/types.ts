export type AgentConfig = {
  maxSteps?: number;
  maxFailures?: number;
  model?: string;
  temperature?: number;
  stepTimeout?: number;
};
export type AgentAction = { type: string; params: Record<string, unknown> };
export type AgentOutput = unknown;
export type Observation = { type: string; content: string; timestamp: number };
export type AgentState = unknown;
export type ActionResult = unknown;

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxSteps: 50,
  maxFailures: 5,
  model: "claude-3-sonnet",
  temperature: 0.7,
  stepTimeout: 5000,
};
