import type { Command } from "commander";
import chalk from "chalk";

export interface AuditLighthouseOptions {
  custom?: boolean;
  device?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runAuditLighthouse(
  url: string | undefined,
  options: AuditLighthouseOptions,
): Promise<void> {
  if (!url) {
    console.error(chalk.red("Error: URL is required."));
    console.log(chalk.dim("Usage: inspect audit:lighthouse <url>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Lighthouse Audit\n"));
  console.log(chalk.dim(`URL: ${url}`));
  console.log(chalk.dim(`Custom audits: ${options.custom ? "enabled" : "disabled"}`));

  try {
    const { LighthouseAuditor } = await import("@inspect/quality");
    const auditor = new LighthouseAuditor();

    console.log(chalk.dim("\nRunning Lighthouse audit..."));

    const report = await auditor.run(url, {
      device: (options.device ?? "mobile") as "mobile" | "desktop",
      categories: ["performance", "accessibility", "best-practices", "seo"],
    });

    const scores = report.scores ?? {};

    if (options.json) {
      console.log(JSON.stringify({ url, scores }, null, 2));
    } else {
      console.log(chalk.dim("\nScores:"));
      for (const [category, score] of Object.entries(scores)) {
        const numScore = typeof score === "number" ? score : 0;
        const color = numScore >= 90 ? chalk.green : numScore >= 50 ? chalk.yellow : chalk.red;
        console.log(`  ${category.padEnd(20)} ${color(numScore.toString())}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nAudit failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerAuditLighthouseCommand(program: Command): void {
  program
    .command("audit:lighthouse")
    .description("Run Lighthouse with custom audits")
    .argument("<url>", "URL to audit")
    .option("--custom", "Enable custom audits")
    .option("--device <device>", "Device type: mobile, desktop", "mobile")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect audit:lighthouse https://example.com
  $ inspect audit:lighthouse https://example.com --custom
`,
    )
    .action(async (url: string | undefined, opts: AuditLighthouseOptions) => {
      await runAuditLighthouse(url, opts);
    });
}
