import type {
  TestPlan,
  TestStep,
  A11yReport,
  SecurityReport,
  PerformanceReport,
  ResponsiveReport,
  SEOReport,
  FormTestResult,
  SiteMap,
  TestReport,
  ProgressCallback,
} from "./types.js";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import chalk from "chalk";
import { PALETTE, ICONS } from "../utils/theme.js";

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export interface ReportOptions {
  plan: TestPlan;
  results: TestStep[];
  a11yReports: A11yReport[];
  security?: SecurityReport;
  performance?: PerformanceReport[];
  responsive?: ResponsiveReport;
  seo?: SEOReport;
  siteMap?: SiteMap;
  formResults?: FormTestResult[];
  screenshots: string[];
  startTime: number;
  tokenUsage?: number;
}

export function generateReport(
  plan: TestPlan,
  results: TestStep[],
  a11yReports: A11yReport[],
  screenshots: string[],
  startTime: number,
  onProgress: ProgressCallback,
  options?: Partial<ReportOptions>,
): TestReport {
  const passed = results.filter((s) => s.status === "pass").length;
  const failed = results.filter((s) => s.status === "fail").length;
  const skipped = results.filter((s) => s.status === "skip" || s.status === "pending").length;
  const duration = Date.now() - startTime;

  // Calculate overall score
  const overallScore = calculateOverallScore(
    results,
    a11yReports,
    options?.security,
    options?.performance,
    options?.responsive,
    options?.seo,
  );

  const report: TestReport = {
    url: plan.url,
    title: plan.title,
    plan,
    results,
    a11y: a11yReports,
    security: options?.security,
    performance: options?.performance,
    responsive: options?.responsive,
    seo: options?.seo,
    siteMap: options?.siteMap,
    formResults: options?.formResults,
    summary: { total: results.length, passed, failed, skipped, duration, overallScore },
    screenshots,
    timestamp: new Date().toISOString(),
    cost: options?.tokenUsage
      ? { tokens: options.tokenUsage, estimatedCost: options.tokenUsage * 0.000003 }
      : undefined,
  };

  // Print summary to console
  printConsoleSummary(report, onProgress);

  // Save reports
  const dir = join(process.cwd(), ".inspect", "reports");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const timestamp = Date.now();
  const reportPaths: string[] = [];

  // JSON report
  try {
    const jsonFile = `report-${timestamp}.json`;
    writeFileSync(join(dir, jsonFile), JSON.stringify(report, null, 2));
    reportPaths.push(
      `  ${chalk.hex(PALETTE.dim)("JSON")}  ${chalk.hex(PALETTE.cyan)(`.inspect/reports/${jsonFile}`)}`,
    );
  } catch {
    /* intentionally empty */
  }

  // HTML report
  try {
    const htmlFile = `report-${timestamp}.html`;
    const html = generateHtmlReport(report);
    writeFileSync(join(dir, htmlFile), html);
    reportPaths.push(
      `  ${chalk.hex(PALETTE.dim)("HTML")}  ${chalk.hex(PALETTE.cyan)(`.inspect/reports/${htmlFile}`)}`,
    );
  } catch {
    /* intentionally empty */
  }

  // JUnit XML report
  try {
    const junitFile = `report-${timestamp}.xml`;
    const xml = generateJUnitXml(report);
    writeFileSync(join(dir, junitFile), xml);
    reportPaths.push(
      `  ${chalk.hex(PALETTE.dim)("XML")}   ${chalk.hex(PALETTE.cyan)(`.inspect/reports/${junitFile}`)}`,
    );
  } catch {
    /* intentionally empty */
  }

  if (reportPaths.length > 0) {
    onProgress("done", reportPaths.join("\n"));
  }

  return report;
}

// ---------------------------------------------------------------------------
// Overall score calculation
// ---------------------------------------------------------------------------

function calculateOverallScore(
  results: TestStep[],
  a11y: A11yReport[],
  security?: SecurityReport,
  performance?: PerformanceReport[],
  responsive?: ResponsiveReport,
  seo?: SEOReport,
): number {
  const scores: Array<{ score: number; weight: number }> = [];

  // Test pass rate (weight: 30%)
  const total = results.length;
  const passed = results.filter((s) => s.status === "pass").length;
  if (total > 0) {
    scores.push({ score: (passed / total) * 100, weight: 30 });
  }

  // Accessibility (weight: 20%)
  if (a11y.length > 0) {
    const avgA11y = a11y.reduce((sum, r) => sum + r.score, 0) / a11y.length;
    scores.push({ score: avgA11y, weight: 20 });
  }

  // Security (weight: 15%)
  if (security) {
    scores.push({ score: security.score, weight: 15 });
  }

  // Performance (weight: 15%)
  if (performance && performance.length > 0) {
    const avgPerf = performance.reduce((sum, r) => sum + r.score, 0) / performance.length;
    scores.push({ score: avgPerf, weight: 15 });
  }

  // Responsive (weight: 10%)
  if (responsive) {
    scores.push({ score: responsive.score, weight: 10 });
  }

  // SEO (weight: 10%)
  if (seo) {
    scores.push({ score: seo.score, weight: 10 });
  }

  if (scores.length === 0) return 0;

  // Normalize weights
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  return Math.round(scores.reduce((sum, s) => sum + (s.score * s.weight) / totalWeight, 0));
}

// ---------------------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------------------

function printConsoleSummary(report: TestReport, onProgress: ProgressCallback): void {
  const scoreVal = report.summary.overallScore;
  const scoreColor = scoreVal >= 80 ? PALETTE.green : scoreVal >= 50 ? PALETTE.yellow : PALETTE.red;
  const scoreLabel = scoreVal >= 80 ? "Excellent" : scoreVal >= 50 ? "Fair" : "Needs Work";

  const W = 25;
  const barFilled = Math.min(Math.round(scoreVal / 4), W);
  const bar =
    chalk.hex(scoreColor)("\u2588".repeat(barFilled)) +
    chalk.hex(PALETTE.border)("\u2591".repeat(W - barFilled));

  const bW = 52;
  const top = chalk.hex(PALETTE.subtle)(`\u256d${"\u2500".repeat(bW)}\u256e`);
  const bot = chalk.hex(PALETTE.subtle)(`\u2570${"\u2500".repeat(bW)}\u256f`);
  const mid = chalk.hex(PALETTE.subtle)(`\u251c${"\u2500".repeat(bW)}\u2524`);
  const v = chalk.hex(PALETTE.subtle)("\u2502");

  const pad = (s: string, width: number) => {
    // Pad accounting for ANSI codes (visible length)
    const vis = s.replace(/\x1b\[[0-9;]*m/g, ""); // eslint-disable-line no-control-regex
    return s + " ".repeat(Math.max(0, width - vis.length));
  };

  const row = (content: string) => `${v} ${pad(content, bW - 1)}${v}`;
  const _emptyRow = `${v}${" ".repeat(bW)}${v}`;

  // Build the entire report as one string so the Repl renders it as a single block
  const L: string[] = [];

  L.push(top);
  L.push(row(chalk.hex(PALETTE.brand).bold(`${ICONS.gem} Inspect Test Report`)));
  L.push(mid);

  // Metadata
  L.push(row(`${chalk.hex(PALETTE.dim)("URL")}       ${chalk.hex(PALETTE.cyan)(report.url)}`));
  L.push(
    row(
      `${chalk.hex(PALETTE.dim)("Title")}     ${chalk.hex(PALETTE.text)(report.title.slice(0, 40))}`,
    ),
  );
  L.push(
    row(
      `${chalk.hex(PALETTE.dim)("Duration")}  ${chalk.hex(PALETTE.amber)(`${(report.summary.duration / 1000).toFixed(1)}s`)}`,
    ),
  );
  L.push(
    row(
      `${chalk.hex(PALETTE.dim)("Score")}     ${chalk.hex(scoreColor).bold(`${scoreVal}/100`)} ${chalk.hex(PALETTE.dim)(scoreLabel)}`,
    ),
  );
  L.push(row(`          ${bar}`));

  L.push(mid);

  // Steps
  L.push(row(chalk.hex(PALETTE.text).bold("Steps")));
  for (const step of report.results) {
    if (step.status === "pass") {
      L.push(
        row(`${chalk.hex(PALETTE.green)(ICONS.pass)} ${chalk.hex(PALETTE.text)(step.description)}`),
      );
    } else if (step.status === "fail") {
      L.push(
        row(`${chalk.hex(PALETTE.red)(ICONS.fail)} ${chalk.hex(PALETTE.red)(step.description)}`),
      );
      if (step.error) {
        // Word-wrap error to ~45 chars per line
        const words = step.error.split(" ");
        let line = "";
        for (const word of words) {
          if (line.length + word.length + 1 > 45 && line.length > 0) {
            L.push(row(`  ${chalk.hex(PALETTE.redDim)(line)}`));
            line = word;
          } else {
            line = line ? `${line} ${word}` : word;
          }
        }
        if (line) {
          L.push(row(`  ${chalk.hex(PALETTE.redDim)(`${ICONS.arrow} ${line}`)}`));
        }
      }
    } else {
      L.push(
        row(
          `${chalk.hex(PALETTE.muted)(ICONS.pending)} ${chalk.hex(PALETTE.dim)(step.description)}`,
        ),
      );
    }
  }

  L.push(mid);

  // Quality Scores
  L.push(row(chalk.hex(PALETTE.text).bold("Quality")));

  const addScoreRow = (label: string, labelColor: string, score: number, extra?: string) => {
    const sc = score >= 90 ? PALETTE.green : score >= 70 ? PALETTE.yellow : PALETTE.red;
    const miniBar =
      chalk.hex(sc)("\u2588".repeat(Math.round(score / 10))) +
      chalk.hex(PALETTE.border)("\u2591".repeat(10 - Math.round(score / 10)));
    const extraStr = extra ? chalk.hex(PALETTE.dim)(` ${extra}`) : "";
    L.push(
      row(
        `${chalk.hex(labelColor)(label.padEnd(16))} ${chalk.hex(sc).bold(`${score}`.padStart(3))}/100 ${miniBar}${extraStr}`,
      ),
    );
  };

  const totalA11yIssues = report.a11y.reduce((sum, r) => sum + r.issues.length, 0);
  const avgA11y =
    report.a11y.length > 0
      ? Math.round(report.a11y.reduce((sum, r) => sum + r.score, 0) / report.a11y.length)
      : 100;
  addScoreRow("Accessibility", PALETTE.pink, avgA11y, `${totalA11yIssues} issues`);

  if (report.security) {
    addScoreRow(
      "Security",
      PALETTE.rose,
      report.security.score,
      `${report.security.issues.length} issues`,
    );
  }

  if (report.performance && report.performance.length > 0) {
    const avgPerf = Math.round(
      report.performance.reduce((sum, r) => sum + r.score, 0) / report.performance.length,
    );
    addScoreRow("Performance", PALETTE.sky, avgPerf);
  }

  if (report.responsive) {
    addScoreRow("Responsive", PALETTE.violet, report.responsive.score);
  }

  if (report.seo) {
    addScoreRow("SEO", PALETTE.indigo, report.seo.score, `${report.seo.issues.length} issues`);
  }

  L.push(mid);

  // Summary
  const passed = report.summary.passed;
  const failed = report.summary.failed;
  const total = report.summary.total;
  let summaryParts = `${chalk.hex(PALETTE.green).bold(`${ICONS.pass} ${passed} passed`)}`;
  if (failed > 0)
    summaryParts += `  ${chalk.hex(PALETTE.red).bold(`${ICONS.fail} ${failed} failed`)}`;
  summaryParts += `  ${chalk.hex(PALETTE.dim)(`of ${total} steps`)}`;
  L.push(row(summaryParts));

  if (report.cost) {
    L.push(
      row(
        `${chalk.hex(PALETTE.amber)(`${ICONS.lightning} ${report.cost.tokens.toLocaleString()} tokens`)} ${chalk.hex(PALETTE.dim)(`(~$${report.cost.estimatedCost.toFixed(4)})`)}`,
      ),
    );
  }

  L.push(bot);

  // Send as one block
  onProgress("done", L.join("\n"));
}

// ---------------------------------------------------------------------------
// HTML report generation
// ---------------------------------------------------------------------------

function generateHtmlReport(report: TestReport): string {
  const scoreColor =
    report.summary.overallScore >= 80
      ? "#22c55e"
      : report.summary.overallScore >= 50
        ? "#eab308"
        : "#ef4444";

  const stepRows = report.results
    .map((step) => {
      const statusIcon = step.status === "pass" ? "✓" : step.status === "fail" ? "✗" : "○";
      const statusClass =
        step.status === "pass" ? "pass" : step.status === "fail" ? "fail" : "skip";
      return `<tr class="${statusClass}">
      <td>${step.id}</td>
      <td><span class="status-icon">${statusIcon}</span> ${escapeHtml(step.description)}</td>
      <td>${step.action}</td>
      <td>${step.status}</td>
      <td>${step.duration ? `${step.duration}ms` : "-"}</td>
      <td>${step.error ? `<span class="error">${escapeHtml(step.error)}</span>` : "-"}</td>
    </tr>`;
    })
    .join("\n");

  const a11yRows = report.a11y
    .flatMap((a) => a.issues)
    .slice(0, 50)
    .map(
      (issue) => `
    <tr class="${issue.severity}">
      <td><span class="severity severity-${issue.severity}">${issue.severity}</span></td>
      <td>${escapeHtml(issue.rule)}</td>
      <td>${escapeHtml(issue.description)}</td>
      <td>${issue.wcag ?? "-"}</td>
      <td>${issue.fix ? escapeHtml(issue.fix) : "-"}</td>
    </tr>
  `,
    )
    .join("\n");

  const securityRows = (report.security?.issues ?? [])
    .map(
      (issue) => `
    <tr class="${issue.severity}">
      <td><span class="severity severity-${issue.severity}">${issue.severity}</span></td>
      <td>${escapeHtml(issue.category)}</td>
      <td>${escapeHtml(issue.title)}</td>
      <td>${escapeHtml(issue.description)}</td>
      <td>${issue.fix ? escapeHtml(issue.fix) : "-"}</td>
    </tr>
  `,
    )
    .join("\n");

  const perfSection = (report.performance ?? [])
    .map(
      (p) => `
    <div class="metric-group">
      <h4>${escapeHtml(p.url)}</h4>
      <div class="metrics-grid">
        <div class="metric"><span class="metric-label">LCP</span><span class="metric-value ${p.metrics.lcp <= 2500 ? "good" : p.metrics.lcp <= 4000 ? "needs-improvement" : "poor"}">${p.metrics.lcp}ms</span></div>
        <div class="metric"><span class="metric-label">CLS</span><span class="metric-value ${p.metrics.cls <= 0.1 ? "good" : p.metrics.cls <= 0.25 ? "needs-improvement" : "poor"}">${p.metrics.cls.toFixed(3)}</span></div>
        <div class="metric"><span class="metric-label">FCP</span><span class="metric-value ${p.metrics.fcp <= 1800 ? "good" : p.metrics.fcp <= 3000 ? "needs-improvement" : "poor"}">${p.metrics.fcp}ms</span></div>
        <div class="metric"><span class="metric-label">TTFB</span><span class="metric-value ${p.metrics.ttfb <= 800 ? "good" : p.metrics.ttfb <= 1800 ? "needs-improvement" : "poor"}">${p.metrics.ttfb}ms</span></div>
        <div class="metric"><span class="metric-label">Load</span><span class="metric-value">${p.metrics.fullLoad}ms</span></div>
        <div class="metric"><span class="metric-label">Requests</span><span class="metric-value">${p.resources.totalRequests}</span></div>
      </div>
    </div>
  `,
    )
    .join("\n");

  const screenshotHtml = report.screenshots
    .slice(0, 20)
    .map((s) => {
      try {
        const data = readFileSync(s);
        const base64 = data.toString("base64");
        return `<div class="screenshot"><img src="data:image/png;base64,${base64}" alt="${basename(s)}"><span>${basename(s)}</span></div>`;
      } catch {
        return `<div class="screenshot"><span>${basename(s)} (not found)</span></div>`;
      }
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Inspect Report — ${escapeHtml(report.title)}</title>
<style>
  :root { --bg: #0f172a; --surface: #1e293b; --border: #334155; --text: #e2e8f0; --muted: #94a3b8; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; padding: 2rem; }
  .container { max-width: 1200px; margin: 0 auto; }
  h1, h2, h3 { color: #f8fafc; }
  h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1.3rem; margin: 2rem 0 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  h3 { font-size: 1.1rem; margin: 1rem 0 0.5rem; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; }
  .header-info { flex: 1; }
  .header-info p { color: var(--muted); font-size: 0.9rem; }
  .score-circle { width: 100px; height: 100px; border-radius: 50%; border: 6px solid ${scoreColor}; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 700; color: ${scoreColor}; flex-shrink: 0; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin: 1rem 0; }
  .summary-card { background: var(--surface); border-radius: 8px; padding: 1rem; text-align: center; }
  .summary-card .value { font-size: 1.5rem; font-weight: 700; }
  .summary-card .label { color: var(--muted); font-size: 0.8rem; }
  .summary-card.pass .value { color: #22c55e; }
  .summary-card.fail .value { color: #ef4444; }
  .summary-card.skip .value { color: #64748b; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; background: var(--surface); border-radius: 8px; overflow: hidden; }
  th { background: #0f172a; text-align: left; padding: 0.75rem; font-size: 0.8rem; text-transform: uppercase; color: var(--muted); }
  td { padding: 0.75rem; border-top: 1px solid var(--border); font-size: 0.9rem; }
  tr.pass td:first-child { border-left: 3px solid #22c55e; }
  tr.fail td:first-child { border-left: 3px solid #ef4444; }
  tr.skip td:first-child { border-left: 3px solid #64748b; }
  .status-icon { font-weight: 700; }
  tr.pass .status-icon { color: #22c55e; }
  tr.fail .status-icon { color: #ef4444; }
  .error { color: #ef4444; font-size: 0.85rem; }
  .severity { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
  .severity-critical { background: #7f1d1d; color: #fca5a5; }
  .severity-serious, .severity-high { background: #78350f; color: #fbbf24; }
  .severity-moderate, .severity-medium { background: #1e3a5f; color: #93c5fd; }
  .severity-minor, .severity-low, .severity-info { background: #1e293b; color: #94a3b8; }
  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.5rem; }
  .metric { background: var(--surface); padding: 0.75rem; border-radius: 6px; text-align: center; }
  .metric-label { display: block; color: var(--muted); font-size: 0.75rem; text-transform: uppercase; }
  .metric-value { display: block; font-size: 1.2rem; font-weight: 700; margin-top: 0.25rem; }
  .metric-value.good { color: #22c55e; }
  .metric-value.needs-improvement { color: #eab308; }
  .metric-value.poor { color: #ef4444; }
  .screenshots { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
  .screenshot { background: var(--surface); border-radius: 8px; overflow: hidden; }
  .screenshot img { width: 100%; height: auto; }
  .screenshot span { display: block; padding: 0.5rem; color: var(--muted); font-size: 0.8rem; text-align: center; }
  .footer { margin-top: 3rem; text-align: center; color: var(--muted); font-size: 0.8rem; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="header-info">
      <h1>Inspect Test Report</h1>
      <p>${escapeHtml(report.url)}</p>
      <p>${escapeHtml(report.title)} &mdash; ${report.timestamp}</p>
      <p>Duration: ${(report.summary.duration / 1000).toFixed(1)}s${report.cost ? ` &mdash; ${report.cost.tokens.toLocaleString()} tokens (~$${report.cost.estimatedCost.toFixed(4)})` : ""}</p>
    </div>
    <div class="score-circle">${report.summary.overallScore}</div>
  </div>

  <div class="summary-grid">
    <div class="summary-card pass"><div class="value">${report.summary.passed}</div><div class="label">Passed</div></div>
    <div class="summary-card fail"><div class="value">${report.summary.failed}</div><div class="label">Failed</div></div>
    <div class="summary-card skip"><div class="value">${report.summary.skipped}</div><div class="label">Skipped</div></div>
    <div class="summary-card"><div class="value">${report.a11y.length > 0 ? Math.round(report.a11y.reduce((s, r) => s + r.score, 0) / report.a11y.length) : "-"}</div><div class="label">Accessibility</div></div>
    <div class="summary-card"><div class="value">${report.security?.score ?? "-"}</div><div class="label">Security</div></div>
    <div class="summary-card"><div class="value">${report.responsive?.score ?? "-"}</div><div class="label">Responsive</div></div>
    <div class="summary-card"><div class="value">${report.seo?.score ?? "-"}</div><div class="label">SEO</div></div>
  </div>

  <h2>Test Steps (${report.results.length})</h2>
  <table>
    <thead><tr><th>#</th><th>Description</th><th>Action</th><th>Status</th><th>Duration</th><th>Error</th></tr></thead>
    <tbody>${stepRows}</tbody>
  </table>

  ${
    a11yRows
      ? `<h2>Accessibility Issues (${report.a11y.reduce((s, r) => s + r.issues.length, 0)})</h2>
  <table>
    <thead><tr><th>Severity</th><th>Rule</th><th>Description</th><th>WCAG</th><th>Fix</th></tr></thead>
    <tbody>${a11yRows}</tbody>
  </table>`
      : ""
  }

  ${
    securityRows
      ? `<h2>Security Issues (${report.security?.issues.length ?? 0})</h2>
  <table>
    <thead><tr><th>Severity</th><th>Category</th><th>Title</th><th>Description</th><th>Fix</th></tr></thead>
    <tbody>${securityRows}</tbody>
  </table>`
      : ""
  }

  ${perfSection ? `<h2>Performance</h2>${perfSection}` : ""}

  ${screenshotHtml ? `<h2>Screenshots</h2><div class="screenshots">${screenshotHtml}</div>` : ""}

  <div class="footer">
    Generated by <strong>Inspect</strong> &mdash; AI-Powered Browser Testing Platform
  </div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// JUnit XML generation
// ---------------------------------------------------------------------------

function generateJUnitXml(report: TestReport): string {
  const testcases = report.results
    .map((step) => {
      if (step.status === "fail") {
        return `    <testcase name="${escapeXml(step.description)}" classname="inspect" time="${((step.duration ?? 0) / 1000).toFixed(3)}">
      <failure message="${escapeXml(step.error ?? "Test failed")}" type="AssertionError">${escapeXml(step.error ?? "")}</failure>
    </testcase>`;
      }
      if (step.status === "skip" || step.status === "pending") {
        return `    <testcase name="${escapeXml(step.description)}" classname="inspect" time="0">
      <skipped/>
    </testcase>`;
      }
      return `    <testcase name="${escapeXml(step.description)}" classname="inspect" time="${((step.duration ?? 0) / 1000).toFixed(3)}"/>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Inspect: ${escapeXml(report.url)}" tests="${report.summary.total}" failures="${report.summary.failed}" skipped="${report.summary.skipped}" time="${(report.summary.duration / 1000).toFixed(3)}" timestamp="${report.timestamp}">
${testcases}
  </testsuite>
</testsuites>`;
}

// ---------------------------------------------------------------------------
// GitHub annotations format
// ---------------------------------------------------------------------------

export function generateGitHubAnnotations(report: TestReport): string {
  const annotations: string[] = [];

  for (const step of report.results) {
    if (step.status === "fail") {
      annotations.push(
        `::error title=Test Failed: ${step.description}::${step.error ?? "Test step failed"}`,
      );
    }
  }

  for (const a11yReport of report.a11y) {
    for (const issue of a11yReport.issues.filter(
      (i) => i.severity === "critical" || i.severity === "serious",
    )) {
      annotations.push(
        `::warning title=A11y: ${issue.rule}::${issue.description}${issue.wcag ? ` (WCAG ${issue.wcag})` : ""}`,
      );
    }
  }

  if (report.security) {
    for (const issue of report.security.issues.filter(
      (i) => i.severity === "critical" || i.severity === "high",
    )) {
      annotations.push(`::error title=Security: ${issue.title}::${issue.description}`);
    }
  }

  return annotations.join("\n");
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
