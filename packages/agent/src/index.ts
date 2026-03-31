// @inspect/agent — Backward-compatibility facade
// Re-exports from @inspect/llm, @inspect/agent-memory, @inspect/agent-tools,
// @inspect/agent-watchdogs, @inspect/agent-governance
// New code should import the specific packages directly.

export {
  LLMProvider,
  LLMError,
  ClaudeProvider,
  OpenAIProvider,
  GeminiProvider,
  DeepSeekProvider,
  OllamaProvider,
  AgentRouter,
  RateLimiter,
  RATE_LIMIT_PRESETS,
  FallbackManager,
  type ProviderConfig,
  type LLMMessage,
  type LLMContentPart,
  type LLMToolDefinition,
  type LLMToolCall,
  type LLMRequestOptions,
  type LLMResponse,
  type LLMChunk,
  type AgentRouterConfig,
  type ProviderName,
  type RateLimitConfig,
  type FallbackConfig,
  type LLMCallFn,
} from "@inspect/llm";

export {
  MessageManager,
  LongTermMemory,
  ContextCompactor,
  MessageCompactor,
  PatternStore,
  ActionCache,
  SelfHealer,
  type MessageManagerOptions,
  type LearnedPattern,
  type MemoryEntry,
  type CompactionOptions,
  type CompactionResult,
  type CompactorConfig,
  type StoredPattern,
  type ActionCacheConfig,
  type CachedAction,
  type HealResult,
  type HealCandidate,
  type ElementDescription,
  type SnapshotElement,
} from "@inspect/agent-memory";

export {
  ToolRegistry,
  CustomTools,
  BaseTool,
  toolAction,
  toolProvider,
  registerDecoratedTools,
  ToolValidator,
  NLAssert,
  TokenTracker,
  SensitiveDataMasker,
  JudgeLLM,
  UserToolRegistry,
  defineTool,
  LoopDetector,
  ActionLoopDetector,
  StallDetector,
  type ToolHandler,
  type ToolParameterSchema,
  type ToolResult,
  type RegisteredTool,
  type CustomToolDefinition,
  type CustomToolParameter,
  type SkillReference,
  type ToolMetadata,
  type ToolActionMetadata,
  type DecoratedMethod,
  type ValidationError,
  type ValidationResult,
  type AssertionContext,
  type AssertionResult,
  type TokenBudget,
  type TokenUsageEntry,
  type TokenSummary,
  type JudgeInput,
  type JudgeVerdict,
  type UserToolDefinition,
  type ActionRecord,
  type LoopDetection,
  type LoopNudge,
  type ActionLoopConfig,
  type ActionLoopNudge,
  type ReplanConfig,
  type ReplanResult,
} from "@inspect/agent-tools";

export {
  WatchdogManager,
  CaptchaWatchdog,
  DownloadWatchdog,
  PopupWatchdog,
  CrashWatchdog,
  DOMWatchdog,
  PermissionsWatchdog,
  type WatchdogType,
  type WatchdogEvent,
  type WatchdogConfig,
  type Watchdog,
  type WatchdogCallback,
  type TrackedDownload,
  type TrackedPopup,
  type PopupRule,
  type CrashInfo,
  type DOMMutation,
  type PermissionRequest,
  type PermissionRule,
} from "@inspect/agent-watchdogs";

export {
  AuditTrail,
  AutonomyManager,
  AutonomyLevel,
  PermissionManager,
  type AuditEntry,
  type AuditAction,
  type AuditFilter,
  type ToolCall,
  type TokenUsage,
  type ComplianceReport,
  type AutonomyConfig,
  type AgentPermissions,
} from "@inspect/agent-governance";

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
