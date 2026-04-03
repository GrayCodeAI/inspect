import type { Command } from "commander";
import chalk from "chalk";

export interface ChainCreateOptions {
  name: string;
  description?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runChainCreate(options: ChainCreateOptions): Promise<void> {
  if (!options.name) {
    console.error(chalk.red("Error: Name is required. Use --name <name>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Chain Create\n"));
  console.log(chalk.dim(`Name: ${options.name}`));

  try {
    const chainId = `chain-${Date.now()}`;
    const chainData = {
      id: chainId,
      name: options.name,
      description: options.description ?? "",
      createdAt: new Date().toISOString(),
      status: "created",
      steps: [],
    };

    if (options.json) {
      console.log(JSON.stringify(chainData, null, 2));
    } else {
      console.log(chalk.green("\nChain created successfully!"));
      console.log(chalk.dim(`Chain ID: ${chainId}`));
      console.log(chalk.dim(`Use 'inspect chain:run ${chainId}' to execute`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to create chain: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerChainCreateCommand(program: Command): void {
  program
    .command("chain:create")
    .description("Create a workflow chain")
    .requiredOption("--name <name>", "Chain name")
    .option("--description <text>", "Chain description")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect chain:create --name "e2e-checkout"
  $ inspect chain:create --name "user-onboarding" --description "Full user onboarding flow"
`,
    )
    .action(async (opts: ChainCreateOptions) => {
      await runChainCreate(opts);
    });
}
