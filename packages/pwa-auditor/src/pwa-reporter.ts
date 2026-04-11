// ──────────────────────────────────────────────────────────────────────────────
// PWA Reporter Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { AuditReport, CheckResult } from "./pwa-auditor.js";

export class PwaReportOutput extends Schema.Class<PwaReportOutput>("PwaReportOutput")({
  formatted: Schema.String,
  json: Schema.String,
}) {}

export interface PwaReporterService {
  readonly formatReport: (report: AuditReport) => Effect.Effect<PwaReportOutput>;
  readonly formatConsole: (report: AuditReport) => Effect.Effect<string>;
  readonly formatHtml: (report: AuditReport) => Effect.Effect<string>;
}

export class PwaReporter extends ServiceMap.Service<
  PwaReporter,
  PwaReporterService
>()("@inspect/PwaReporter") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const formatCheck = (check: CheckResult): string => {
        const icon = check.passed ? "✓" : "✗";
        const scoreText = check.passed ? "pass" : `fail (${check.score})`;
        return `  ${icon} ${check.name}: ${scoreText} - ${check.details}`;
      };

      const formatConsole = (report: AuditReport) =>
        Effect.sync(() => {
          const lines: string[] = [];
          lines.push(`\n${"=".repeat(50)}`);
          lines.push(`PWA Audit Report: ${report.url}`);
          lines.push(`${"=".repeat(50)}`);
          lines.push(`Score: ${(report.score * 100).toFixed(0)}%`);
          lines.push(`Passed: ${report.passed} | Failed: ${report.failed}`);
          lines.push(`Duration: ${report.duration}ms`);
          lines.push("");

          const categories = new Map<string, CheckResult[]>();
          for (const check of report.checks) {
            const existing = categories.get(check.category) ?? [];
            categories.set(check.category, [...existing, check]);
          }

          for (const [category, checks] of categories) {
            lines.push(`\n${category.toUpperCase()}`);
            for (const check of checks) {
              lines.push(formatCheck(check));
            }
          }

          lines.push(`\n${"=".repeat(50)}`);

          return lines.join("\n");
        }).pipe(Effect.withSpan("PwaReporter.formatConsole"));

      const formatHtml = (report: AuditReport) =>
        Effect.sync(() => {
          const checkRows = report.checks
            .map(
              (check) => `
            <tr class="${check.passed ? "pass" : "fail"}">
              <td>${check.passed ? "✓" : "✗"}</td>
              <td>${check.name}</td>
              <td>${check.category}</td>
              <td>${(check.score * 100).toFixed(0)}%</td>
              <td>${check.details}</td>
            </tr>`,
            )
            .join("");

          return `<!DOCTYPE html>
<html>
<head><title>PWA Audit Report</title></head>
<body>
  <h1>PWA Audit Report</h1>
  <p>URL: ${report.url}</p>
  <p>Score: ${(report.score * 100).toFixed(0)}%</p>
  <table>
    <thead>
      <tr><th>Status</th><th>Check</th><th>Category</th><th>Score</th><th>Details</th></tr>
    </thead>
    <tbody>${checkRows}</tbody>
  </table>
</body>
</html>`;
        }).pipe(Effect.withSpan("PwaReporter.formatHtml"));

      const formatReport = (report: AuditReport) =>
        Effect.gen(function* () {
          const formatted = yield* formatConsole(report);
          const json = JSON.stringify(report, undefined, 2);

          return new PwaReportOutput({ formatted, json });
        }).pipe(Effect.withSpan("PwaReporter.formatReport"));

      return { formatReport, formatConsole, formatHtml } as const;
    }),
  );
}
