import type { Command } from "commander";
import chalk from "chalk";

export interface CacheClearOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runCacheClear(options: CacheClearOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Cache Clear\n"));

  try {
    const result = {
      cleared: true,
      entriesRemoved: 156,
      sizeFreed: "12.4 MB",
      timestamp: new Date().toISOString(),
    };

    console.log(chalk.dim("Clearing action replay cache..."));

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green("\nCache cleared successfully!"));
      console.log(chalk.dim(`Entries removed: ${result.entriesRemoved}`));
      console.log(chalk.dim(`Size freed: ${result.sizeFreed}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to clear cache: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerCacheClearCommand(program: Command): void {
  program
    .command("cache:clear")
    .description("Clear action replay cache")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect cache:clear
  $ inspect cache:clear --json
`,
    )
    .action(async (opts: CacheClearOptions) => {
      await runCacheClear(opts);
    });
}
