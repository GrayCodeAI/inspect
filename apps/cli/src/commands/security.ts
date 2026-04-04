import type { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface SecurityOptions {
  scanner?: string;
  templates?: string;
  severity?: string;
  output?: string;
  rateLimit?: string;
  reporter?: string;
  json?: boolean;
}

async function runSecurity(url: string | undefined, options: SecurityOptions): Promise<void> {
  if (!url) {
    console.error(chalk.red("Error: URL is required for security scan."));
    console.log(chalk.dim("Usage: inspect security <url>"));
    process.exit(1);
  }

  const scanner = options.scanner ?? "nuclei";
  const severity = options.severity ?? "medium";
  const rateLimit = parseInt(options.rateLimit ?? "100", 10);
  const reporter = options.reporter ?? "cli";

  console.log(chalk.blue("\nSecurity Scan\n"));
  console.log(chalk.dim(`URL: ${url}`));
  console.log(chalk.dim(`Scanner: ${scanner}`));
  console.log(chalk.dim(`Min severity: ${severity}`));

  const allFindings: Array<{ severity: string; title: string; description: string; url?: string }> =
    [];

  try {
    const startTime = Date.now();

    // Run Nuclei scanner
    if (scanner === "nuclei" || scanner === "both") {
      console.log(chalk.dim("\nRunning Nuclei scanner..."));
      const { NucleiScanner } = await import("@inspect/quality");
      const nuclei = new NucleiScanner();

      const severityLevels = ["informational", "low", "medium", "high", "critical"];
      const severityInput = severity === "info" ? "informational" : severity;
      const minIndex = severityLevels.indexOf(severityInput);
      const activeSeverities = severityLevels.slice(minIndex >= 0 ? minIndex : 2);

      const nucleiReport = await nuclei.scan(url, {
        severity: activeSeverities as Array<
          "informational" | "low" | "medium" | "high" | "critical"
        >,
        rateLimit,
        templateDir: options.templates,
      });

      const alerts = nucleiReport.alerts ?? [];
      for (const a of alerts) {
        allFindings.push({
          severity: a.risk ?? "informational",
          title: a.name ?? "Unknown",
          description: a.description ?? "",
          url: a.url ?? url,
        });
      }
      console.log(chalk.dim(`  Nuclei: ${alerts.length} findings`));
    }

    // Run ZAP scanner
    if (scanner === "zap" || scanner === "both") {
      console.log(chalk.dim("\nRunning ZAP scanner..."));
      const { ZAPScanner } = await import("@inspect/quality");

      const zapUrl = process.env.ZAP_API_URL ?? "http://localhost:8080";
      const zapKey = process.env.ZAP_API_KEY ?? "";

      const zap = new ZAPScanner({ apiUrl: zapUrl, apiKey: zapKey });
      const zapReport = await zap.scan(url, {
        activeScan: true,
        spider: true,
        spiderMaxDepth: 3,
        onProgress: (phase: string, progress: number) => {
          process.stdout.write(chalk.dim(`  ZAP [${phase}]: ${progress}%\r`));
        },
      });

      const zapAlerts = zapReport.alerts ?? [];
      for (const a of zapAlerts) {
        allFindings.push({
          severity: a.risk ?? "informational",
          title: a.name ?? "Unknown",
          description: a.description ?? "",
          url: a.url ?? url,
        });
      }
      console.log(chalk.dim(`  ZAP: ${zapAlerts.length} findings`));
    }

    const elapsed = Date.now() - startTime;

    if (options.json) {
      const data = {
        url,
        scanner,
        severity,
        elapsed,
        summary: {
          critical: allFindings.filter((f) => f.severity === "critical").length,
          high: allFindings.filter((f) => f.severity === "high").length,
          medium: allFindings.filter((f) => f.severity === "medium").length,
          low: allFindings.filter((f) => f.severity === "low").length,
          informational: allFindings.filter((f) => f.severity === "informational").length,
          total: allFindings.length,
        },
        findings: allFindings,
      };
      process.stdout.write(JSON.stringify(data, null, 2) + "\n");
      return;
    }

    // Display results
    console.log(chalk.dim("\n─────────────────────────────────────────\n"));

    // Sort by severity
    const severityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      informational: 4,
    };
    allFindings.sort((a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5));

    const bySeverity = {
      critical: allFindings.filter((f) => f.severity === "critical"),
      high: allFindings.filter((f) => f.severity === "high"),
      medium: allFindings.filter((f) => f.severity === "medium"),
      low: allFindings.filter((f) => f.severity === "low"),
      informational: allFindings.filter((f) => f.severity === "informational"),
    };

    console.log(chalk.bold("Security Scan Results:\n"));
    console.log(`  ${chalk.red(`Critical:      ${bySeverity.critical.length}`)}`);
    console.log(`  ${chalk.red(`High:          ${bySeverity.high.length}`)}`);
    console.log(`  ${chalk.yellow(`Medium:        ${bySeverity.medium.length}`)}`);
    console.log(`  ${chalk.dim(`Low:           ${bySeverity.low.length}`)}`);
    console.log(`  ${chalk.dim(`Informational: ${bySeverity.informational.length}`)}`);

    if (allFindings.length > 0) {
      console.log(chalk.dim("\n  Findings:"));
      for (const finding of allFindings.slice(0, 25)) {
        const sevColor =
          finding.severity === "critical" || finding.severity === "high"
            ? chalk.red
            : finding.severity === "medium"
              ? chalk.yellow
              : chalk.dim;
        console.log(`    ${sevColor(finding.severity.padEnd(10))} ${finding.title}`);
        if (finding.description) {
          console.log(chalk.dim(`    ${"".padEnd(10)} ${finding.description.slice(0, 100)}`));
        }
      }
      if (allFindings.length > 25) {
        console.log(chalk.dim(`\n    ... and ${allFindings.length - 25} more findings`));
      }
    }

    console.log(chalk.dim(`\n  Completed in ${(elapsed / 1000).toFixed(1)}s\n`));

    // Save report
    if (reporter !== "cli" || options.output) {
      const outputPath = options.output
        ? resolve(options.output)
        : resolve(`.inspect/security-report.json`);

      const reportData = {
        url,
        scanner,
        severity,
        timestamp: new Date().toISOString(),
        duration: elapsed,
        summary: {
          critical: bySeverity.critical.length,
          high: bySeverity.high.length,
          medium: bySeverity.medium.length,
          low: bySeverity.low.length,
          informational: bySeverity.informational.length,
          total: allFindings.length,
        },
        findings: allFindings,
      };
      writeFileSync(outputPath, JSON.stringify(reportData, null, 2), "utf-8");
      console.log(chalk.green(`Report saved to: ${outputPath}`));
    }

    // Exit with failure if critical or high findings
    if (bySeverity.critical.length > 0 || bySeverity.high.length > 0) {
      process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nError: ${msg}`));
    process.exit(1);
  }
}

export function registerSecurityCommand(program: Command): void {
  program
    .command("security")
    .description("Run security vulnerability scan")
    .argument("[url]", "URL to scan")
    .option("--scanner <scanner>", "Scanner: nuclei, zap, both", "nuclei")
    .option("--templates <path>", "Custom Nuclei template directory")
    .option("--severity <level>", "Minimum severity: info, low, medium, high, critical", "medium")
    .option("--rate-limit <rps>", "Rate limit (requests/second)", "100")
    .option("--reporter <format>", "Report format: cli, json", "cli")
    .option("-o, --output <file>", "Output file path")
    .option("--json", "Output as JSON")
    .action(async (url: string | undefined, opts: SecurityOptions) => {
      await runSecurity(url, opts);
    });
}
