import type { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface A11yOptions {
  standard?: string;
  include?: string;
  exclude?: string;
  reporter?: string;
  output?: string;
  headed?: boolean;
  json?: boolean;
}

async function runA11y(url: string | undefined, options: A11yOptions): Promise<void> {
  if (!url) {
    console.error(chalk.red("Error: URL is required for accessibility audit."));
    console.log(chalk.dim("Usage: inspect a11y <url>"));
    process.exit(1);
  }

  const standard = options.standard ?? "wcag21aa";
  const reporter = options.reporter ?? "cli";

  console.log(chalk.blue("\nAccessibility Audit\n"));
  console.log(chalk.dim(`URL: ${url}`));
  console.log(chalk.dim(`Standard: ${standard}`));

  try {
    // Launch browser
    console.log(chalk.dim("\nLaunching browser..."));
    const { BrowserManager } = await import("@inspect/browser");
    const browserMgr = new BrowserManager();
    await browserMgr.launchBrowser({
      headless: !(options.headed ?? false),
      viewport: { width: 1920, height: 1080 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const page = await browserMgr.newPage();

    console.log(chalk.dim(`Navigating to ${url}...`));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Run accessibility audit
    console.log(chalk.dim("Running axe-core audit..."));
    const { AccessibilityAuditor } = await import("@inspect/quality");
    const auditor = new AccessibilityAuditor();

    // Map CLI standard names to auditor format
    const standardMap: Record<string, string> = {
      "2.0-A": "wcag2a",
      "2.0-AA": "wcag2aa",
      "2.0-AAA": "wcag2aaa",
      "2.1-AA": "wcag21aa",
      "2.2-AA": "wcag22aa",
      wcag2a: "wcag2a",
      wcag2aa: "wcag2aa",
      wcag21aa: "wcag21aa",
      wcag22aa: "wcag22aa",
    };

    const auditOptions: Record<string, unknown> = {
      standard: standardMap[standard] ?? "wcag21aa",
      includePasses: true,
      includeIncomplete: true,
    };

    if (options.include) {
      auditOptions.context = options.include;
    }

    // Cast page to the auditor's PageHandle interface
    const pageHandle = page as unknown as Parameters<typeof auditor.audit>[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await auditor.audit(pageHandle, auditOptions as any);

    // Display results
    const violations = report.violations ?? [];
    const passes = report.passes ?? [];
    const incomplete = report.incomplete ?? [];

    if (options.json) {
      process.stdout.write(
        JSON.stringify({ score: report.score ?? null, violations, passes, incomplete }, null, 2) +
          "\n",
      );
      await browserMgr.closeBrowser();
      return;
    }

    console.log(chalk.dim("\n─────────────────────────────────────────"));
    console.log(chalk.bold(`\nAccessibility Score: ${report.score ?? "N/A"}/100\n`));

    if (violations.length > 0) {
      console.log(chalk.red(`  ${violations.length} Violations\n`));
      for (const v of violations.slice(0, 20)) {
        const impact =
          v.impact === "critical"
            ? chalk.red(v.impact)
            : v.impact === "serious"
              ? chalk.yellow(v.impact)
              : chalk.dim(v.impact ?? "minor");
        console.log(`  ${impact.padEnd(20)} ${v.id ?? "unknown"}`);
        if (v.description)
          console.log(chalk.dim(`  ${"".padEnd(12)} ${v.description.slice(0, 100)}`));
        if (v.nodes && v.nodes.length > 0) {
          console.log(
            chalk.dim(
              `  ${"".padEnd(12)} Affected: ${v.nodes.length} element${v.nodes.length !== 1 ? "s" : ""}`,
            ),
          );
        }
      }
      if (violations.length > 20) {
        console.log(chalk.dim(`\n  ... and ${violations.length - 20} more violations`));
      }
    } else {
      console.log(chalk.green("  No violations found!"));
    }

    console.log(chalk.dim(`\n  ${passes.length} rules passed`));
    if (incomplete.length > 0) {
      console.log(chalk.yellow(`  ${incomplete.length} rules need review`));
    }

    // Generate report file if requested
    if (reporter === "html" || reporter === "json" || options.output) {
      const outputPath = options.output
        ? resolve(options.output)
        : resolve(`.inspect/a11y-report.${reporter === "html" ? "html" : "json"}`);

      if (reporter === "json") {
        writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf-8");
      } else {
        const reportData = JSON.stringify(report, null, 2);

        const html = `<!DOCTYPE html>
<html><head><title>A11y Report - ${url}</title>
<style>body{font-family:system-ui;max-width:900px;margin:2rem auto;padding:0 1rem}
.violation{border-left:3px solid #e53e3e;padding:0.5rem 1rem;margin:0.5rem 0;background:#fff5f5}
.pass{border-left:3px solid #38a169;padding:0.5rem 1rem;margin:0.5rem 0;background:#f0fff4}
h1{color:#1a202c}h2{color:#4a5568}.score{font-size:2rem;font-weight:bold}</style></head>
<body><h1>Accessibility Report</h1>
<p>URL: ${url} | Standard: ${standard}</p>
<p class="score">Score: ${report.score ?? "N/A"}/100</p>
<h2>Violations (${violations.length})</h2>
${violations
  .map((v) => {
    const id = v.id ?? "unknown";
    const impact = v.impact ?? "minor";
    const description = v.description ?? "";
    return `<div class="violation"><strong>${id}</strong> (${impact})<br>${description}</div>`;
  })
  .join("\n")}
<h2>Passed (${passes.length})</h2>
<pre>${reportData}</pre>
</body></html>`;

        writeFileSync(outputPath, html, "utf-8");
      }
      console.log(chalk.green(`\nReport saved to: ${outputPath}`));
    }

    console.log();
    await browserMgr.closeBrowser();

    if (violations.length > 0) {
      process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nError: ${msg}`));
    process.exit(1);
  }
}

export function registerA11yCommand(program: Command): void {
  program
    .command("a11y")
    .description("Run accessibility audit (WCAG 2.0/2.1/2.2)")
    .argument("[url]", "URL to audit")
    .option("--standard <standard>", "WCAG standard: 2.0-A, 2.0-AA, 2.1-AA, 2.2-AA", "2.1-AA")
    .option("--include <selectors>", "CSS selectors to include")
    .option("--exclude <selectors>", "CSS selectors to exclude")
    .option("--reporter <format>", "Report format: cli, html, json", "cli")
    .option("-o, --output <file>", "Output file path")
    .option("--headed", "Run browser in headed mode")
    .option("--json", "Output as JSON")
    .action(async (url: string | undefined, opts: A11yOptions) => {
      await runA11y(url, opts);
    });
}
