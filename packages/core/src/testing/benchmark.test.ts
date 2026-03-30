import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BenchmarkTracker } from "./benchmark.js";
import type { BenchmarkEntry } from "./benchmark.js";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeEntry(overrides: Partial<BenchmarkEntry> = {}): BenchmarkEntry {
  return {
    testName: "Login test",
    durationMs: 5000,
    tokenCount: 200,
    stepCount: 5,
    status: "pass",
    agent: "claude",
    device: "desktop-chrome",
    browser: "chromium",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("BenchmarkTracker", () => {
  const tmpFile = join(tmpdir(), `inspect-bench-test-${Date.now()}.json`);
  let tracker: BenchmarkTracker;

  beforeEach(() => {
    tracker = new BenchmarkTracker(tmpFile);
  });

  afterEach(() => {
    try {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    } catch {
      /* cleanup */
    }
  });

  it("records and retrieves entries", () => {
    tracker.record(makeEntry());
    tracker.record(makeEntry({ durationMs: 6000 }));
    expect(tracker.getEntryCount()).toBe(2);
  });

  it("persists entries to disk", () => {
    tracker.record(makeEntry());
    expect(existsSync(tmpFile)).toBe(true);

    const tracker2 = new BenchmarkTracker(tmpFile);
    expect(tracker2.getEntryCount()).toBe(1);
  });

  it("analyzes trends correctly", () => {
    const now = Date.now();
    tracker.record(makeEntry({ durationMs: 5000, timestamp: now - 3000 }));
    tracker.record(makeEntry({ durationMs: 5200, timestamp: now - 2000 }));
    tracker.record(makeEntry({ durationMs: 4800, timestamp: now - 1000 }));
    tracker.record(makeEntry({ durationMs: 5100, timestamp: now }));

    const report = tracker.analyze();
    expect(report.trends).toHaveLength(1);

    const trend = report.trends[0];
    expect(trend.testName).toBe("Login test");
    expect(trend.stats.totalRuns).toBe(4);
    expect(trend.stats.avgDuration).toBeGreaterThan(0);
    expect(trend.stats.minDuration).toBe(4800);
    expect(trend.stats.maxDuration).toBe(5200);
    expect(trend.stats.passRate).toBe(1);
  });

  it("detects regressions", () => {
    const now = Date.now();
    // 3 fast runs, then a very slow one
    tracker.record(makeEntry({ durationMs: 5000, timestamp: now - 4000 }));
    tracker.record(makeEntry({ durationMs: 5100, timestamp: now - 3000 }));
    tracker.record(makeEntry({ durationMs: 4900, timestamp: now - 2000 }));
    tracker.record(makeEntry({ durationMs: 10000, timestamp: now })); // 100% slower

    const report = tracker.analyze();
    expect(report.regressions.length).toBeGreaterThan(0);
    expect(report.regressions[0].regression).toBe(true);
    expect(report.regressions[0].changePercent).toBeGreaterThan(0.25);
  });

  it("detects improvements", () => {
    const now = Date.now();
    tracker.record(makeEntry({ durationMs: 10000, timestamp: now - 4000 }));
    tracker.record(makeEntry({ durationMs: 10200, timestamp: now - 3000 }));
    tracker.record(makeEntry({ durationMs: 9800, timestamp: now - 2000 }));
    tracker.record(makeEntry({ durationMs: 5000, timestamp: now })); // 50% faster

    const report = tracker.analyze();
    expect(report.improvements.length).toBeGreaterThan(0);
    expect(report.improvements[0].changePercent).toBeLessThan(-0.15);
  });

  it("groups by test name + device + browser", () => {
    tracker.record(makeEntry({ testName: "Test A", device: "desktop-chrome" }));
    tracker.record(makeEntry({ testName: "Test A", device: "iphone-15" }));
    tracker.record(makeEntry({ testName: "Test B", device: "desktop-chrome" }));

    const report = tracker.analyze();
    expect(report.trends).toHaveLength(3);
  });

  it("computes percentiles", () => {
    for (let i = 1; i <= 100; i++) {
      tracker.record(makeEntry({ durationMs: i * 100, timestamp: Date.now() + i }));
    }

    const report = tracker.analyze();
    const stats = report.trends[0].stats;
    expect(stats.p50Duration).toBeGreaterThan(4000);
    expect(stats.p50Duration).toBeLessThan(6000);
    expect(stats.p95Duration).toBeGreaterThan(9000);
  });

  it("prunes old entries", () => {
    for (let i = 0; i < 100; i++) {
      tracker.record(makeEntry({ timestamp: Date.now() + i }));
    }
    expect(tracker.getEntryCount()).toBe(100);

    tracker.prune(10);
    expect(tracker.getEntryCount()).toBe(10);
  });

  it("handles empty tracker", () => {
    const report = tracker.analyze();
    expect(report.trends).toHaveLength(0);
    expect(report.regressions).toHaveLength(0);
  });

  it("recordBatch adds multiple entries", () => {
    tracker.recordBatch([makeEntry(), makeEntry(), makeEntry()]);
    expect(tracker.getEntryCount()).toBe(3);
  });
});
