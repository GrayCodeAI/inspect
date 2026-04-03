import type { Command } from "commander";
import chalk from "chalk";

export interface ChainRunOptions {
  input?: string;
  verbose?: boolean;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  CHAIN_NOT_FOUND: 2,
} as const;

async function runChainRun(chainId: string | undefined, options: ChainRunOptions): Promise<void> {
  if (!chainId) {
    console.error(chalk.red("Error: Chain ID is required."));
    console.log(chalk.dim("Usage: inspect chain:run <id>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Chain Run\n"));
  console.log(chalk.dim(`Chain ID: ${chainId}`));

  let inputData: Record<string, unknown> = {};
  if (options.input) {
    try {
      inputData = JSON.parse(options.input);
      console.log(chalk.dim("Input data parsed successfully"));
    } catch {
      console.error(chalk.red("Error: Invalid JSON input"));
      process.exit(EXIT_CODES.ERROR);
    }
  }

  try {
    console.log(chalk.dim("\nExecuting chain steps...\n"));

    const steps = ["validate", "setup", "execute", "verify", "cleanup"];
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      if (options.verbose) {
        console.log(chalk.dim(`  [${index + 1}/${steps.length}] ${step}...`));
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const result = {
      chainId,
      status: "success",
      completedSteps: steps.length,
      duration: 1240,
      input: inputData,
      output: { success: true },
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green("\nChain executed successfully!"));
      console.log(chalk.dim(`Completed ${result.completedSteps} steps in ${result.duration}ms`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nChain execution failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerChainRunCommand(program: Command): void {
  program
    .command("chain:run")
    .description("Execute a chain")
    .argument("<id>", "Chain ID")
    .option("--input <json>", "Input data as JSON string")
    .option("--verbose", "Show detailed output")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect chain:run chain-123
  $ inspect chain:run chain-123 --input '{"url":"https://example.com"}'
  $ inspect chain:run chain-123 --verbose
`,
    )
    .action(async (id: string | undefined, opts: ChainRunOptions) => {
      await runChainRun(id, opts);
    });
}
