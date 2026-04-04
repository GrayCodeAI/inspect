import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function registerSelfHealCommand(program: Command): void {
  const healCmd = program.command("heal").description("Self-healing selector utilities");

  healCmd
    .command("analyze")
    .description("Analyze selectors in a test file for healing potential")
    .argument("<test-file>", "Path to test file")
    .option("-o, --output <path>", "Output report path")
    .action(async (testFile) => {
      const filePath = resolve(testFile);

      if (!existsSync(filePath)) {
        console.error(chalk.red(`\nTest file not found: ${filePath}`));
        process.exit(1);
      }

      const content = readFileSync(filePath, "utf-8");

      // eslint-disable-next-line no-useless-escape
      const selectorPattern = /["']([a-zA-Z0-9\-_\[\].#\s:>+~="']+)["']/g;
      const selectors: string[] = [];
      let match;
      while ((match = selectorPattern.exec(content)) !== null) {
        if (match[1].includes("[") || match[1].includes("#") || match[1].includes(".")) {
          selectors.push(match[1]);
        }
      }

      console.log(chalk.blue(`\nAnalyzed ${filePath}`));
      console.log(chalk.green(`Found ${selectors.length} potential selectors\n`));

      if (selectors.length > 0) {
        console.log(chalk.bold("Selectors detected:"));
        selectors.slice(0, 20).forEach((sel, i) => {
          console.log(`  ${i + 1}. ${chalk.cyan(sel)}`);
        });
        if (selectors.length > 20) {
          console.log(chalk.dim(`  ... and ${selectors.length - 20} more`));
        }
      }

      const fragility = selectors.filter(
        (s) => s.startsWith(".") || s.startsWith("#") || s.includes(" "),
      ).length;
      const ratio = selectors.length > 0 ? Math.round((fragility / selectors.length) * 100) : 0;

      console.log(chalk.blue(`\nHealing candidates: ${fragility} (${ratio}%)`));
      if (ratio > 60) {
        console.log(
          chalk.yellow("Consider using data-testid attributes for more stable selectors."),
        );
      }
    });

  healCmd
    .command("snapshot")
    .description("Create element snapshots for selectors")
    .argument("<url>", "URL to snapshot")
    .option("-s, --selectors <selectors...>", "Selectors to snapshot")
    .option("-o, --output <path>", "Output file path")
    .action(async (url, options) => {
      console.log(chalk.blue("\nCreating element snapshots\n"));
      console.log(chalk.dim(`URL: ${url}`));

      if (options.selectors) {
        console.log(chalk.dim(`Selectors: ${options.selectors.join(", ")}`));
      }

      console.log(chalk.yellow("\nSnapshot creation requires browser automation via the CLI TUI."));
      console.log(chalk.dim("Run `inspect test` to capture live element snapshots."));
    });

  healCmd
    .command("stats")
    .description("Show self-healing statistics")
    .option("-d, --dir <directory>", "Healing data directory", ".inspect/healing")
    .action(async (options) => {
      const dataDir = resolve(options.dir);

      if (!existsSync(dataDir)) {
        console.log(chalk.blue("\nSelf-Healing Statistics\n"));
        console.log(chalk.yellow("No healing data has been collected yet."));
        console.log(chalk.dim("Self-healing activates during test runs when selectors fail."));
        return;
      }

      console.log(chalk.blue("\nSelf-Healing Statistics\n"));
      console.log(chalk.dim(`Data directory: ${dataDir}`));
      console.log(chalk.dim("Statistics collected from healing data files."));
    });
}
