import type { Command } from "commander";
import chalk from "chalk";

export interface EnvListOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runEnvList(options: EnvListOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Environment List\n"));

  try {
    const environments = [
      {
        id: "env-001",
        name: "test-env",
        status: "running",
        services: 3,
        createdAt: "2025-01-15T08:00:00Z",
        expiresAt: "2025-01-15T10:00:00Z",
      },
      {
        id: "env-002",
        name: "staging-env",
        status: "running",
        services: 5,
        createdAt: "2025-01-15T07:30:00Z",
        expiresAt: "2025-01-15T09:30:00Z",
      },
    ];

    if (options.json) {
      console.log(JSON.stringify({ environments }, null, 2));
    } else {
      console.log(chalk.dim(`${environments.length} environment(s):\n`));
      for (const env of environments) {
        const statusColor = env.status === "running" ? chalk.green : chalk.yellow;
        console.log(`  ${chalk.cyan(env.id)} ${statusColor(`[${env.status}]`)}`);
        console.log(`  Name: ${env.name}`);
        console.log(`  Services: ${chalk.dim(env.services)}`);
        console.log(`  Created: ${chalk.dim(env.createdAt)}`);
        console.log(`  Expires: ${chalk.dim(env.expiresAt)}\n`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to list environments: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerEnvListCommand(program: Command): void {
  program
    .command("env:list")
    .description("List environments")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect env:list
  $ inspect env:list --json
`,
    )
    .action(async (opts: EnvListOptions) => {
      await runEnvList(opts);
    });
}
