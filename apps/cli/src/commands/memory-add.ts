import type { Command } from "commander";
import chalk from "chalk";

export interface MemoryAddOptions {
  category: string;
  content: string;
  tags?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runMemoryAdd(options: MemoryAddOptions): Promise<void> {
  if (!options.category) {
    console.error(chalk.red("Error: Category is required. Use --category <cat>"));
    process.exit(EXIT_CODES.ERROR);
  }

  if (!options.content) {
    console.error(chalk.red("Error: Content is required. Use --content <text>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Memory Add\n"));
  console.log(chalk.dim(`Category: ${options.category}`));

  try {
    const tags = options.tags?.split(",").map((tag) => tag.trim()) ?? [];

    const memoryEntry = {
      id: `mem-${Date.now()}`,
      category: options.category,
      content: options.content,
      tags,
      timestamp: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify(memoryEntry, null, 2));
    } else {
      console.log(chalk.green("Memory added successfully!"));
      console.log(chalk.dim(`ID: ${memoryEntry.id}`));
      console.log(chalk.dim(`Tags: ${tags.join(", ") || "none"}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to add memory: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerMemoryAddCommand(program: Command): void {
  program
    .command("memory:add")
    .description("Add agent memory")
    .requiredOption("--category <cat>", "Memory category")
    .requiredOption("--content <text>", "Memory content")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect memory:add --category "ui-patterns" --content "Login button is blue"
  $ inspect memory:add --category "api-errors" --content "Rate limit is 100 req/min" --tags "api,limits"
`,
    )
    .action(async (opts: MemoryAddOptions) => {
      await runMemoryAdd(opts);
    });
}
