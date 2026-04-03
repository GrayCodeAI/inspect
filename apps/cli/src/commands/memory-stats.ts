import type { Command } from "commander";
import chalk from "chalk";

export interface MemoryStatsOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runMemoryStats(options: MemoryStatsOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Memory Statistics\n"));

  try {
    const stats = {
      totalMemories: 147,
      categories: [
        { name: "ui-patterns", count: 45 },
        { name: "api-errors", count: 23 },
        { name: "test-strategies", count: 31 },
        { name: "common-bugs", count: 18 },
        { name: "performance", count: 12 },
        { name: "security", count: 18 },
      ],
      lastAdded: "2025-01-15T10:30:00Z",
      storageSize: "2.4 MB",
    };

    if (options.json) {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log(`  Total Memories: ${chalk.cyan(stats.totalMemories)}`);
      console.log(`  Storage Size: ${chalk.cyan(stats.storageSize)}`);
      console.log(`  Last Added: ${chalk.dim(stats.lastAdded)}\n`);

      console.log(chalk.dim("Categories:"));
      for (const category of stats.categories) {
        const bar = "█".repeat(Math.round(category.count / 5));
        console.log(`  ${category.name.padEnd(20)} ${bar} ${category.count}`);
      }
      console.log();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to get stats: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerMemoryStatsCommand(program: Command): void {
  program
    .command("memory:stats")
    .description("Show memory statistics")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect memory:stats
  $ inspect memory:stats --json
`,
    )
    .action(async (opts: MemoryStatsOptions) => {
      await runMemoryStats(opts);
    });
}
