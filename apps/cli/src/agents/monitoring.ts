// ============================================================================
// Synthetic Monitoring — Schedule test runs and track results over time
// ============================================================================

import type { ProgressCallback, TestReport } from "./types.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonitorConfig {
  url: string;
  /** Interval between runs in milliseconds */
  interval: number;
  /** Test tiers to run (e.g. ["a11y", "security", "performance"]) */
  tiers: string[];
  /** Webhook URL for alerts */
  alertWebhook?: string;
  /** Score drop threshold to trigger alerts (default: 10) */
  alertThreshold?: number;
  /** Maximum history entries to keep (default: 1000) */
  maxHistory?: number;
}

export interface MonitorResult {
  timestamp: string;
  url: string;
  score: number;
  passed: boolean;
  duration: number;
  issues: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_HISTORY_FILE = join(process.cwd(), ".inspect", "monitor-history.json");
const DEFAULT_THRESHOLD = 10;
const DEFAULT_MAX_HISTORY = 1000;
const REGRESSION_WINDOW = 5;

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Start monitor
// ---------------------------------------------------------------------------

/**
 * Start a synthetic monitoring loop that calls runTest on the configured
 * interval, saves results, checks for regressions, and sends alerts.
 * Returns an object with a stop() function.
 */
export async function startMonitor(
  config: MonitorConfig,
  runTest: (url: string) => Promise<TestReport>,
  onProgress: ProgressCallback,
): Promise<{ stop: () => void }> {
  let running = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const threshold = config.alertThreshold ?? DEFAULT_THRESHOLD;

  onProgress("info", `Starting monitor for ${config.url} (interval: ${Math.round(config.interval / 1000)}s)`);

  const executeRun = async (): Promise<void> => {
    if (!running) return;

    const startTime = Date.now();
    onProgress("info", `[monitor] Running test for ${config.url}...`);

    try {
      const report = await runTest(config.url);

      const result: MonitorResult = {
        timestamp: new Date().toISOString(),
        url: config.url,
        score: report.summary.overallScore,
        passed: report.summary.failed === 0,
        duration: Date.now() - startTime,
        issues: report.summary.failed,
      };

      saveMonitorResult(result);
      onProgress("step", `[monitor] Score: ${result.score} | Passed: ${result.passed} | Duration: ${result.duration}ms`);

      // Check for regression
      const history = loadMonitorHistory();
      const regression = detectRegression(history, threshold);

      if (regression.regressed) {
        onProgress("warn", `[monitor] REGRESSION: ${regression.details}`);

        if (config.alertWebhook) {
          try {
            await sendAlert(config.alertWebhook, result, regression);
            onProgress("info", `[monitor] Alert sent to webhook`);
          } catch (err) {
            onProgress("fail", `[monitor] Failed to send alert: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      // Trim history if needed
      const maxHistory = config.maxHistory ?? DEFAULT_MAX_HISTORY;
      if (history.length > maxHistory) {
        trimHistory(history, maxHistory);
      }
    } catch (err) {
      onProgress("fail", `[monitor] Test run failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Schedule next run
    if (running) {
      timer = setTimeout(() => {
        executeRun().catch(() => {});
      }, config.interval);
    }
  };

  // Run immediately, then on interval
  executeRun().catch(() => {});

  return {
    stop: () => {
      running = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      onProgress("done", `[monitor] Stopped monitoring ${config.url}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Persistence (JSONL)
// ---------------------------------------------------------------------------

/**
 * Append a MonitorResult to the JSONL history file.
 */
export function saveMonitorResult(result: MonitorResult, historyFile?: string): void {
  const file = historyFile ?? DEFAULT_HISTORY_FILE;
  ensureDir(file);

  const line = JSON.stringify(result);

  if (existsSync(file) && readFileSync(file, "utf-8").length > 0) {
    appendFileSync(file, "\n" + line, "utf-8");
  } else {
    appendFileSync(file, line, "utf-8");
  }
}

/**
 * Read and parse the JSONL history file into an array of MonitorResults.
 */
export function loadMonitorHistory(historyFile?: string): MonitorResult[] {
  const file = historyFile ?? DEFAULT_HISTORY_FILE;

  if (!existsSync(file)) return [];

  const content = readFileSync(file, "utf-8").trim();
  if (!content) return [];

  const results: MonitorResult[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      results.push(JSON.parse(trimmed) as MonitorResult);
    } catch {
      // Skip malformed lines
    }
  }

  return results;
}

/**
 * Trim history to the most recent N entries by rewriting the file.
 */
function trimHistory(history: MonitorResult[], maxEntries: number, historyFile?: string): void {
  const file = historyFile ?? DEFAULT_HISTORY_FILE;
  const trimmed = history.slice(-maxEntries);

  ensureDir(file);
  writeFileSync(file, trimmed.map((r) => JSON.stringify(r)).join("\n"), "utf-8");
}

// ---------------------------------------------------------------------------
// Regression detection
// ---------------------------------------------------------------------------

/**
 * Compare the latest result score against the average of the last N results.
 * If the drop exceeds the threshold (default 10 points), flag as regression.
 */
export function detectRegression(
  history: MonitorResult[],
  threshold?: number,
): { regressed: boolean; delta: number; details: string } {
  const limit = threshold ?? DEFAULT_THRESHOLD;

  if (history.length < 2) {
    return { regressed: false, delta: 0, details: "Not enough data for regression detection" };
  }

  const latest = history[history.length - 1];
  const windowSize = Math.min(REGRESSION_WINDOW, history.length - 1);
  const previousSlice = history.slice(-(windowSize + 1), -1);

  const avgScore = previousSlice.reduce((sum, r) => sum + r.score, 0) / previousSlice.length;
  const delta = Math.round((latest.score - avgScore) * 100) / 100;

  if (delta < -limit) {
    return {
      regressed: true,
      delta,
      details: `Score dropped from avg ${avgScore.toFixed(1)} to ${latest.score} (delta: ${delta.toFixed(1)}, threshold: -${limit})`,
    };
  }

  return {
    regressed: false,
    delta,
    details: `Score ${latest.score} vs avg ${avgScore.toFixed(1)} (delta: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)})`,
  };
}

// ---------------------------------------------------------------------------
// Alerting
// ---------------------------------------------------------------------------

/**
 * HTTP POST to a webhook URL with JSON payload containing the monitoring
 * result and optional regression information.
 */
export async function sendAlert(
  webhookUrl: string,
  result: MonitorResult,
  regression?: { regressed: boolean; delta: number; details: string },
): Promise<void> {
  const payload = {
    type: "inspect-monitor-alert",
    timestamp: result.timestamp,
    url: result.url,
    score: result.score,
    passed: result.passed,
    duration: result.duration,
    issues: result.issues,
    regression: regression
      ? {
          regressed: regression.regressed,
          scoreDelta: regression.delta,
          details: regression.details,
        }
      : null,
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
  }
}

// ---------------------------------------------------------------------------
// HTML report generation
// ---------------------------------------------------------------------------

/**
 * Generate a self-contained HTML page with a score trend chart (inline SVG),
 * result table, and regression alerts.
 */
export function generateMonitorHTML(history: MonitorResult[]): string {
  if (history.length === 0) {
    return buildHTML("No Data", "<p>No monitoring data recorded yet.</p>", "");
  }

  const url = history[0].url;
  const latest = history[history.length - 1];
  const regression = detectRegression(history);

  // --- SVG Chart ---
  const chart = generateSVGChart(history);

  // --- Stats summary ---
  const avgScore = history.reduce((s, r) => s + r.score, 0) / history.length;
  const passRate = (history.filter((r) => r.passed).length / history.length) * 100;
  const avgDuration = history.reduce((s, r) => s + r.duration, 0) / history.length;

  const statsHTML = `
    <div class="stats">
      <div class="stat">
        <span class="stat-value">${latest.score}</span>
        <span class="stat-label">Latest Score</span>
      </div>
      <div class="stat">
        <span class="stat-value">${avgScore.toFixed(1)}</span>
        <span class="stat-label">Avg Score</span>
      </div>
      <div class="stat">
        <span class="stat-value">${passRate.toFixed(0)}%</span>
        <span class="stat-label">Pass Rate</span>
      </div>
      <div class="stat">
        <span class="stat-value">${(avgDuration / 1000).toFixed(1)}s</span>
        <span class="stat-label">Avg Duration</span>
      </div>
      <div class="stat">
        <span class="stat-value">${history.length}</span>
        <span class="stat-label">Total Runs</span>
      </div>
    </div>`;

  // --- Regression alert ---
  const alertHTML = regression.regressed
    ? `<div class="alert alert-danger">
        <strong>Regression Detected:</strong> ${escapeHTML(regression.details)}
      </div>`
    : `<div class="alert alert-ok">
        <strong>Status:</strong> ${escapeHTML(regression.details)}
      </div>`;

  // --- Results table ---
  const recentHistory = history.slice(-50).reverse();
  const tableRows = recentHistory
    .map((r) => {
      const statusClass = r.passed ? "pass" : "fail";
      const statusText = r.passed ? "PASS" : "FAIL";
      return `
      <tr>
        <td>${escapeHTML(r.timestamp)}</td>
        <td>${r.score}</td>
        <td class="${statusClass}">${statusText}</td>
        <td>${(r.duration / 1000).toFixed(1)}s</td>
        <td>${r.issues}</td>
      </tr>`;
    })
    .join("\n");

  const tableHTML = `
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Score</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Issues</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>`;

  const bodyContent = `
    <h2>Monitoring: ${escapeHTML(url)}</h2>
    ${alertHTML}
    ${statsHTML}
    <h3>Score Trend</h3>
    <div class="chart-container">${chart}</div>
    <h3>Recent Results (last 50)</h3>
    ${tableHTML}`;

  return buildHTML(`Inspect Monitor — ${url}`, bodyContent, monitorCSS());
}

// ---------------------------------------------------------------------------
// SVG chart
// ---------------------------------------------------------------------------

function generateSVGChart(history: MonitorResult[]): string {
  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (history.length === 0) {
    return `<svg width="${width}" height="${height}"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#999">No data</text></svg>`;
  }

  // Scale scores to chart area (0-100 range)
  const minScore = 0;
  const maxScore = 100;

  const scaleX = (i: number): number => {
    if (history.length === 1) return padding.left + chartW / 2;
    return padding.left + (i / (history.length - 1)) * chartW;
  };

  const scaleY = (score: number): number => {
    const clamped = Math.max(minScore, Math.min(maxScore, score));
    return padding.top + chartH - ((clamped - minScore) / (maxScore - minScore)) * chartH;
  };

  // Build polyline points
  const points = history
    .map((r, i) => `${scaleX(i).toFixed(1)},${scaleY(r.score).toFixed(1)}`)
    .join(" ");

  // Build gradient fill area
  const areaPoints = [
    `${scaleX(0).toFixed(1)},${(padding.top + chartH).toFixed(1)}`,
    ...history.map((r, i) => `${scaleX(i).toFixed(1)},${scaleY(r.score).toFixed(1)}`),
    `${scaleX(history.length - 1).toFixed(1)},${(padding.top + chartH).toFixed(1)}`,
  ].join(" ");

  // Data point circles
  const circles = history
    .map((r, i) => {
      const color = r.passed ? "#22c55e" : "#ef4444";
      return `<circle cx="${scaleX(i).toFixed(1)}" cy="${scaleY(r.score).toFixed(1)}" r="3" fill="${color}" stroke="white" stroke-width="1.5">
        <title>${escapeHTML(r.timestamp)}: ${r.score} (${r.passed ? "PASS" : "FAIL"})</title>
      </circle>`;
    })
    .join("\n    ");

  // Y-axis labels
  const yLabels = [0, 25, 50, 75, 100]
    .map((v) => {
      const y = scaleY(v);
      return `
      <text x="${padding.left - 8}" y="${y.toFixed(1)}" text-anchor="end" fill="#666" font-size="11" dominant-baseline="middle">${v}</text>
      <line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${(padding.left + chartW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-dasharray="4,4" />`;
    })
    .join("\n");

  // X-axis labels (show a few timestamps)
  const xLabelCount = Math.min(history.length, 6);
  const xLabels: string[] = [];
  for (let i = 0; i < xLabelCount; i++) {
    const idx = Math.round((i / (xLabelCount - 1 || 1)) * (history.length - 1));
    const x = scaleX(idx);
    const ts = history[idx].timestamp;
    const label = ts.slice(5, 16).replace("T", " "); // MM-DD HH:MM
    xLabels.push(
      `<text x="${x.toFixed(1)}" y="${(height - 8).toFixed(1)}" text-anchor="middle" fill="#666" font-size="10">${escapeHTML(label)}</text>`,
    );
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3" />
        <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.02" />
      </linearGradient>
    </defs>
    ${yLabels}
    <polygon points="${areaPoints}" fill="url(#areaGrad)" />
    <polyline points="${points}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    ${circles}
    ${xLabels.join("\n    ")}
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${(padding.top + chartH).toFixed(1)}" stroke="#d1d5db" />
    <line x1="${padding.left}" y1="${(padding.top + chartH).toFixed(1)}" x2="${(padding.left + chartW).toFixed(1)}" y2="${(padding.top + chartH).toFixed(1)}" stroke="#d1d5db" />
  </svg>`;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function monitorCSS(): string {
  return `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; background: #fafafa; color: #1a1a1a; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 18px; color: #374151; margin-top: 0; }
    h3 { font-size: 15px; color: #6b7280; margin-top: 28px; }
    .stats { display: flex; gap: 16px; flex-wrap: wrap; margin: 16px 0; }
    .stat { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; text-align: center; min-width: 100px; }
    .stat-value { display: block; font-size: 24px; font-weight: 700; color: #1e40af; }
    .stat-label { display: block; font-size: 12px; color: #6b7280; margin-top: 4px; }
    .alert { padding: 12px 16px; border-radius: 6px; margin: 12px 0; font-size: 14px; }
    .alert-danger { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; }
    .alert-ok { background: #f0fdf4; border: 1px solid #86efac; color: #166534; }
    .chart-container { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; font-size: 13px; }
    th { background: #f9fafb; padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 1px solid #e5e7eb; }
    td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }
    tr:last-child td { border-bottom: none; }
    .pass { color: #16a34a; font-weight: 600; }
    .fail { color: #dc2626; font-weight: 600; }
    .footer { margin-top: 24px; font-size: 11px; color: #9ca3af; text-align: center; }`;
}

function buildHTML(title: string, body: string, css: string): string {
  const generatedAt = new Date().toISOString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHTML(title)}</title>
  <style>${css}</style>
</head>
<body>
  <h1>Inspect Monitor</h1>
  ${body}
  <div class="footer">Generated by Inspect at ${escapeHTML(generatedAt)}</div>
</body>
</html>`;
}
