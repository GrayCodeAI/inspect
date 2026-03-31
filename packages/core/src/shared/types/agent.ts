// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Agent & LLM Configuration Types
// ──────────────────────────────────────────────────────────────────────────────

import type { AgentMode, VisionMode, VisionDetail } from "./element.js";

/** Supported LLM provider names */
export type LLMProviderName =
  | 'anthropic' | 'openai' | 'google' | 'deepseek' | 'mistral'
  | 'groq' | 'together' | 'ollama' | 'azure-openai' | 'aws-bedrock'
  | 'fireworks' | 'perplexity' | 'cohere' | 'openrouter' | 'custom';

/** Tool definition passed to the LLM */
export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Minimal AgentRouter interface for core (full implementation in @inspect/agent) */
export interface AgentRouter {
  chat(messages: Array<{role: string; content: string | Array<unknown>}>): Promise<unknown>;
}

/** Configuration for a single LLM provider */
export interface LLMProvider {
  name: LLMProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  thinkingMode?: boolean;
  thinkingBudget?: number;
  promptCaching?: boolean;
  headers?: Record<string, string>;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

/** Primary agent configuration with fallback and specialists */
export interface AgentConfig {
  primary: LLMProvider;
  fallback?: LLMProvider;
  specialists?: {
    ux?: LLMProvider;
    security?: LLMProvider;
    a11y?: LLMProvider;
    performance?: LLMProvider;
    vision?: LLMProvider;
    extraction?: LLMProvider;
  };
  mode: AgentMode;
  vision: VisionMode;
  visionDetail: VisionDetail;
  maxSteps: number;
  maxActionsPerStep: number;
  stepTimeout: number;
  thinkingMode: boolean;
  flashMode: boolean;
  planningEnabled: boolean;
  replanOnStall: boolean;
  explorationLimit: number;
  maxFailures: number;
  finalRecoveryAttempt: boolean;
}

/** Agent execution settings (subset for runtime) */
export interface AgentSettings {
  toolMode: AgentMode;
  vision: VisionMode;
  visionDetail: VisionDetail;
  thinkingMode: boolean;
  flashMode: boolean;
  maxSteps: number;
  maxActionsPerStep: number;
  stepTimeout: number;
  planningEnabled: boolean;
  replanOnStall: boolean;
  explorationLimit: number;
  maxFailures: number;
  finalRecoveryAttempt: boolean;
}

/** Token usage metrics for an LLM call */
export interface TokenMetrics {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  inferenceTimeMs: number;
  cost: number;
}

/** Per-function token usage breakdown */
export interface FunctionMetrics {
  act: TokenMetrics;
  extract: TokenMetrics;
  observe: TokenMetrics;
  agent: TokenMetrics;
}

/** Agent event types emitted during execution */
export type AgentEventType =
  | 'thought' | 'tool_call' | 'tool_result' | 'action' | 'observation'
  | 'plan' | 'error' | 'complete' | 'screenshot' | 'loop_detected'
  | 'recovery' | 'model_switch';

/** Agent event emitted during execution */
export interface AgentEvent {
  type: AgentEventType;
  data: unknown;
  timestamp: number;
  stepIndex?: number;
}

/** Agent action performed during execution */
export interface AgentAction {
  type: string;
  target?: string;
  value?: string;
  coordinates?: { x: number; y: number };
  description: string;
  timestamp: number;
  duration?: number;
  success?: boolean;
  error?: string;
}

/** Loop detection information */
export interface LoopInfo {
  repeatCount: number;
  action: string;
  nudge: string;
}

/** Recovery strategy types */
export type RecoveryStrategyType =
  | 'rescan' | 'use_vision' | 'heal_selector' | 'wait_and_retry'
  | 'switch_model' | 'restart_browser' | 'restore_snapshot'
  | 'extend_timeout' | 'skip' | 'fail';

/** Failure type classification */
export type FailureType =
  | 'element_not_found' | 'navigation_failed' | 'rate_limited'
  | 'page_crashed' | 'timeout' | 'authentication_failed'
  | 'captcha_blocked' | 'network_error' | 'unknown';

/** CUA provider identifiers */
export type CUAProvider = 'anthropic' | 'google' | 'microsoft' | 'openai';

/** CUA environment types */
export type CUAEnvironment = 'mac' | 'windows' | 'ubuntu' | 'browser';

/** CUA action returned by vision analysis */
export interface CUAAction {
  type: 'click' | 'type' | 'scroll' | 'key' | 'screenshot' | 'wait' | 'drag';
  coordinates?: { x: number; y: number };
  text?: string;
  key?: string;
  scrollDelta?: { x: number; y: number };
  endCoordinates?: { x: number; y: number };
  confidence: number;
  description: string;
}

/** Tool annotation for agent parallel execution */
export interface ToolAnnotation {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  opensNewPage?: boolean;
  estimatedDuration?: number;
}

/** Supported model definition */
export interface ModelDefinition {
  id: string;
  provider: LLMProviderName;
  name: string;
  contextWindow: number;
  maxOutput: number;
  supportsVision: boolean;
  supportsThinking: boolean;
  supportsFunctionCalling: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
}
