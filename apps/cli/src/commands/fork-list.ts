import type { Command } from "commander";
import chalk from "chalk";

export interface ForkListOptions {
  plan?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runForkList(options: ForkListOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Fork List\n"));

  if (options.plan) {
    console.log(chalk.dim(`Plan: ${options.plan}\n`));
  }

  try {
    const forks = [
      {
        id: "fork-001",
        name: "alternative-login",
        parentPlan: options.plan ?? "plan-123",
        forkedAtStep: 3,
        status: "active",
        createdAt: "2025-01-14T10:00:00Z",
      },
      {
        id: "fork-002",
        name: "error-handling-branch",
        parentPlan: options.plan ?? "plan-123",
        forkedAtStep: 7,
        status: "merged",
        createdAt: "2025-01-13T15:30:00Z",
      },
    ];

    if (options.json) {
      console.log(JSON.stringify({ forks }, null, 2));
    } else {
      console.log(chalk.dim(`Found ${forks.length} fork(s):\n`));
      for (const fork of forks) {
        const statusColor =
          fork.status === "active"
            ? chalk.green
            : fork.status === "merged"
              ? chalk.blue
              : chalk.yellow;
        console.log(`  ${chalk.cyan(fork.id)} ${statusColor(`[${fork.status}]`)}`);
        console.log(`  Name: ${fork.name}`);
        console.log(`  Forked at step: ${fork.forkedAtStep}`);
        console.log(`  Created: ${chalk.dim(fork.createdAt)}\n`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to list forks: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerForkListCommand(program: Command): void {
  program
    .command("fork:list")
    .description("List forks of a plan")
    .option("--plan <id>", "Filter by parent plan ID")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect fork:list
  $ inspect fork:list --plan abc123
  $ inspect fork:list --json
`,
    )
    .action(async (opts: ForkListOptions) => {
      await runForkList(opts);
    });
}
