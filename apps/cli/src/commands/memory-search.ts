import type { Command } from "commander";
import chalk from "chalk";

export interface MemorySearchOptions {
  category?: string;
  limit?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runMemorySearch(
  query: string | undefined,
  options: MemorySearchOptions,
): Promise<void> {
  if (!query) {
    console.error(chalk.red("Error: Query is required."));
    console.log(chalk.dim("Usage: inspect memory:search <query>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Memory Search\n"));
  console.log(chalk.dim(`Query: ${query}`));

  try {
    const limit = parseInt(options.limit ?? "10", 10);

    const results = [
      {
        id: "mem-1",
        category: "ui-patterns",
        content: "Login button uses primary blue color",
        relevance: 0.92,
        timestamp: "2025-01-15T10:30:00Z",
      },
      {
        id: "mem-2",
        category: "ui-patterns",
        content: "Form validation shows inline errors",
        relevance: 0.78,
        timestamp: "2025-01-14T15:22:00Z",
      },
    ];

    if (options.json) {
      console.log(JSON.stringify({ query, results }, null, 2));
    } else {
      console.log(chalk.dim(`\nFound ${results.length} results:\n`));
      for (const result of results.slice(0, limit)) {
        console.log(`  ${chalk.cyan(result.id)} [${chalk.yellow(result.category)}]`);
        console.log(`  ${result.content}`);
        console.log(
          `  ${chalk.dim(`Relevance: ${(result.relevance * 100).toFixed(0)}% | ${result.timestamp}`)}\n`,
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nSearch failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerMemorySearchCommand(program: Command): void {
  program
    .command("memory:search")
    .description("Search agent memories")
    .argument("<query>", "Search query")
    .option("--category <cat>", "Filter by category")
    .option("--limit <n>", "Maximum results", "10")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect memory:search "login button"
  $ inspect memory:search "api error" --category "api-errors"
  $ inspect memory:search "pattern" --limit 20 --json
`,
    )
    .action(async (query: string | undefined, opts: MemorySearchOptions) => {
      await runMemorySearch(query, opts);
    });
}
