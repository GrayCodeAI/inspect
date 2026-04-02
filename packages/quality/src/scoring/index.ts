/**
 * Scoring Module - Index
 *
 * Statistical scoring engines for agent quality evaluation.
 */

export {
  LogNormalScoringEngine,
  DEFAULT_LOG_NORMAL_CONFIG,
  type LogNormalConfig,
  type ScoringResult,
  type MetricScore,
  type StatisticalDetails,
  type PerformanceSample,
  type BenchmarkComparison,
  createLogNormalScoringEngine,
} from "./log-normal-scoring";
