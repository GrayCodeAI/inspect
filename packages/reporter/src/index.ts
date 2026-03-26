// ──────────────────────────────────────────────────────────────────────────────
// @inspect/reporter - Main exports
// ──────────────────────────────────────────────────────────────────────────────

// Formats
export {
  MarkdownReporter,
  type TestResult,
  type TestStep,
  type Screenshot,
  type SuiteResult,
} from "./formats/markdown.js";

export {
  HTMLReporter,
  type HTMLReporterOptions,
} from "./formats/html.js";

export {
  JSONReporter,
  type JSONReport,
  type JSONTestResult,
  type JSONReporterOptions,
} from "./formats/json.js";

// GitHub integration
export {
  GitHubCommentFormatter,
  type GitHubCommentOptions,
  type ComparisonData,
} from "./github/comment.js";

export {
  GitHubStatus,
  GitHubAPIError,
  type GitHubStatusConfig,
  type StatusParams,
  type CheckRunParams,
  type GitHubStatusState,
} from "./github/status.js";

// Visual comparison
export {
  VisualDiff,
  type VisualDiffOptions,
  type VisualDiffResult,
  type MaskRegion,
} from "./visual/diff.js";

export {
  AIAnalysis,
  type AnalysisLLM,
  type AnalysisResult,
  type VisualChange,
  type AnalysisOptions,
} from "./visual/analysis.js";
