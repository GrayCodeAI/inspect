// ============================================================================
// Flake Detection — Track test stability across runs and flag flaky tests
// ============================================================================

import type { TestStep, TestReport, ProgressCallback } from "./types.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlakeEntry {
  stepDescription: string;
  action: string;
  passCount: number;
  failCount: number;
  totalRuns: number;
  flakeRate: number;
  lastSeen: string;
}

export interface FlakeReport {
  flaky: FlakeEntry[];
  stable: FlakeEntry[];
  totalSteps: number;
  flakyPercentage: number;
}

/** Internal record persisted per run in JSONL */
interface HistoryRecord {
  description: string;
  action: string;
  status: string;
  timestamp: string;
  duration: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_HISTORY_FILE = join(process.cwd(), ".inspect", "flake-history.json");

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Record results
// ---------------------------------------------------------------------------

/**
 * For each step in report.results, append a history record to the JSONL
 * history file. This builds up a per-step pass/fail timeline that can be
 * queried later for flakiness.
 */
export function recordResults(report: TestReport, historyFile?: string): void {
  const file = historyFile ?? DEFAULT_HISTORY_FILE;
  ensureDir(file);

  const timestamp = report.timestamp || new Date().toISOString();
  const lines: string[] = [];

  for (const step of report.results) {
    // Only record steps that actually ran (pass or fail)
    if (step.status !== "pass" && step.status !== "fail") continue;

    const record: HistoryRecord = {
      description: step.description,
      action: step.action,
      status: step.status,
      timestamp,
      duration: step.duration ?? 0,
    };

    lines.push(JSON.stringify(record));
  }

  if (lines.length > 0) {
    // Append with leading newline if file already has content
    const prefix = existsSync(file) && readFileSync(file, "utf-8").length > 0 ? "\n" : "";
    appendFileSync(file, prefix + lines.join("\n"), "utf-8");
  }
}

// ---------------------------------------------------------------------------
// Read history
// ---------------------------------------------------------------------------

function readHistory(historyFile?: string): HistoryRecord[] {
  const file = historyFile ?? DEFAULT_HISTORY_FILE;

  if (!existsSync(file)) return [];

  const content = readFileSync(file, "utf-8").trim();
  if (!content) return [];

  const records: HistoryRecord[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as HistoryRecord);
    } catch {
      // Skip malformed lines
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// Flake report
// ---------------------------------------------------------------------------

/**
 * Read history, group by step description, calculate pass/fail counts and
 * flake rate. A step is "flaky" if 0 < flakeRate < 1 (sometimes passes,
 * sometimes fails). Results are sorted by flake rate descending.
 */
export function getFlakeReport(historyFile?: string): FlakeReport {
  const records = readHistory(historyFile);

  // Group by step description
  const groups = new Map<string, { action: string; passes: number; fails: number; lastSeen: string }>();

  for (const record of records) {
    const key = record.description;
    const existing = groups.get(key);

    if (existing) {
      if (record.status === "pass") existing.passes++;
      else if (record.status === "fail") existing.fails++;
      // Keep the most recent timestamp
      if (record.timestamp > existing.lastSeen) {
        existing.lastSeen = record.timestamp;
      }
    } else {
      groups.set(key, {
        action: record.action,
        passes: record.status === "pass" ? 1 : 0,
        fails: record.status === "fail" ? 1 : 0,
        lastSeen: record.timestamp,
      });
    }
  }

  const flaky: FlakeEntry[] = [];
  const stable: FlakeEntry[] = [];

  for (const [description, data] of groups) {
    const totalRuns = data.passes + data.fails;
    const flakeRate = totalRuns > 0 ? data.fails / totalRuns : 0;

    const entry: FlakeEntry = {
      stepDescription: description,
      action: data.action,
      passCount: data.passes,
      failCount: data.fails,
      totalRuns,
      flakeRate: Math.round(flakeRate * 1000) / 1000, // 3 decimal places
      lastSeen: data.lastSeen,
    };

    // Flaky = has both passes and failures (0 < flakeRate < 1)
    if (flakeRate > 0 && flakeRate < 1) {
      flaky.push(entry);
    } else {
      stable.push(entry);
    }
  }

  // Sort flaky by flake rate descending
  flaky.sort((a, b) => b.flakeRate - a.flakeRate);

  // Sort stable alphabetically
  stable.sort((a, b) => a.stepDescription.localeCompare(b.stepDescription));

  const totalSteps = groups.size;
  const flakyPercentage = totalSteps > 0
    ? Math.round((flaky.length / totalSteps) * 1000) / 10
    : 0;

  return { flaky, stable, totalSteps, flakyPercentage };
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Return true if the step has been both pass and fail in its recorded history.
 */
export function isFlaky(stepDescription: string, historyFile?: string): boolean {
  const records = readHistory(historyFile);

  let hasPassed = false;
  let hasFailed = false;

  for (const record of records) {
    if (record.description !== stepDescription) continue;
    if (record.status === "pass") hasPassed = true;
    if (record.status === "fail") hasFailed = true;
    if (hasPassed && hasFailed) return true;
  }

  return false;
}

/**
 * Return all recorded runs for a specific step, ordered chronologically.
 */
export function getStepHistory(
  stepDescription: string,
  historyFile?: string,
): Array<{ status: string; timestamp: string; duration: number }> {
  const records = readHistory(historyFile);

  return records
    .filter((r) => r.description === stepDescription)
    .map((r) => ({
      status: r.status,
      timestamp: r.timestamp,
      duration: r.duration,
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ---------------------------------------------------------------------------
// Clear history
// ---------------------------------------------------------------------------

/**
 * Delete the history file entirely.
 */
export function clearHistory(historyFile?: string): void {
  const file = historyFile ?? DEFAULT_HISTORY_FILE;
  if (existsSync(file)) {
    unlinkSync(file);
  }
}
