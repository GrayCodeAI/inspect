export type {
  AgentOptions,
  AgentStep,
  AgentStreamEvent,
  AgentResult,
  AgentHandler,
} from "./agent.js";
export type { ActionSuggestion, ObserveOptions, ObserveResult, ObserveHandler } from "./observe.js";
export type { SchemaLike, ExtractOptions, ExtractResult, ExtractHandler } from "./extract.js";
export type {
  ActOptions,
  ActResult,
  LLMClient,
  ActionCacheInterface,
  PageInterface,
  ActHandler,
} from "./act.js";

// Stub exports for planned features - TODO: implement
export interface InspectSDKConfig {
  apiKey?: string;
  baseUrl?: string;
}
export type InspectConfig = Record<string, unknown>;
export type HistoryEntry = Record<string, unknown>;
export const Inspect = {};
export const defineConfig = (config: InspectSDKConfig) => config;
