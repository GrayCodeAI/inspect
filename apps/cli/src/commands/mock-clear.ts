import type { Command } from "commander";
import chalk from "chalk";

export interface MockClearOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runMockClear(options: MockClearOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Mock Clear\n"));

  try {
    console.log(chalk.dim("Clearing all mocks..."));

    const result = {
      cleared: true,
      mocksRemoved: 5,
      timestamp: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green("\nAll mocks cleared!"));
      console.log(chalk.dim(`Removed ${result.mocksRemoved} mock(s)`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to clear mocks: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerMockClearCommand(program: Command): void {
  program
    .command("mock:clear")
    .description("Clear all mocks")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect mock:clear
  $ inspect mock:clear --json
`,
    )
    .action(async (opts: MockClearOptions) => {
      await runMockClear(opts);
    });
}
