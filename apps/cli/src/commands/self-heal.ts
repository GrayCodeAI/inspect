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
        console.error(chalk.red(`\n✗ Test file not found: ${filePath}`));
        process.exit(1);
      }

      console.log(chalk.blue("\n🔍 Analyzing selectors for self-healing...\n"));
      console.log(chalk.dim(`File: ${filePath}`));

      const content = readFileSync(filePath, "utf-8");

      // Extract CSS selectors (basic regex pattern)
      // eslint-disable-next-line no-useless-escape
      const selectorPattern = /["']([a-zA-Z0-9\-_\[\].#\s:>+~="']+)["']/g;
      const selectors: string[] = [];
      let match;
      while ((match = selectorPattern.exec(content)) !== null) {
        if (match[1].includes("[") || match[1].includes("#") || match[1].includes(".")) {
          selectors.push(match[1]);
        }
      }

      console.log(chalk.green(`\n✓ Found ${selectors.length} potential selectors\n`));

      if (selectors.length > 0) {
        console.log(chalk.bold("Selectors detected:"));
        selectors.slice(0, 10).forEach((sel, i) => {
          console.log(`  ${i + 1}. ${chalk.cyan(sel)}`);
        });
        if (selectors.length > 10) {
          console.log(chalk.dim(`  ... and ${selectors.length - 10} more`));
        }
      }

      console.log(chalk.yellow("\n⚠️  Self-healing integration not yet active"));
      console.log(chalk.dim("Feature implemented in @inspect/self-healing package"));
    });

  healCmd
    .command("snapshot")
    .description("Create element snapshots for selectors")
    .argument("<url>", "URL to snapshot")
    .option("-s, --selectors <selectors...>", "Selectors to snapshot")
    .option("-o, --output <path>", "Output file path")
    .action(async (url, options) => {
      console.log(chalk.blue("\n📸 Creating element snapshots...\n"));
      console.log(chalk.dim(`URL: ${url}`));

      if (options.selectors) {
        console.log(chalk.dim(`Selectors: ${options.selectors.join(", ")}`));
      }

      // TODO: Integrate with @inspect/self-healing
      console.log(chalk.yellow("\n⚠️  Snapshot creation requires browser connection"));
      console.log(chalk.dim("Feature implemented in @inspect/self-healing package"));
    });

  healCmd
    .command("stats")
    .description("Show self-healing statistics")
    .action(async () => {
      console.log(chalk.blue("\n📊 Self-Healing Statistics\n"));

      // TODO: Integrate with @inspect/self-healing
      console.log(chalk.yellow("⚠️  Statistics retrieval not yet integrated"));
      console.log(chalk.dim("Feature implemented in @inspect/self-healing package"));
    });
}
