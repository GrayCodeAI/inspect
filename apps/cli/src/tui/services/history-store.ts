import * as fs from "node:fs";
import * as path from "node:path";
import { getCwd } from "@inspect/shared";
import { createLogger } from "@inspect/observability";
import type { TestReport } from "@inspect/shared";

const logger = createLogger("cli/tui/history-store");

export interface StoredTestRun {
  runId: string;
  instruction: string;
  url?: string;
  status: "passed" | "failed" | "partial";
  device: string;
  agent: string;
  timestamp: number;
  duration: number;
  stepsPassed: number;
  stepsFailed: number;
  report: TestReport;
}

export interface HistoryQuery {
  dateRange?: { start: number; end: number };
  status?: "passed" | "failed" | "partial";
  url?: string;
  limit?: number;
  offset?: number;
}

export interface FlakyTest {
  instruction: string;
  runCount: number;
  failureCount: number;
  failureRate: number;
}

/**
 * HistoryStore manages persistent storage of test run results.
 * Enables analytics, flakiness detection, and run history browsing.
 */
export class HistoryStore {
  private historyDir: string;
  private cache: Map<string, StoredTestRun> = new Map();

  constructor(basePath: string = getCwd()) {
    this.historyDir = path.join(basePath, ".inspect", "history");
    this.ensureDir();
    this.loadCache();
  }

  /**
   * Save a test run to history
   */
  saveRun(report: TestReport, metadata: Omit<StoredTestRun, "runId" | "report">): string {
    const runId = `run-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const run: StoredTestRun = {
      ...metadata,
      runId,
      report,
      timestamp: Date.now(),
    };

    try {
      const filePath = this.getRunPath(runId);
      const json = JSON.stringify(run, null, 2);
      fs.writeFileSync(filePath, json, "utf-8");
      this.cache.set(runId, run);
      logger.debug(`Test run saved: ${runId}`, {
        instruction: metadata.instruction,
        status: metadata.status,
      });
      return runId;
    } catch (err) {
      logger.error(`Failed to save test run ${runId}: ${err}`);
      throw err;
    }
  }

  /**
   * Get a single test run
   */
  getRun(runId: string): StoredTestRun | undefined {
    if (this.cache.has(runId)) {
      return this.cache.get(runId);
    }

    try {
      const filePath = this.getRunPath(runId);
      if (!fs.existsSync(filePath)) {
        return undefined;
      }

      const json = fs.readFileSync(filePath, "utf-8");
      const run = JSON.parse(json) as StoredTestRun;
      this.cache.set(runId, run);
      return run;
    } catch (err) {
      logger.error(`Failed to load run ${runId}: ${err}`);
      return undefined;
    }
  }

  /**
   * Query test runs with optional filters
   */
  query(options: HistoryQuery = {}): StoredTestRun[] {
    try {
      const files = fs
        .readdirSync(this.historyDir)
        .filter((f) => f.endsWith(".json") && f.startsWith("run-"))
        .sort()
        .reverse();

      const results: StoredTestRun[] = [];

      for (const file of files) {
        const runId = file.replace(".json", "");
        const run = this.getRun(runId);
        if (!run) continue;

        // Apply filters
        if (options.dateRange) {
          if (run.timestamp < options.dateRange.start || run.timestamp > options.dateRange.end) {
            continue;
          }
        }

        if (options.status && run.status !== options.status) {
          continue;
        }

        if (options.url && run.url !== options.url) {
          continue;
        }

        results.push(run);
      }

      // Apply limit/offset
      const offset = options.offset || 0;
      const limit = options.limit || 50;
      return results.slice(offset, offset + limit);
    } catch (err) {
      logger.error(`Failed to query history: ${err}`);
      return [];
    }
  }

  /**
   * Get list of all tests run (by instruction)
   */
  getAllTestInstructions(): string[] {
    try {
      const instructions = new Set<string>();
      const runs = this.query({ limit: 1000 });

      for (const run of runs) {
        instructions.add(run.instruction);
      }

      return Array.from(instructions);
    } catch (err) {
      logger.error(`Failed to get test instructions: ${err}`);
      return [];
    }
  }

  /**
   * Detect flaky tests (failing >10% of the time in last 20 runs)
   */
  getFlakyTests(): FlakyTest[] {
    try {
      const instructions = this.getAllTestInstructions();
      const flakyTests: FlakyTest[] = [];

      for (const instruction of instructions) {
        const runs = this.query({ limit: 20 });
        const matchingRuns = runs.filter((r) => r.instruction === instruction);

        if (matchingRuns.length < 3) continue; // Need at least 3 runs

        const failureCount = matchingRuns.filter((r) => r.status === "failed").length;
        const failureRate = failureCount / matchingRuns.length;

        if (failureRate > 0.1) {
          // More than 10% failure rate
          flakyTests.push({
            instruction,
            runCount: matchingRuns.length,
            failureCount,
            failureRate,
          });
        }
      }

      return flakyTests.sort((a, b) => b.failureRate - a.failureRate);
    } catch (err) {
      logger.error(`Failed to detect flaky tests: ${err}`);
      return [];
    }
  }

  /**
   * Get analytics: pass rate, cost, duration trends
   */
  getAnalytics(
    timeWindowMs: number = 7 * 24 * 60 * 60 * 1000, // 7 days
  ): {
    totalRuns: number;
    passedRuns: number;
    failedRuns: number;
    passRate: number;
    avgDuration: number;
    avgCost: number;
    deviceStats: Record<string, number>;
  } {
    try {
      const cutoff = Date.now() - timeWindowMs;
      const runs = this.query({ limit: 1000 });
      const recentRuns = runs.filter((r) => r.timestamp > cutoff);

      if (recentRuns.length === 0) {
        return {
          totalRuns: 0,
          passedRuns: 0,
          failedRuns: 0,
          passRate: 0,
          avgDuration: 0,
          avgCost: 0,
          deviceStats: {},
        };
      }

      const passedRuns = recentRuns.filter((r) => r.status === "passed").length;
      const failedRuns = recentRuns.filter((r) => r.status === "failed").length;
      const avgDuration = recentRuns.reduce((sum, r) => sum + r.duration, 0) / recentRuns.length;

      // Calculate average cost from token usage
      let totalCost = 0;
      for (const run of recentRuns) {
        // Estimate cost: input tokens * 0.003 + output tokens * 0.015
        const report = run.report as any;
        if (report?.metadata?.tokenUsage) {
          const { inputTokens = 0, outputTokens = 0 } = report.metadata.tokenUsage;
          totalCost += inputTokens * 0.000003 + outputTokens * 0.000015;
        }
      }
      const avgCost = totalCost / recentRuns.length;

      // Device stats
      const deviceStats: Record<string, number> = {};
      for (const run of recentRuns) {
        deviceStats[run.device] = (deviceStats[run.device] || 0) + 1;
      }

      return {
        totalRuns: recentRuns.length,
        passedRuns,
        failedRuns,
        passRate: passedRuns / recentRuns.length,
        avgDuration,
        avgCost,
        deviceStats,
      };
    } catch (err) {
      logger.error(`Failed to get analytics: ${err}`);
      return {
        totalRuns: 0,
        passedRuns: 0,
        failedRuns: 0,
        passRate: 0,
        avgDuration: 0,
        avgCost: 0,
        deviceStats: {},
      };
    }
  }

  /**
   * Clear old runs (keep last N)
   */
  cleanup(keepCount: number = 100): void {
    try {
      const files = fs
        .readdirSync(this.historyDir)
        .filter((f) => f.endsWith(".json") && f.startsWith("run-"))
        .sort()
        .reverse();

      for (let i = keepCount; i < files.length; i++) {
        const filePath = path.join(this.historyDir, files[i]);
        fs.unlinkSync(filePath);
        const runId = files[i].replace(".json", "");
        this.cache.delete(runId);
      }

      if (files.length > keepCount) {
        logger.info(`Cleaned up ${files.length - keepCount} old test runs`);
      }
    } catch (err) {
      logger.error(`Failed to cleanup history: ${err}`);
    }
  }

  /**
   * Export runs as CSV
   */
  exportAsCSV(options: HistoryQuery = {}): string {
    const runs = this.query(options);

    const headers = [
      "runId",
      "timestamp",
      "instruction",
      "url",
      "status",
      "device",
      "agent",
      "duration",
      "stepsPassed",
      "stepsFailed",
    ];

    const rows = runs.map((r) => [
      r.runId,
      new Date(r.timestamp).toISOString(),
      `"${r.instruction.replace(/"/g, '""')}"`,
      r.url || "",
      r.status,
      r.device,
      r.agent,
      r.duration,
      r.stepsPassed,
      r.stepsFailed,
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private getRunPath(runId: string): string {
    return path.join(this.historyDir, `${runId}.json`);
  }

  private ensureDir(): void {
    try {
      fs.mkdirSync(this.historyDir, { recursive: true, mode: 0o700 });
    } catch (err) {
      if ((err as any).code !== "EEXIST") {
        throw err;
      }
    }
  }

  private loadCache(): void {
    try {
      if (!fs.existsSync(this.historyDir)) {
        return;
      }

      const files = fs.readdirSync(this.historyDir).filter((f) => f.endsWith(".json"));

      for (const file of files.slice(-50)) {
        // Cache last 50 runs
        const runId = file.replace(".json", "");
        const run = this.getRun(runId);
        if (run) {
          this.cache.set(runId, run);
        }
      }

      logger.debug(`Loaded ${this.cache.size} test runs into cache`);
    } catch (err) {
      logger.warn(`Failed to load cache: ${err}`);
    }
  }
}
