// ============================================================================
// @inspect/core - Benchmark Tracker
//
// Tracks test performance over time and detects regressions.
// Stores historical data in .inspect/benchmarks.json.
// ============================================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface BenchmarkEntry {
  testName: string;
  durationMs: number;
  tokenCount: number;
  stepCount: number;
  status: "pass" | "fail";
  agent: string;
  device: string;
  browser: string;
  timestamp: number;
  commitHash?: string;
}

export interface BenchmarkTrend {
  testName: string;
  entries: BenchmarkEntry[];
  stats: {
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    p50Duration: number;
    p95Duration: number;
    avgTokens: number;
    passRate: number;
    totalRuns: number;
  };
  /** Whether the latest run is slower than the trend */
  regression: boolean;
  /** Percentage change from average (positive = slower) */
  changePercent: number;
}

export interface BenchmarkReport {
  generatedAt: number;
  trends: BenchmarkTrend[];
  regressions: BenchmarkTrend[];
  improvements: BenchmarkTrend[];
}

const DEFAULT_PATH = ".inspect/benchmarks.json";
const REGRESSION_THRESHOLD = 0.25; // 25% slower = regression
const IMPROVEMENT_THRESHOLD = -0.15; // 15% faster = improvement

/**
 * BenchmarkTracker stores and analyzes test performance over time.
 *
 * Usage:
 * ```ts
 * const tracker = new BenchmarkTracker();
 * tracker.record({ testName: "login", durationMs: 5000, ... });
 * const report = tracker.analyze();
 * ```
 */
export class BenchmarkTracker {
  private entries: BenchmarkEntry[] = [];
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(process.cwd(), DEFAULT_PATH);
    this.load();
  }

  /**
   * Record a new benchmark entry.
   */
  record(entry: BenchmarkEntry): void {
    this.entries.push(entry);
    this.save();
  }

  /**
   * Record multiple entries.
   */
  recordBatch(entries: BenchmarkEntry[]): void {
    this.entries.push(...entries);
    this.save();
  }

  /**
   * Analyze trends and detect regressions/improvements.
   */
  analyze(): BenchmarkReport {
    const grouped = new Map<string, BenchmarkEntry[]>();
    for (const entry of this.entries) {
      const key = `${entry.testName}|${entry.device}|${entry.browser}`;
      const list = grouped.get(key) ?? [];
      list.push(entry);
      grouped.set(key, list);
    }

    const trends: BenchmarkTrend[] = [];

    for (const [, entries] of grouped) {
      // Sort by timestamp
      entries.sort((a, b) => a.timestamp - b.timestamp);

      const durations = entries.map((e) => e.durationMs).sort((a, b) => a - b);
      const tokens = entries.map((e) => e.tokenCount);
      const passCount = entries.filter((e) => e.status === "pass").length;

      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const latest = entries[entries.length - 1];
      const changePercent = avg > 0 ? (latest.durationMs - avg) / avg : 0;

      trends.push({
        testName: latest.testName,
        entries,
        stats: {
          avgDuration: Math.round(avg),
          minDuration: durations[0],
          maxDuration: durations[durations.length - 1],
          p50Duration: this.percentile(durations, 50),
          p95Duration: this.percentile(durations, 95),
          avgTokens: Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length),
          passRate: entries.length > 0 ? passCount / entries.length : 0,
          totalRuns: entries.length,
        },
        regression: changePercent > REGRESSION_THRESHOLD && entries.length >= 3,
        changePercent: Math.round(changePercent * 100) / 100,
      });
    }

    const regressions = trends.filter((t) => t.regression);
    const improvements = trends.filter(
      (t) => t.changePercent < IMPROVEMENT_THRESHOLD && t.entries.length >= 3,
    );

    return {
      generatedAt: Date.now(),
      trends,
      regressions,
      improvements,
    };
  }

  /**
   * Get entry count.
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  /**
   * Prune old entries (keep last N per test).
   */
  prune(keepPerTest = 50): void {
    const grouped = new Map<string, BenchmarkEntry[]>();
    for (const entry of this.entries) {
      const key = entry.testName;
      const list = grouped.get(key) ?? [];
      list.push(entry);
      grouped.set(key, list);
    }

    this.entries = [];
    for (const [, entries] of grouped) {
      entries.sort((a, b) => b.timestamp - a.timestamp);
      this.entries.push(...entries.slice(0, keepPerTest));
    }

    this.save();
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        const data = JSON.parse(readFileSync(this.filePath, "utf-8"));
        this.entries = Array.isArray(data) ? data : [];
      }
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
    } catch {
      // Best effort
    }
  }

  // ── Math helpers ─────────────────────────────────────────────────────────

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  }
}
