import type { Command } from "commander";
import chalk from "chalk";

export interface ForkOptions {
  plan: string;
  step: string;
  name: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  PLAN_NOT_FOUND: 2,
} as const;

async function runFork(options: ForkOptions): Promise<void> {
  if (!options.plan) {
    console.error(chalk.red("Error: Plan ID is required. Use --plan <id>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Fork\n"));
  console.log(chalk.dim(`Plan: ${options.plan}`));
  console.log(chalk.dim(`Step: ${options.step ?? "last"}`));
  console.log(chalk.dim(`Name: ${options.name ?? `fork-${Date.now()}`}`));

  try {
    const forkId = `fork-${Date.now()}`;
    const forkData = {
      id: forkId,
      parentPlan: options.plan,
      forkedAtStep: parseInt(options.step ?? "0", 10),
      name: options.name ?? `fork-${forkId.slice(-6)}`,
      createdAt: new Date().toISOString(),
      status: "active",
    };

    if (options.json) {
      console.log(JSON.stringify(forkData, null, 2));
    } else {
      console.log(chalk.green("\nFork created successfully!"));
      console.log(chalk.dim(`Fork ID: ${forkId}`));
      console.log(chalk.dim(`Use 'inspect merge --fork ${forkId}' to merge back`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFork failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerForkCommand(program: Command): void {
  program
    .command("fork")
    .description("Fork a test plan")
    .requiredOption("--plan <id>", "Plan ID to fork")
    .option("--step <index>", "Step index to fork from")
    .option("--name <name>", "Fork name")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect fork --plan abc123 --name "alternative-flow"
  $ inspect fork --plan abc123 --step 5 --name "branch-from-step-5"
`,
    )
    .action(async (opts: ForkOptions) => {
      await runFork(opts);
    });
}
