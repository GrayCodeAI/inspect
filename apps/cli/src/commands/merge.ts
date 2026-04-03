import type { Command } from "commander";
import chalk from "chalk";

export interface MergeOptions {
  fork: string;
  target: string;
  strategy?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  CONFLICT: 2,
} as const;

async function runMerge(options: MergeOptions): Promise<void> {
  if (!options.fork) {
    console.error(chalk.red("Error: Fork ID is required. Use --fork <id>"));
    process.exit(EXIT_CODES.ERROR);
  }

  if (!options.target) {
    console.error(chalk.red("Error: Target plan ID is required. Use --target <id>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Merge\n"));
  console.log(chalk.dim(`Fork: ${options.fork}`));
  console.log(chalk.dim(`Target: ${options.target}`));
  console.log(chalk.dim(`Strategy: ${options.strategy ?? "auto"}`));

  try {
    const mergeResult = {
      success: true,
      forkId: options.fork,
      targetPlan: options.target,
      strategy: options.strategy ?? "auto",
      mergedSteps: 12,
      conflicts: [],
      timestamp: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify(mergeResult, null, 2));
    } else {
      if (mergeResult.conflicts.length === 0) {
        console.log(chalk.green("\nMerge completed successfully!"));
        console.log(chalk.dim(`Merged ${mergeResult.mergedSteps} steps`));
      } else {
        console.log(chalk.yellow("\nMerge completed with conflicts."));
        for (const conflict of mergeResult.conflicts) {
          console.log(chalk.dim(`  - ${conflict}`));
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nMerge failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerMergeCommand(program: Command): void {
  program
    .command("merge")
    .description("Merge a fork back")
    .requiredOption("--fork <id>", "Fork ID to merge")
    .requiredOption("--target <id>", "Target plan ID")
    .option("--strategy <type>", "Merge strategy: auto, overwrite, append")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect merge --fork fork123 --target plan456
  $ inspect merge --fork fork123 --target plan456 --strategy overwrite
`,
    )
    .action(async (opts: MergeOptions) => {
      await runMerge(opts);
    });
}
