// ──────────────────────────────────────────────────────────────────────────────
// @inspect/reporter - Test reporting and visualization
// ──────────────────────────────────────────────────────────────────────────────

// Notifications
export {
  SlackNotifier,
  createSlackNotifier,
  DEFAULT_SLACK_CONFIG,
  type SlackConfig,
  type SlackMessage,
  type SlackBlock,
  type SlackAttachment,
  type TestSummary,
} from "./notifications/slack.js";

// Visual Diff
export {
  VisualDiff,
  type VisualDiffOptions,
  type MaskRegion,
  type VisualDiffResult,
} from "./visual/diff.js";

// AI Analysis
export {
  AIAnalysis,
  type AnalysisLLM,
  type AnalysisResult,
  type VisualChange,
  type AnalysisOptions,
} from "./visual/analysis.js";

// GitHub Integration
export {
  GitHubStatus,
  GitHubAPIError,
  type GitHubStatusState,
  type GitHubStatusConfig,
  type StatusParams,
  type CheckRunParams,
} from "./github/status.js";

export {
  GitHubCommentFormatter,
  type GitHubCommentOptions,
  type ComparisonData,
} from "./github/comment.js";

// Report Formats
export {
  JSONReporter,
  type JSONReport,
  type JSONTestResult,
  type JSONReporterOptions,
} from "./formats/json.js";

export {
  GitHubActionsReporter,
  type GitHubActionsReporterOptions,
  type ActionsTestSuite,
  type ActionsTestResult,
  type ActionsTestStep,
} from "./formats/github-actions.js";

export {
  ReportAggregator,
  type AggregatedRun,
  type AggregatedStep,
  type AggregatedReport,
} from "./formats/aggregator.js";

export {
  MarkdownReporter,
  type TestResult,
  type TestStep,
  type Screenshot,
  type SuiteResult,
} from "./formats/markdown.js";

export { HTMLReporter, type HTMLReporterOptions } from "./formats/html.js";
