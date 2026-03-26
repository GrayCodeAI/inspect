import type { Command } from "commander";
import chalk from "chalk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface LighthouseCliOptions {
  categories?: string;
  budget?: string;
  reporter?: string;
  output?: string;
  device?: string;
}

async function runLighthouse(url: string | undefined, options: LighthouseCliOptions): Promise<void> {
  if (!url) {
    console.error(chalk.red("Error: URL is required for Lighthouse audit."));
    console.log(chalk.dim("Usage: inspect lighthouse <url>"));
    process.exit(1);
  }

  const reporter = options.reporter ?? "cli";
  const device = options.device ?? "mobile";
  const categories = options.categories
    ? options.categories.split(",").map((c) => c.trim())
    : ["performance", "accessibility", "best-practices", "seo"];

  console.log(chalk.blue("\nLighthouse Audit\n"));
  console.log(chalk.dim(`URL: ${url}`));
  console.log(chalk.dim(`Device: ${device}`));
  console.log(chalk.dim(`Categories: ${categories.join(", ")}`));

  try {
    // Load budget file if provided
    let budgets: Array<{ resourceType?: string; metric?: string; budget: number }> | undefined;
    if (options.budget) {
      const budgetPath = resolve(options.budget);
      if (!existsSync(budgetPath)) {
        console.error(chalk.red(`Budget file not found: ${budgetPath}`));
        process.exit(1);
      }
      budgets = JSON.parse(readFileSync(budgetPath, "utf-8"));
      console.log(chalk.dim(`Budget: ${budgets?.length ?? 0} thresholds loaded`));
    }

    // Run Lighthouse audit
    console.log(chalk.dim("\nRunning Lighthouse..."));
    const { LighthouseAuditor } = await import("@inspect/quality");
    const auditor = new LighthouseAuditor();

    const startTime = Date.now();
    const report = await auditor.run(url, {
      device: device as "mobile" | "desktop",
      categories: categories as Array<"performance" | "accessibility" | "best-practices" | "seo" | "pwa">,
      budgets,
    });
    const elapsed = Date.now() - startTime;

    // Display results
    console.log(chalk.dim("\n─────────────────────────────────────────\n"));

    const scores = report.scores ?? {};
    const scoreEntries = Object.entries(scores) as Array<[string, number]>;

    for (const [category, score] of scoreEntries) {
      const numScore = typeof score === "number" ? score : 0;
      const color = numScore >= 90 ? chalk.green : numScore >= 50 ? chalk.yellow : chalk.red;
      const bar = "█".repeat(Math.round(numScore / 5)) + "░".repeat(20 - Math.round(numScore / 5));
      console.log(`  ${category.padEnd(20)} ${color(`${numScore}`).padEnd(15)} ${chalk.dim(bar)}`);
    }

    // Performance metrics
    const metrics = report.metrics;
    if (metrics) {
      console.log(chalk.dim("\n  Key Metrics:"));
      const metricEntries = Object.entries(metrics) as Array<[string, { value: number; displayValue?: string; rating?: string }]>;
      for (const [metric, m] of metricEntries.slice(0, 8)) {
        if (!m || typeof m !== "object") continue;
        const label = metric
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (s) => s.toUpperCase())
          .trim();
        const display = m.displayValue ?? (m.value > 1000 ? `${(m.value / 1000).toFixed(1)}s` : `${Math.round(m.value)}ms`);
        const ratingColor = m.rating === "good" ? chalk.green : m.rating === "average" ? chalk.yellow : chalk.red;
        console.log(`    ${label.padEnd(30)} ${ratingColor(display)}`);
      }
    }

    console.log(chalk.dim(`\n  Completed in ${(elapsed / 1000).toFixed(1)}s\n`));

    // Save report if requested
    if (reporter === "html" || reporter === "json" || options.output) {
      const ext = reporter === "html" ? "html" : "json";
      const outputPath = options.output
        ? resolve(options.output)
        : resolve(`.inspect/lighthouse-report.${ext}`);

      writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf-8");
      console.log(chalk.green(`Report saved to: ${outputPath}`));
    }

    // Exit with failure if any score is below 50
    const hasFailure = scoreEntries.some(([, score]) => typeof score === "number" && score < 50);
    if (hasFailure) {
      process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nError: ${msg}`));
    process.exit(1);
  }
}

export function registerLighthouseCommand(program: Command): void {
  program
    .command("lighthouse")
    .description("Run Lighthouse performance/SEO/PWA audit")
    .argument("[url]", "URL to audit")
    .option("--categories <cats>", "Categories: performance,accessibility,seo,best-practices,pwa")
    .option("--budget <file>", "Performance budget JSON file")
    .option("--reporter <format>", "Report format: cli, html, json", "cli")
    .option("-o, --output <file>", "Output file path")
    .option("--device <device>", "Device: mobile, desktop", "mobile")
    .action(async (url: string | undefined, opts: LighthouseCliOptions) => {
      await runLighthouse(url, opts);
    });
}
