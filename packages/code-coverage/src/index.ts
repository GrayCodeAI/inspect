// ──────────────────────────────────────────────────────────────────────────────
// @inspect/code-coverage - V8 coverage collection, processing, and reporting
// ──────────────────────────────────────────────────────────────────────────────

export { CoverageCollectorService } from "./coverage-collector.js";
export type {
  CoverageCollector,
  CoverageRange,
  FunctionCoverage,
  ScriptCoverage,
  RawCoverageData,
} from "./coverage-collector.js";

export { CoverageProcessor } from "./coverage-processor.js";
export type {
  CoverageSummary,
  CoverageMetrics,
  FileCoverage,
  LineCoverage,
  CoverageFilter,
} from "./coverage-processor.js";

export { CoverageReporter } from "./coverage-reporter.js";
export type { ReportFormat, CoverageReporterOptions, WatermarkConfig } from "./coverage-reporter.js";

export { CoverageThreshold } from "./coverage-threshold.js";
export type { CoverageThresholds, ThresholdCheckResult } from "./coverage-threshold.js";

export {
  CoverageCollectionError,
  CoverageProcessingError,
  CoverageThresholdError,
} from "./errors.js";
