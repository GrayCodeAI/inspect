import type { Command } from "commander";
import chalk from "chalk";

export interface ChainListOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runChainList(options: ChainListOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Chain List\n"));

  try {
    const chains = [
      {
        id: "chain-001",
        name: "e2e-checkout",
        description: "Complete checkout flow",
        status: "active",
        stepCount: 8,
        lastRun: "2025-01-15T09:30:00Z",
      },
      {
        id: "chain-002",
        name: "user-onboarding",
        description: "New user onboarding",
        status: "active",
        stepCount: 12,
        lastRun: "2025-01-14T16:45:00Z",
      },
      {
        id: "chain-003",
        name: "api-validation",
        description: "API endpoint validation",
        status: "draft",
        stepCount: 5,
        lastRun: null,
      },
    ];

    if (options.json) {
      console.log(JSON.stringify({ chains }, null, 2));
    } else {
      console.log(chalk.dim(`${chains.length} chain(s) found:\n`));
      for (const chain of chains) {
        const statusColor = chain.status === "active" ? chalk.green : chalk.yellow;
        console.log(`  ${chalk.cyan(chain.id)} ${statusColor(`[${chain.status}]`)}`);
        console.log(`  Name: ${chain.name}`);
        if (chain.description) {
          console.log(`  Description: ${chalk.dim(chain.description)}`);
        }
        console.log(`  Steps: ${chain.stepCount}`);
        if (chain.lastRun) {
          console.log(`  Last run: ${chalk.dim(chain.lastRun)}`);
        }
        console.log();
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to list chains: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerChainListCommand(program: Command): void {
  program
    .command("chain:list")
    .description("List all chains")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect chain:list
  $ inspect chain:list --json
`,
    )
    .action(async (opts: ChainListOptions) => {
      await runChainList(opts);
    });
}
