/**
 * Log-Normal Scoring Engine
 *
 * Evaluates agent performance using log-normal distributions for robust scoring.
 * Accounts for natural variation in task completion times and success rates.
 */

export interface LogNormalConfig {
  /** Confidence level for intervals (0-1) */
  confidenceLevel: number;
  /** Minimum sample size for reliable estimates */
  minSampleSize: number;
  /** Outlier threshold (z-score) */
  outlierThreshold: number;
  /** Time unit for latency calculations */
  timeUnit: "ms" | "s" | "m";
  /** Enable bootstrapping for small samples */
  useBootstrapping: boolean;
  /** Bootstrap iterations */
  bootstrapIterations: number;
}

export interface ScoringResult {
  /** Overall score (0-1) */
  score: number;
  /** Confidence interval */
  confidenceInterval: [number, number];
  /** Reliability of score */
  reliability: "low" | "medium" | "high";
  /** Sample size used */
  sampleSize: number;
  /** Breakdown by metric */
  metrics: Record<string, MetricScore>;
  /** Statistical details */
  statistics: StatisticalDetails;
  /** Timestamp */
  timestamp: number;
}

export interface MetricScore {
  name: string;
  value: number;
  weight: number;
  weightedScore: number;
  logMean?: number;
  logStdDev?: number;
  percentile?: number;
}

export interface StatisticalDetails {
  /** Geometric mean (for log-normal) */
  geometricMean: number;
  /** Arithmetic mean */
  arithmeticMean: number;
  /** Median */
  median: number;
  /** Standard deviation */
  stdDev: number;
  /** Log mean */
  logMean: number;
  /** Log standard deviation */
  logStdDev: number;
  /** Skewness */
  skewness: number;
  /** Kurtosis */
  kurtosis: number;
  /** Outliers detected */
  outliers: number;
  /** Shapiro-Wilk normality test p-value */
  normalityPValue?: number;
}

export interface PerformanceSample {
  /** Task identifier */
  taskId: string;
  /** Success indicator */
  success: boolean;
  /** Completion time (ms) */
  latency: number;
  /** Error type if failed */
  errorType?: string;
  /** Number of steps taken */
  steps?: number;
  /** Cost incurred ($) */
  cost?: number;
  /** Token usage */
  tokens?: number;
  /** Timestamp */
  timestamp: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface BenchmarkComparison {
  /** Compared against */
  benchmark: string;
  /** Relative performance */
  relativeScore: number;
  /** Statistical significance */
  pValue: number;
  /** Effect size (Cohen's d) */
  effectSize: number;
  /** Is significantly better */
  isSignificantlyBetter: boolean;
}

export const DEFAULT_LOG_NORMAL_CONFIG: LogNormalConfig = {
  confidenceLevel: 0.95,
  minSampleSize: 10,
  outlierThreshold: 3,
  timeUnit: "ms",
  useBootstrapping: true,
  bootstrapIterations: 1000,
};

/**
 * Log-Normal Scoring Engine
 *
 * Provides robust statistical scoring for agent performance metrics.
 */
export class LogNormalScoringEngine {
  private config: LogNormalConfig;
  private samples: PerformanceSample[] = [];
  private benchmarks = new Map<string, number[]>();

  constructor(config: Partial<LogNormalConfig> = {}) {
    this.config = { ...DEFAULT_LOG_NORMAL_CONFIG, ...config };
  }

  /**
   * Add performance sample
   */
  addSample(sample: PerformanceSample): void {
    this.samples.push(sample);
  }

  /**
   * Add multiple samples
   */
  addSamples(samples: PerformanceSample[]): void {
    this.samples.push(...samples);
  }

  /**
   * Calculate log-normal score
   */
  calculateScore(
    metric: "latency" | "successRate" | "steps" | "cost",
    samples?: PerformanceSample[],
  ): ScoringResult {
    const data = samples || this.samples;
    const values = this.extractValues(data, metric);

    if (values.length === 0) {
      throw new Error(`No data for metric: ${metric}`);
    }

    // Remove outliers
    const { cleaned, outliers } = this.removeOutliers(values);

    // Calculate log-normal statistics
    const stats = this.calculateLogNormalStats(cleaned);

    // Calculate confidence interval
    const ci = this.calculateConfidenceInterval(cleaned);

    // Determine reliability
    const reliability = this.determineReliability(cleaned.length);

    // Calculate percentile score (lower is better for latency, steps, cost)
    const percentile = this.calculatePercentile(cleaned);
    const score = ["latency", "steps", "cost"].includes(metric)
      ? 1 - percentile / 100 // Lower is better
      : percentile / 100; // Higher is better for success rate

    // Build metric scores
    const metrics: Record<string, MetricScore> = {
      [metric]: {
        name: metric,
        value: stats.median,
        weight: 1,
        weightedScore: score,
        logMean: stats.logMean,
        logStdDev: stats.logStdDev,
        percentile,
      },
    };

    return {
      score,
      confidenceInterval: ci,
      reliability,
      sampleSize: cleaned.length,
      metrics,
      statistics: {
        ...stats,
        outliers: outliers.length,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Calculate composite score across multiple metrics
   */
  calculateCompositeScore(
    weights: Record<string, number>,
    samples?: PerformanceSample[],
  ): ScoringResult {
    const data = samples || this.samples;
    const metricScores: Record<string, MetricScore> = {};
    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const [metric, weight] of Object.entries(weights)) {
      const values = this.extractValues(data, metric as any);
      if (values.length === 0) continue;

      const { cleaned } = this.removeOutliers(values);
      const stats = this.calculateLogNormalStats(cleaned);
      const percentile = this.calculatePercentile(cleaned);

      const score = ["latency", "steps", "cost"].includes(metric)
        ? 1 - percentile / 100
        : percentile / 100;

      metricScores[metric] = {
        name: metric,
        value: stats.median,
        weight,
        weightedScore: score * weight,
        logMean: stats.logMean,
        logStdDev: stats.logStdDev,
        percentile,
      };

      totalWeightedScore += score * weight;
      totalWeight += weight;
    }

    const overallScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

    return {
      score: overallScore,
      confidenceInterval: [Math.max(0, overallScore - 0.1), Math.min(1, overallScore + 0.1)],
      reliability: this.determineReliability(data.length),
      sampleSize: data.length,
      metrics: metricScores,
      statistics: {
        geometricMean: overallScore,
        arithmeticMean: overallScore,
        median: overallScore,
        stdDev: 0,
        logMean: Math.log(overallScore || 1),
        logStdDev: 0,
        skewness: 0,
        kurtosis: 0,
        outliers: 0,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Compare against benchmark
   */
  compareToBenchmark(metric: string, benchmarkName: string): BenchmarkComparison | null {
    const benchmarkData = this.benchmarks.get(benchmarkName);
    if (!benchmarkData) return null;

    const currentValues = this.extractValues(this.samples, metric as any);
    if (currentValues.length === 0) return null;

    // Perform t-test
    const { pValue, effectSize } = this.performTTest(currentValues, benchmarkData);

    const currentMedian = this.median(currentValues);
    const benchmarkMedian = this.median(benchmarkData);

    return {
      benchmark: benchmarkName,
      relativeScore: benchmarkMedian / currentMedian,
      pValue,
      effectSize,
      isSignificantlyBetter: pValue < 0.05 && currentMedian < benchmarkMedian,
    };
  }

  /**
   * Add benchmark data
   */
  addBenchmark(name: string, values: number[]): void {
    this.benchmarks.set(name, values);
  }

  /**
   * Extract values for metric
   */
  private extractValues(
    samples: PerformanceSample[],
    metric: "latency" | "successRate" | "steps" | "cost",
  ): number[] {
    switch (metric) {
      case "latency":
        return samples.map((s) => s.latency).filter((v): v is number => v > 0);
      case "successRate":
        // Return 1 for success, 0 for failure
        return samples.map((s) => (s.success ? 1 : 0));
      case "steps":
        return samples.map((s) => s.steps).filter((v): v is number => v !== undefined && v > 0);
      case "cost":
        return samples.map((s) => s.cost).filter((v): v is number => v !== undefined && v >= 0);
      default:
        return [];
    }
  }

  /**
   * Remove outliers using z-score
   */
  private removeOutliers(values: number[]): { cleaned: number[]; outliers: number[] } {
    const logValues = values.map((v) => Math.log(Math.max(v, 0.001)));
    const mean = this.mean(logValues);
    const stdDev = this.stdDev(logValues);

    const cleaned: number[] = [];
    const outliers: number[] = [];

    for (let i = 0; i < values.length; i++) {
      const zScore = Math.abs((logValues[i] - mean) / stdDev);
      if (zScore > this.config.outlierThreshold) {
        outliers.push(values[i]);
      } else {
        cleaned.push(values[i]);
      }
    }

    return { cleaned: cleaned.length > 0 ? cleaned : values, outliers };
  }

  /**
   * Calculate log-normal statistics
   */
  private calculateLogNormalStats(values: number[]): StatisticalDetails {
    const logValues = values.map((v) => Math.log(Math.max(v, 0.001)));

    const logMean = this.mean(logValues);
    const logStdDev = this.stdDev(logValues);

    // Convert back to original scale
    const geometricMean = Math.exp(logMean);
    const arithmeticMean = this.mean(values);
    const median = this.median(values);
    const stdDev = this.stdDev(values);

    // Calculate skewness and kurtosis
    const skewness = this.skewness(values);
    const kurtosis = this.kurtosis(values);

    return {
      geometricMean,
      arithmeticMean,
      median,
      stdDev,
      logMean,
      logStdDev,
      skewness,
      kurtosis,
      outliers: 0,
    };
  }

  /**
   * Calculate confidence interval
   */
  private calculateConfidenceInterval(values: number[]): [number, number] {
    if (this.config.useBootstrapping && values.length < this.config.minSampleSize) {
      return this.bootstrapConfidenceInterval(values);
    }

    const logValues = values.map((v) => Math.log(Math.max(v, 0.001)));
    const mean = this.mean(logValues);
    const stdErr = this.stdDev(logValues) / Math.sqrt(values.length);

    // Z-score for confidence level
    const zScore = this.config.confidenceLevel === 0.95 ? 1.96 : 2.576;

    const lower = Math.exp(mean - zScore * stdErr);
    const upper = Math.exp(mean + zScore * stdErr);

    return [lower, upper];
  }

  /**
   * Bootstrap confidence interval
   */
  private bootstrapConfidenceInterval(values: number[]): [number, number] {
    const n = values.length;
    const medians: number[] = [];

    for (let i = 0; i < this.config.bootstrapIterations; i++) {
      const sample: number[] = [];
      for (let j = 0; j < n; j++) {
        sample.push(values[Math.floor(Math.random() * n)]);
      }
      medians.push(this.median(sample));
    }

    medians.sort((a, b) => a - b);

    const lowerIndex = Math.floor(((1 - this.config.confidenceLevel) / 2) * medians.length);
    const upperIndex = Math.floor(((1 + this.config.confidenceLevel) / 2) * medians.length);

    return [medians[lowerIndex], medians[upperIndex]];
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const median = this.median(values);

    // Find percentile of median
    let count = 0;
    for (const v of sorted) {
      if (v <= median) count++;
    }

    return (count / sorted.length) * 100;
  }

  /**
   * Determine reliability based on sample size
   */
  private determineReliability(sampleSize: number): "low" | "medium" | "high" {
    if (sampleSize < this.config.minSampleSize / 2) return "low";
    if (sampleSize < this.config.minSampleSize) return "medium";
    return "high";
  }

  /**
   * Perform t-test
   */
  private performTTest(
    sample1: number[],
    sample2: number[],
  ): { pValue: number; effectSize: number } {
    const mean1 = this.mean(sample1);
    const mean2 = this.mean(sample2);
    const var1 = this.variance(sample1);
    const var2 = this.variance(sample2);

    const pooledStd = Math.sqrt((var1 + var2) / 2);
    const cohensD = (mean1 - mean2) / pooledStd;

    // Simplified p-value estimation
    const se = Math.sqrt(var1 / sample1.length + var2 / sample2.length);
    const tStat = Math.abs(mean1 - mean2) / se;
    const df = sample1.length + sample2.length - 2;

    // Approximate p-value (very simplified)
    const pValue = Math.max(0.001, 2 * (1 - this.cdfT(tStat, df)));

    return { pValue, effectSize: Math.abs(cohensD) };
  }

  // Statistical helper functions
  private mean(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private variance(values: number[]): number {
    const mean = this.mean(values);
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }

  private stdDev(values: number[]): number {
    return Math.sqrt(this.variance(values));
  }

  private skewness(values: number[]): number {
    const mean = this.mean(values);
    const stdDev = this.stdDev(values);
    const n = values.length;
    return values.reduce((sum, v) => sum + Math.pow((v - mean) / stdDev, 3), 0) / n;
  }

  private kurtosis(values: number[]): number {
    const mean = this.mean(values);
    const stdDev = this.stdDev(values);
    const n = values.length;
    return values.reduce((sum, v) => sum + Math.pow((v - mean) / stdDev, 4), 0) / n - 3;
  }

  private cdfT(t: number, df: number): number {
    // Simplified t-distribution CDF
    // For production, use a proper statistical library
    const x = df / (df + t * t);
    return 1 - 0.5 * Math.pow(x, df / 2);
  }

  /**
   * Get samples
   */
  getSamples(): PerformanceSample[] {
    return [...this.samples];
  }

  /**
   * Clear samples
   */
  clearSamples(): void {
    this.samples = [];
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalSamples: number;
    successRate: number;
    averageLatency: number;
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
  } {
    const latencies = this.samples.map((s) => s.latency).filter((l) => l > 0);
    const sorted = [...latencies].sort((a, b) => a - b);

    return {
      totalSamples: this.samples.length,
      successRate: this.samples.filter((s) => s.success).length / this.samples.length,
      averageLatency: this.mean(latencies),
      latencyP50: this.percentile(sorted, 50),
      latencyP95: this.percentile(sorted, 95),
      latencyP99: this.percentile(sorted, 99),
    };
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

/**
 * Convenience function
 */
export function createLogNormalScoringEngine(
  config?: Partial<LogNormalConfig>,
): LogNormalScoringEngine {
  return new LogNormalScoringEngine(config);
}
