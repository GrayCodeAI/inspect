// @inspect/agent — Backward-compatibility facade
// Re-exports core functionality from @inspect/llm, @inspect/agent-memory, @inspect/agent-tools
// New code should import the specific packages directly.

// LLM providers
export type { LLMProvider, LLMMessage, LLMResponse } from "@inspect/llm";
export { LLMProvider as BaseLLMProvider } from "@inspect/llm";

// Memory & tools
export { ActionCache, PatternStore } from "@inspect/agent-memory";
export type { ActionRecord } from "@inspect/agent-tools";
export {
  ToolRegistry,
  ActionLoopDetector,
  ContextCompactor,
  SensitiveDataMasker,
  LoopDetector,
} from "@inspect/agent-tools";

// OTP
export { TOTPGenerator, generateTOTP, type TOTPConfig } from "./otp/totp.js";
export { EmailPoller, type EmailPollConfig, type EmailPollResult } from "./otp/email-poll.js";

// ACP
export {
  ACPClient,
  ACPError,
  type ACPConfig,
  type ACPEvent,
  type ACPEventType,
} from "./acp/client.js";

// Prompts
export { PromptBuilder, type PromptConfig, type UserPromptContext } from "./prompts/builder.js";
export {
  SYSTEM_PROMPT as ADVERSARIAL_SYSTEM_PROMPT,
  buildTestPrompt,
  getAdversarialPayloads,
  type AdversarialContext,
  type AdversarialElements,
} from "./prompts/adversarial.js";

// Specialist prompts
export {
  UX_SPECIALIST_PROMPT,
  UX_EVALUATION_CRITERIA,
  buildUXInstruction,
} from "./prompts/specialists/ux.js";
export {
  SECURITY_SPECIALIST_PROMPT,
  XSS_PAYLOADS,
  SQLI_PAYLOADS,
  buildSecurityInstruction,
} from "./prompts/specialists/security.js";
export {
  A11Y_SPECIALIST_PROMPT,
  WCAG_CHECKS,
  buildA11yInstruction,
} from "./prompts/specialists/a11y.js";
export {
  PERFORMANCE_SPECIALIST_PROMPT,
  PERFORMANCE_THRESHOLDS,
  rateMetric,
  buildPerformanceInstruction,
} from "./prompts/specialists/performance.js";

// Orchestration
export {
  AgentGraph,
  type AgentNode,
  type AgentEdge,
  type GraphState,
  type GraphResult,
  type GraphEvent,
  type GraphEventType,
  type SerializedGraph,
  type GraphValidationResult,
} from "./orchestration/index.js";

// Real Agent Loop (observe → think → act → finalize)
export {
  AgentLoop,
  type AgentConfig,
  type AgentState,
  type AgentBrain,
  type AgentOutput,
  type AgentAction,
  type Observation,
  type ActionResult,
  DEFAULT_AGENT_CONFIG,
} from "./agent-loop/index.js";

// Speculative Planning & Self-Healing
// Note: These modules will be fully implemented in Phase 1
// Currently providing minimal stubs for compilation

// Action Caching
export {
  type Action,
  type CacheConfig,
  type CacheHit,
  type CacheStats,
  type ElementSignature,
  type ReplayableAction,
  DEFAULT_CACHE_CONFIG,
} from "./cache/index.js";

// Self-Healing
export {
  type HealResult,
  type HealCandidate,
  type ElementDescription,
  type SnapshotElement,
} from "./cache/healing.js";

// Provider Router
export { AgentRouter } from "./providers/router.js";

// Agent Tools (for orchestrator)
export type { ToolDefinition as LLMToolDefinition } from "@inspect/agent-tools";

// Provider Name (from LLM)
export type { ProviderName } from "@inspect/llm";

// Governance stubs
export { WatchdogManager, type WatchdogConfig, type WatchdogEvent } from "./governance/watchdog.js";
export { AutonomyManager, AutonomyLevel, type AutonomyConfig } from "./governance/autonomy.js";
export {
  PermissionManager,
  type PermissionConfig,
  type Permissions,
} from "./governance/permissions.js";
export {
  AuditTrail,
  type AuditEntry,
  type AuditQuery,
  type ComplianceReport,
} from "./governance/audit-trail.js";
export {
  GuardrailEngine,
  type GuardrailCheck,
  type GuardrailConfig,
  type GuardrailContext,
  BUILTIN_GUARDRAILS,
} from "./governance/guardrails.js";
