import type { Command } from "commander";
import chalk from "chalk";

export interface MockOptions {
  url: string;
  status: string;
  body?: string;
  method?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runMock(options: MockOptions): Promise<void> {
  if (!options.url) {
    console.error(chalk.red("Error: URL pattern is required. Use --url <pattern>"));
    process.exit(EXIT_CODES.ERROR);
  }

  if (!options.status) {
    console.error(chalk.red("Error: Status code is required. Use --status <code>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Mock\n"));
  console.log(chalk.dim(`URL Pattern: ${options.url}`));
  console.log(chalk.dim(`Status: ${options.status}`));

  try {
    const mockId = `mock-${Date.now()}`;
    const mockData = {
      id: mockId,
      pattern: options.url,
      status: parseInt(options.status, 10),
      method: options.method ?? "GET",
      body: options.body,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify(mockData, null, 2));
    } else {
      console.log(chalk.green("\nMock created!"));
      console.log(chalk.dim(`Mock ID: ${mockId}`));
      console.log(chalk.dim(`Method: ${mockData.method}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to create mock: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerMockCommand(program: Command): void {
  program
    .command("mock")
    .description("Mock network requests")
    .requiredOption("--url <pattern>", "URL pattern to match")
    .requiredOption("--status <code>", "HTTP status code")
    .option("--body <json>", "Response body as JSON")
    .option("--method <method>", "HTTP method", "GET")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect mock --url "**/api/users" --status 200
  $ inspect mock --url "**/api/error" --status 500 --body '{"error":"test"}'
`,
    )
    .action(async (opts: MockOptions) => {
      await runMock(opts);
    });
}
