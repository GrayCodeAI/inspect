import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execCb);

async function openReport(reportPath?: string): Promise<void> {
  let filePath: string;

  if (reportPath) {
    filePath = resolve(reportPath);
    if (!existsSync(filePath)) {
      console.error(chalk.red(`Report not found: ${filePath}`));
      process.exit(1);
    }
  } else {
    // Find the most recent report in .inspect/reports/
    const reportsDir = join(process.cwd(), ".inspect", "reports");
    if (!existsSync(reportsDir)) {
      console.error(chalk.yellow("No reports found. Run a test first to generate a report."));
      console.error(chalk.dim("  Reports are saved in .inspect/reports/"));
      console.error(chalk.dim('  Run: inspect test -m "test something" to generate one.'));
      process.exit(1);
    }

    // Find HTML reports, sorted by modification time (newest first)
    const files = readdirSync(reportsDir)
      .filter((f) => f.endsWith(".html"))
      .map((f) => ({
        name: f,
        path: join(reportsDir, f),
        mtime: statSync(join(reportsDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
      console.error(chalk.yellow("No HTML reports found in .inspect/reports/"));
      console.error(chalk.dim('  Run: inspect test -m "test something" to generate one.'));
      process.exit(1);
    }

    filePath = files[0].path;
    console.log(chalk.dim(`Opening latest report: ${files[0].name}`));

    if (files.length > 1) {
      console.log(chalk.dim(`  (${files.length} reports available — pass a path to open a specific one)`));
    }
  }

  // Open in default browser
  const platform = process.platform;
  let cmd: string;
  if (platform === "darwin") {
    cmd = `open "${filePath}"`;
  } else if (platform === "win32") {
    cmd = `start "" "${filePath}"`;
  } else {
    // Linux — try xdg-open, then sensible-browser, then common browsers
    cmd = `xdg-open "${filePath}" 2>/dev/null || sensible-browser "${filePath}" 2>/dev/null || google-chrome "${filePath}" 2>/dev/null || firefox "${filePath}"`;
  }

  try {
    await exec(cmd);
    console.log(chalk.green(`\nReport opened in browser: ${filePath}`));
  } catch {
    console.log(chalk.yellow(`Could not auto-open. Open manually:\n  ${filePath}`));
  }
}

export function registerShowReportCommand(program: Command): void {
  program
    .command("show-report")
    .description("Open the latest HTML test report in your browser")
    .argument("[report]", "Path to a specific report file")
    .addHelpText("after", `
Examples:
  $ inspect show-report                          Open the latest report
  $ inspect show-report .inspect/reports/r1.html  Open a specific report
`)
    .action(async (report?: string) => {
      try {
        await openReport(report);
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });
}
