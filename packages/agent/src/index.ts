// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Main exports
// ──────────────────────────────────────────────────────────────────────────────

// Providers
export {
  LLMProvider,
  LLMError,
  type ProviderConfig,
  type LLMMessage,
  type LLMContentPart,
  type LLMToolDefinition,
  type LLMToolCall,
  type LLMRequestOptions,
  type LLMResponse,
  type LLMChunk,
} from "./providers/base.js";

export { ClaudeProvider } from "./providers/claude.js";
export { OpenAIProvider } from "./providers/openai.js";
export { GeminiProvider } from "./providers/gemini.js";
export { DeepSeekProvider } from "./providers/deepseek.js";
export { OllamaProvider } from "./providers/ollama.js";
export { AgentRouter, type AgentRouterConfig, type ProviderName } from "./providers/router.js";

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

// Memory
export { MessageManager, type MessageManagerOptions } from "./memory/short-term.js";
export { LongTermMemory, type LearnedPattern, type MemoryEntry } from "./memory/long-term.js";
export {
  ContextCompactor,
  type CompactionOptions,
  type CompactionResult,
} from "./memory/compaction.js";

// Cache
export { ActionCache, type ActionCacheConfig, type CachedAction } from "./cache/store.js";
export { ActionCache as ActCache, type ActionCacheConfig as ActCacheConfig, type CachedAction as CachedActionEntry } from "./cache/action-cache.js";
export {
  SelfHealer,
  type HealResult,
  type HealCandidate,
  type ElementDescription,
  type SnapshotElement,
} from "./cache/healing.js";

// Watchdogs
export {
  WatchdogManager,
  type WatchdogType,
  type WatchdogEvent,
  type WatchdogConfig,
  type Watchdog,
  type WatchdogCallback,
} from "./watchdogs/manager.js";
export { CaptchaWatchdog } from "./watchdogs/captcha.js";
export { DownloadWatchdog, type TrackedDownload } from "./watchdogs/downloads.js";
export { PopupWatchdog, type TrackedPopup, type PopupRule } from "./watchdogs/popups.js";
export { CrashWatchdog, type CrashInfo } from "./watchdogs/crashes.js";
export { DOMWatchdog, type DOMMutation } from "./watchdogs/dom.js";
export {
  PermissionsWatchdog,
  type PermissionRequest,
  type PermissionRule,
} from "./watchdogs/permissions.js";

// OTP
export { TOTPGenerator, generateTOTP, type TOTPConfig } from "./otp/totp.js";
export { EmailPoller, type EmailPollConfig, type EmailPollResult } from "./otp/email-poll.js";

// Loop detection
export {
  LoopDetector,
  type ActionRecord,
  type LoopDetection,
  type LoopNudge,
} from "./loop/detector.js";
export { ActionLoopDetector } from "./loop/action-loop.js";
export type { LoopDetectorConfig as ActionLoopConfig, LoopNudge as ActionLoopNudge } from "./loop/action-loop.js";

// Tools
export {
  ToolRegistry,
  type ToolHandler,
  type ToolParameterSchema,
  type ToolResult,
  type RegisteredTool,
} from "./tools/registry.js";
export {
  CustomTools,
  type CustomToolDefinition,
  type CustomToolParameter,
  type SkillReference,
} from "./tools/custom.js";
export { BaseTool, type ToolMetadata } from "./tools/base.js";
export {
  toolAction,
  toolProvider,
  registerDecoratedTools,
  type ToolActionMetadata,
  type DecoratedMethod,
} from "./tools/decorators.js";
export { ToolValidator, type ValidationError, type ValidationResult } from "./tools/validator.js";
export { NLAssert, type AssertionContext, type AssertionResult } from "./tools/nl-assert.js";

// Rate limiting
export { RateLimiter, RATE_LIMIT_PRESETS } from "./providers/rate-limiter.js";
export type { RateLimitConfig } from "./providers/rate-limiter.js";

// Fallback LLM
export { FallbackManager } from "./providers/fallback.js";
export type { FallbackConfig, LLMCallFn } from "./providers/fallback.js";

// Token tracking
export { TokenTracker } from "./tools/token-tracker.js";
export type { TokenBudget, TokenUsageEntry, TokenSummary } from "./tools/token-tracker.js";

// Sensitive data masking
export { SensitiveDataMasker } from "./tools/sensitive-masker.js";

// Judge LLM
export { JudgeLLM } from "./tools/judge.js";
export type { JudgeInput, JudgeVerdict } from "./tools/judge.js";

// User-defined tools
export { UserToolRegistry, defineTool } from "./tools/user-tools.js";
export type { UserToolDefinition } from "./tools/user-tools.js";

// Message compaction
export { MessageCompactor } from "./memory/compactor.js";
export type { CompactorConfig } from "./memory/compactor.js";

// Stall detection + replan
export { StallDetector } from "./loop/replan.js";
export type { ReplanConfig, ReplanResult } from "./loop/replan.js";

// Cross-session learning
export { PatternStore } from "./memory/pattern-store.js";
export type { LearnedPattern as StoredPattern } from "./memory/pattern-store.js";
