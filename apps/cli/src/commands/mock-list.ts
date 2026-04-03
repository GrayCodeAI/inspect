import type { Command } from "commander";
import chalk from "chalk";

export interface MockListOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runMockList(options: MockListOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Mock List\n"));

  try {
    const mocks = [
      {
        id: "mock-001",
        pattern: "**/api/users",
        status: 200,
        method: "GET",
        enabled: true,
      },
      {
        id: "mock-002",
        pattern: "**/api/error",
        status: 500,
        method: "POST",
        enabled: true,
      },
    ];

    if (options.json) {
      console.log(JSON.stringify({ mocks }, null, 2));
    } else {
      console.log(chalk.dim(`${mocks.length} active mock(s):\n`));
      for (const mock of mocks) {
        const statusColor = mock.enabled ? chalk.green : chalk.gray;
        console.log(
          `  ${chalk.cyan(mock.id)} ${statusColor(`[${mock.enabled ? "enabled" : "disabled"}]`)}`,
        );
        console.log(`  Pattern: ${chalk.dim(mock.pattern)}`);
        console.log(`  Method: ${chalk.dim(mock.method)}`);
        console.log(`  Status: ${chalk.dim(mock.status)}\n`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to list mocks: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerMockListCommand(program: Command): void {
  program
    .command("mock:list")
    .description("List active mocks")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect mock:list
  $ inspect mock:list --json
`,
    )
    .action(async (opts: MockListOptions) => {
      await runMockList(opts);
    });
}
