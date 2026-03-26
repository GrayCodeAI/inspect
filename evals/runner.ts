// ============================================================================
// Eval Runner - Orchestrates benchmark execution and reporting
// ============================================================================

import { createTimer, formatDuration } from "@inspect/shared";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/** Benchmark interface that all benchmarks must implement */
export interface Benchmark<TAgent, TResult, TSummary> {
  runAll(
    agent: TAgent,
    options?: {
      limit?: number;
      onTaskComplete?: (result: TResult, index: number, total: number) => void;
    },
  ): Promise<{ results: TResult[]; summary: TSummary }>;
}

/** Eval run configuration */
export interface EvalRunConfig {
  /** Benchmark name */
  benchmarkName: string;
  /** Model/agent identifier */
  modelName: string;
  /** Maximum tasks to run */
  limit?: number;
  /** Output directory for results */
  outputDir?: string;
  /** Whether to save results to disk */
  saveResults?: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Progress callback */
  onProgress?: (phase: string, current: number, total: number) => void;
}

/** Eval run result */
export interface EvalRunResult<TResult, TSummary> {
  /** Benchmark name */
  benchmarkName: string;
  /** Model identifier */
  modelName: string;
  /** All task-level results */
  results: TResult[];
  /** Aggregate summary */
  summary: TSummary;
  /** Total run duration */
  duration: number;
  /** Formatted duration string */
  durationFormatted: string;
  /** Run timestamp */
  timestamp: number;
  /** Run ID */
  runId: string;
  /** Path to saved results file (if saved) */
  outputPath?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Model comparison entry */
export interface ModelComparison {
  modelName: string;
  benchmarkName: string;
  /** Primary metric value (accuracy, success rate, etc.) */
  primaryMetric: number;
  /** Metric name */
  primaryMetricName: string;
  duration: number;
  timestamp: number;
}

/**
 * EvalRunner orchestrates benchmark execution, progress tracking,
 * result persistence, and model comparison.
 */
export class EvalRunner {
  private comparisons: ModelComparison[] = [];
  private readonly outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir ?? ".inspect/evals";
  }

  /**
   * Run a benchmark against an agent with full lifecycle management.
   */
  async run<TAgent, TResult, TSummary>(
    benchmark: Benchmark<TAgent, TResult, TSummary>,
    agent: TAgent,
    config: EvalRunConfig,
  ): Promise<EvalRunResult<TResult, TSummary>> {
    const timer = createTimer();
    const runId = `${config.benchmarkName}_${config.modelName}_${Date.now()}`;
    const timestamp = Date.now();

    config.onProgress?.("starting", 0, 1);

    // Run the benchmark
    const { results, summary } = await benchmark.runAll(agent, {
      limit: config.limit,
      onTaskComplete: (result, index, total) => {
        config.onProgress?.("running", index + 1, total);
      },
    });

    const duration = timer.elapsed();
    const durationFormatted = formatDuration(duration);

    config.onProgress?.("complete", 1, 1);

    // Build run result
    const runResult: EvalRunResult<TResult, TSummary> = {
      benchmarkName: config.benchmarkName,
      modelName: config.modelName,
      results,
      summary,
      duration,
      durationFormatted,
      timestamp,
      runId,
      metadata: config.metadata,
    };

    // Save results if requested
    if (config.saveResults !== false) {
      const outputPath = await this.saveResults(runResult, config.outputDir);
      runResult.outputPath = outputPath;
    }

    return runResult;
  }

  /**
   * Run multiple models against the same benchmark for comparison.
   */
  async compareModels<TAgent, TResult, TSummary>(
    benchmark: Benchmark<TAgent, TResult, TSummary>,
    agents: Array<{ name: string; agent: TAgent }>,
    config: Omit<EvalRunConfig, "modelName">,
    primaryMetricExtractor: (summary: TSummary) => { value: number; name: string },
  ): Promise<{
    runs: Array<EvalRunResult<TResult, TSummary>>;
    comparison: ModelComparison[];
    ranking: Array<{ rank: number; modelName: string; metric: number }>;
  }> {
    const runs: Array<EvalRunResult<TResult, TSummary>> = [];
    const comparisons: ModelComparison[] = [];

    for (const { name, agent } of agents) {
      const run = await this.run(benchmark, agent, {
        ...config,
        modelName: name,
      });
      runs.push(run);

      const metric = primaryMetricExtractor(run.summary);
      const comparison: ModelComparison = {
        modelName: name,
        benchmarkName: config.benchmarkName,
        primaryMetric: metric.value,
        primaryMetricName: metric.name,
        duration: run.duration,
        timestamp: run.timestamp,
      };
      comparisons.push(comparison);
      this.comparisons.push(comparison);
    }

    // Rank by primary metric (descending)
    const ranking = [...comparisons]
      .sort((a, b) => b.primaryMetric - a.primaryMetric)
      .map((c, idx) => ({
        rank: idx + 1,
        modelName: c.modelName,
        metric: c.primaryMetric,
      }));

    return { runs, comparison: comparisons, ranking };
  }

  /**
   * Generate a markdown report from eval results.
   */
  generateReport<TResult, TSummary>(run: EvalRunResult<TResult, TSummary>): string {
    const lines: string[] = [
      `# Eval Report: ${run.benchmarkName}`,
      "",
      `**Model:** ${run.modelName}`,
      `**Date:** ${new Date(run.timestamp).toISOString()}`,
      `**Duration:** ${run.durationFormatted}`,
      `**Tasks:** ${run.results.length}`,
      "",
      "## Summary",
      "",
      "```json",
      JSON.stringify(run.summary, null, 2),
      "```",
      "",
    ];

    if (run.metadata) {
      lines.push("## Metadata", "", "```json", JSON.stringify(run.metadata, null, 2), "```", "");
    }

    return lines.join("\n");
  }

  /**
   * Generate a comparison table in markdown.
   */
  generateComparisonTable(comparisons: ModelComparison[]): string {
    if (comparisons.length === 0) return "No comparisons available.";

    const metricName = comparisons[0].primaryMetricName;
    const sorted = [...comparisons].sort((a, b) => b.primaryMetric - a.primaryMetric);

    const lines: string[] = [
      `# Model Comparison: ${comparisons[0].benchmarkName}`,
      "",
      `| Rank | Model | ${metricName} | Duration |`,
      `|------|-------|${"-".repeat(metricName.length + 2)}|----------|`,
    ];

    sorted.forEach((c, idx) => {
      lines.push(
        `| ${idx + 1} | ${c.modelName} | ${(c.primaryMetric * 100).toFixed(1)}% | ${formatDuration(c.duration)} |`
      );
    });

    return lines.join("\n");
  }

  /**
   * Save results to a JSON file.
   */
  private async saveResults<TResult, TSummary>(
    run: EvalRunResult<TResult, TSummary>,
    outputDir?: string,
  ): Promise<string> {
    const dir = outputDir ?? this.outputDir;
    await mkdir(dir, { recursive: true });

    const filename = `${run.runId}.json`;
    const filePath = join(dir, filename);

    // Save without the full results array for the summary file
    const summaryData = {
      runId: run.runId,
      benchmarkName: run.benchmarkName,
      modelName: run.modelName,
      summary: run.summary,
      duration: run.duration,
      durationFormatted: run.durationFormatted,
      timestamp: run.timestamp,
      totalResults: run.results.length,
      metadata: run.metadata,
    };

    await writeFile(filePath, JSON.stringify(summaryData, null, 2), "utf-8");

    // Save full results in a separate file
    const fullPath = join(dir, `${run.runId}_full.json`);
    await writeFile(fullPath, JSON.stringify(run, null, 2), "utf-8");

    return filePath;
  }
}
