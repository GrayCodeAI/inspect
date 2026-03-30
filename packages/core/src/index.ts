// Core package - main entry point
// Re-exports all public APIs from sub-modules

export { TestExecutor } from "./orchestrator/executor.js";
export type {
  ExecutionConfig,
  ExecutionResult,
  ExecutionProgress,
  ExecutorDependencies,
  StepPlan,
  StepResult,
  AdversarialFinding,
} from "./orchestrator/executor.js";

export { TestScheduler } from "./orchestrator/scheduler.js";
export type { SchedulerConfig, ScheduledRun } from "./orchestrator/scheduler.js";

export { RecoveryManager } from "./orchestrator/recovery.js";
export type {
  FailureType,
  RecoveryStrategy,
  DiagnosisResult,
  RecoveryExecutors,
} from "./orchestrator/recovery.js";

export { SpeculativePlanner } from "./orchestrator/speculative.js";
export type { SpeculativePlan, SpeculativeStats } from "./orchestrator/speculative.js";

export { CheckpointManager } from "./orchestrator/checkpoint.js";
export type { CheckpointData, CheckpointStep } from "./orchestrator/checkpoint.js";

export { GitManager } from "./git/git.js";

export { Fingerprint } from "./git/fingerprint.js";

export { ContextBuilder } from "./git/context.js";
export type { GitContext, ContextLimits } from "./git/context.js";

export { GitHubPR } from "./github/pr.js";
export type { PRInfo, PRDiff } from "./github/pr.js";

export { PRComments } from "./github/comments.js";
export type { CommentPayload, StatusPayload } from "./github/comments.js";

export {
  DevicePresets,
  getPreset,
  listPresets,
  resolveDevices,
  getPresetsByCategory,
} from "./devices/presets.js";
export type { DeviceConfig } from "./devices/presets.js";

export { DevicePool } from "./devices/pool.js";
export type { DeviceRunResult } from "./devices/pool.js";

export { VisualRegression } from "./visual/regression.js";

export {
  generatePlaywrightTest,
  exportPlaywrightTest,
  generatePlaywrightFromSuite,
  exportPlaywrightFromSuite,
} from "./export/playwright.js";
export type { PlaywrightExportOptions } from "./export/playwright.js";
export type {
  VisualRegressionConfig,
  VisualComparisonResult,
  VisualRegressionReport,
} from "./visual/regression.js";

// Dashboard orchestrator
export { DashboardOrchestrator } from "./orchestrator/dashboard.js";

// Agent tools and prompts
export {
  AGENT_TOOLS,
  VISUAL_TOOLS,
  NON_VISUAL_TOOLS,
  CACHEABLE_TOOLS,
} from "./orchestrator/tools.js";
export { SYSTEM_PROMPT } from "./orchestrator/prompts.js";

// Test run caching
export { RunCache } from "./testing/run-cache.js";
export type { CachedTestRun, CachedStep, RunCacheConfig } from "./testing/run-cache.js";

// Error classification
export {
  ErrorClassifier,
  type ErrorCategory,
  type ClassifiedError,
} from "./testing/error-classifier.js";

// Plugin system
export {
  PluginLoader,
  definePlugin,
  type InspectPlugin,
  type PluginContext,
  type PluginTool,
  type PluginAssertion,
} from "./plugins/loader.js";

// Diff-based testing
export {
  DiffRunner,
  type DiffTestConfig,
  type CoverageMapEntry,
  type DiffAnalysis,
  type ChangeCategory,
} from "./testing/diff-runner.js";

// Diff-aware test plan generation
export { DiffPlanGenerator, type DiffPlanGeneratorConfig } from "./testing/diff-plan-generator.js";

// Adversarial testing
export { AdversarialExecutor, type AdversarialConfig } from "./testing/adversarial-executor.js";

// Retry policies
export {
  RetryExecutor,
  RETRY_PRESETS,
  type RetryPolicy,
  type RetryStrategy,
  type RetryResult,
  type RetryAttempt,
} from "./testing/retry.js";

// Test tagging & filtering
export { TagExpression, TestFilter, type TaggedTest } from "./testing/tags.js";

// Benchmark tracking
export {
  BenchmarkTracker,
  type BenchmarkEntry,
  type BenchmarkTrend,
  type BenchmarkReport,
} from "./testing/benchmark.js";

// Test prioritization
export {
  TestPrioritizer,
  type TestEntry,
  type PrioritizationInput,
  type PrioritizationWeights,
  type PrioritizedTest,
  type PrioritizationResult,
} from "./testing/prioritizer.js";

// Cross-browser comparison
export {
  CrossBrowserComparator,
  type CrossBrowserConfig,
  type BrowserRunResult,
  type CrossBrowserDiff,
  type StepDiff,
  type PerformanceComparison,
} from "./testing/cross-browser.js";

// Test generation
export {
  TestGenerator,
  type PageAnalysis,
  type GeneratedTest,
  type GeneratedTestSuite,
  type GeneratedStep,
  type TestCategory,
  type PageType,
} from "./testing/generator.js";

// Flakiness detection
export {
  FlakinessDetector,
  type TestExecution,
  type FlakinessScore,
  type FlakinessReport,
} from "./testing/flakiness.js";

// Self-healing engine
export {
  SelfHealer,
  HealingStrategy,
  DOMDiffer,
  type HealResult,
  type HealCandidate,
  type ElementDescription,
  type SnapshotElement,
  type HealingAttemptResult,
  type DOMChange,
  type DOMDiffResult,
  mapMethodToStrategy,
} from "./healing/index.js";

// Self-healing + generation (additional exports not in testing/)
export { type AnalyzedElement, type FormInfo } from "./generation/index.js";
