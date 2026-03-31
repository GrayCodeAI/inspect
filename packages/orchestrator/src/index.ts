// @inspect/orchestrator — Test execution, scheduling, recovery, and testing utilities
// Split from @inspect/core to follow Single Responsibility Principle

// Orchestrator
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

// Enhanced watch engine
export {
  WatchEngine,
  type WatchEngineOptions,
  type WatchRunResult,
  type WatchState,
  type WatchEvent,
} from "./testing/watch-engine.js";

// Test coverage import graph analysis
export {
  TestCoverageAnalyzer,
  type CoverageReport,
  type ImportNode,
} from "./testing/coverage-analyzer.js";

// Framework detection
export { detectFramework, type DetectedFramework } from "./testing/framework-detector.js";

// Visual regression
export { VisualRegression } from "./visual/regression.js";
export type {
  VisualRegressionConfig,
  VisualComparisonResult,
  VisualRegressionReport,
} from "./visual/regression.js";

// Export utilities
export {
  generatePlaywrightTest,
  exportPlaywrightTest,
  generatePlaywrightFromSuite,
  exportPlaywrightFromSuite,
} from "./export/playwright.js";
export type { PlaywrightExportOptions } from "./export/playwright.js";
