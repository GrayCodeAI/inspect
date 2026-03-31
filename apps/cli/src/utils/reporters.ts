import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface TestStepResult {
  action: string;
  result: "pass" | "fail" | "info" | "skip";
  evidence?: string;
  duration?: number;
  error?: string;
}

export interface TestRunResult {
  instruction: string;
  agent: string;
  device: string;
  mode: string;
  browser: string;
  url?: string;
  status: "pass" | "fail";
  steps: TestStepResult[];
  summary: string;
  duration: number;
  tokens: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  timestamp: string;
}

export type ReporterType = "list" | "dot" | "json" | "junit" | "html" | "markdown" | "github";

/**
 * Format test results using the specified reporter.
 */
export function formatResults(result: TestRunResult, reporter: ReporterType): string {
  switch (reporter) {
    case "list": return formatList(result);
    case "dot": return formatDot(result);
    case "json": return formatJSON(result);
    case "junit": return formatJUnit(result);
    case "html": return formatHTML(result);
    case "markdown": return formatMarkdown(result);
    case "github": return formatGitHubAnnotations(result);
    default: return formatList(result);
  }
}

/**
 * Write results to a file using the appropriate reporter format.
 */
export function writeReport(result: TestRunResult, reporter: ReporterType, outputPath?: string): string {
  const content = formatResults(result, reporter);

  const extensions: Record<ReporterType, string> = {
    list: "txt", dot: "txt", json: "json", junit: "xml",
    html: "html", markdown: "md", github: "txt",
  };

  const dir = outputPath ?? join(process.cwd(), ".inspect", "reports");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `report-${timestamp}.${extensions[reporter]}`;
  const filepath = join(dir, filename);

  writeFileSync(filepath, content, "utf-8");
  return filepath;
}

// ── List reporter (default — verbose) ──────────────────────────────────

function formatList(result: TestRunResult): string {
  const lines: string[] = [];
  const icon = result.status === "pass" ? "PASS" : "FAIL";

  lines.push(`${icon} ${result.instruction}`);
  lines.push(`  Agent: ${result.agent} | Device: ${result.device} | Duration: ${formatMs(result.duration)}`);
  lines.push("");

  for (const step of result.steps) {
    const sIcon = step.result === "pass" ? "  ✓" : step.result === "fail" ? "  ✗" : "  ●";
    lines.push(`${sIcon} ${step.action}`);
    if (step.evidence) lines.push(`    ${step.evidence}`);
    if (step.error) lines.push(`    Error: ${step.error}`);
  }

  lines.push("");
  lines.push(`Summary: ${result.summary}`);
  const passed = result.steps.filter(s => s.result === "pass").length;
  const failed = result.steps.filter(s => s.result === "fail").length;
  lines.push(`${passed} passed, ${failed} failed, ${result.steps.length} total (${formatMs(result.duration)})`);

  return lines.join("\n");
}

// ── Dot reporter (compact — one char per step) ────────────────────────

function formatDot(result: TestRunResult): string {
  const dots = result.steps.map(s =>
    s.result === "pass" ? "." : s.result === "fail" ? "F" : "?"
  ).join("");

  const passed = result.steps.filter(s => s.result === "pass").length;
  const failed = result.steps.filter(s => s.result === "fail").length;

  const lines = [dots, ""];

  // Show failures
  const failures = result.steps.filter(s => s.result === "fail");
  if (failures.length > 0) {
    lines.push("Failures:");
    for (const f of failures) {
      lines.push(`  ✗ ${f.action}`);
      if (f.error) lines.push(`    ${f.error}`);
    }
    lines.push("");
  }

  lines.push(`${passed} passed, ${failed} failed (${formatMs(result.duration)})`);
  return lines.join("\n");
}

// ── JSON reporter ──────────────────────────────────────────────────────

function formatJSON(result: TestRunResult): string {
  return JSON.stringify({
    version: "0.1.0",
    ...result,
  }, null, 2);
}

// ── JUnit XML reporter ─────────────────────────────────────────────────

function formatJUnit(result: TestRunResult): string {
  const _passed = result.steps.filter(s => s.result === "pass").length;
  const failed = result.steps.filter(s => s.result === "fail").length;
  const skipped = result.steps.filter(s => s.result === "skip" || s.result === "info").length;

  const escapeXml = (s: string) => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<testsuites name="inspect" tests="${result.steps.length}" failures="${failed}" time="${(result.duration / 1000).toFixed(3)}">`);
  lines.push(`  <testsuite name="${escapeXml(result.instruction)}" tests="${result.steps.length}" failures="${failed}" skipped="${skipped}" time="${(result.duration / 1000).toFixed(3)}" timestamp="${result.timestamp}">`);
  lines.push(`    <properties>`);
  lines.push(`      <property name="agent" value="${escapeXml(result.agent)}" />`);
  lines.push(`      <property name="device" value="${escapeXml(result.device)}" />`);
  lines.push(`      <property name="mode" value="${escapeXml(result.mode)}" />`);
  lines.push(`      <property name="browser" value="${escapeXml(result.browser)}" />`);
  if (result.url) lines.push(`      <property name="url" value="${escapeXml(result.url)}" />`);
  lines.push(`    </properties>`);

  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i];
    const stepTime = step.duration ? (step.duration / 1000).toFixed(3) : "0.000";
    lines.push(`    <testcase name="${escapeXml(step.action)}" classname="inspect.${escapeXml(result.agent)}" time="${stepTime}">`);

    if (step.result === "fail") {
      lines.push(`      <failure message="${escapeXml(step.error ?? "Assertion failed")}" type="AssertionError">${escapeXml(step.evidence ?? "")}</failure>`);
    } else if (step.result === "skip" || step.result === "info") {
      lines.push(`      <skipped />`);
    }

    if (step.evidence) {
      lines.push(`      <system-out>${escapeXml(step.evidence)}</system-out>`);
    }

    lines.push(`    </testcase>`);
  }

  lines.push(`  </testsuite>`);
  lines.push(`</testsuites>`);

  return lines.join("\n");
}

// ── HTML reporter ──────────────────────────────────────────────────────

function formatHTML(result: TestRunResult): string {
  // Delegate to the package reporter for full HTML
  // Simple inline version for CLI
  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const passed = result.steps.filter(s => s.result === "pass").length;
  const _failed = result.steps.filter(s => s.result === "fail").length;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Inspect Report</title>
<style>
body{font-family:system-ui;max-width:800px;margin:2rem auto;padding:0 1rem;color:#333}
h1{color:${result.status === "pass" ? "#16a34a" : "#dc2626"}}
.pass{color:#16a34a}.fail{color:#dc2626}.info{color:#6b7280}
table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left;border-bottom:1px solid #e5e7eb}
th{background:#f9fafb;font-weight:600}.meta{color:#6b7280;font-size:14px}
</style></head><body>
<h1>${result.status === "pass" ? "&#x2705;" : "&#x274C;"} ${escapeHtml(result.instruction)}</h1>
<p class="meta">${escapeHtml(result.agent)} | ${escapeHtml(result.device)} | ${formatMs(result.duration)} | ${passed}/${result.steps.length} passed</p>
<table><tr><th>#</th><th>Step</th><th>Status</th><th>Evidence</th></tr>
${result.steps.map((s, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(s.action)}</td><td class="${s.result}">${s.result.toUpperCase()}</td><td class="meta">${escapeHtml(s.evidence ?? "")}</td></tr>`).join("\n")}
</table>
<p class="meta">Summary: ${escapeHtml(result.summary)}</p>
<p class="meta">Generated by Inspect at ${result.timestamp}</p>
</body></html>`;
}

// ── Markdown reporter ──────────────────────────────────────────────────

function formatMarkdown(result: TestRunResult): string {
  const icon = result.status === "pass" ? "PASS" : "FAIL";
  const passed = result.steps.filter(s => s.result === "pass").length;
  const failed = result.steps.filter(s => s.result === "fail").length;

  const lines: string[] = [];
  lines.push(`## Inspect Test Results: ${icon}`);
  lines.push("");
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| **Instruction** | ${result.instruction} |`);
  lines.push(`| **Agent** | ${result.agent} |`);
  lines.push(`| **Device** | ${result.device} |`);
  lines.push(`| **Duration** | ${formatMs(result.duration)} |`);
  lines.push(`| **Result** | ${passed}/${result.steps.length} passed${failed > 0 ? `, ${failed} failed` : ""} |`);
  lines.push("");
  lines.push("| # | Step | Status |");
  lines.push("|---|------|--------|");

  for (let i = 0; i < result.steps.length; i++) {
    const s = result.steps[i];
    const sIcon = s.result === "pass" ? "PASS" : s.result === "fail" ? "FAIL" : "SKIP";
    lines.push(`| ${i + 1} | ${s.action} | ${sIcon} |`);
    if (s.error) lines.push(`| | _${s.error}_ | |`);
  }

  lines.push("");
  lines.push(`_Generated by [Inspect](https://github.com/nichochar/inspect) at ${result.timestamp}_`);
  return lines.join("\n");
}

// ── GitHub Actions annotations ─────────────────────────────────────────

function formatGitHubAnnotations(result: TestRunResult): string {
  const lines: string[] = [];

  for (const step of result.steps) {
    if (step.result === "fail") {
      // GitHub Actions annotation format
      lines.push(`::error title=Test Failed: ${step.action}::${step.error ?? step.evidence ?? "Assertion failed"}`);
    } else if (step.result === "pass") {
      lines.push(`::notice title=Test Passed: ${step.action}::${step.evidence ?? "OK"}`);
    }
  }

  // Summary annotation
  const passed = result.steps.filter(s => s.result === "pass").length;
  const failed = result.steps.filter(s => s.result === "fail").length;

  if (failed > 0) {
    lines.push(`::error title=Inspect: ${failed} test(s) failed::${result.summary}`);
  } else {
    lines.push(`::notice title=Inspect: All ${passed} test(s) passed::${result.summary}`);
  }

  return lines.join("\n");
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}
