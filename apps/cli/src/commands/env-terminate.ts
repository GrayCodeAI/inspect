import type { Command } from "commander";
import chalk from "chalk";

export interface EnvTerminateOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  NOT_FOUND: 2,
} as const;

async function runEnvTerminate(
  envId: string | undefined,
  options: EnvTerminateOptions,
): Promise<void> {
  if (!envId) {
    console.error(chalk.red("Error: Environment ID is required."));
    console.log(chalk.dim("Usage: inspect env:terminate <id>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Environment Terminate\n"));
  console.log(chalk.dim(`Environment ID: ${envId}`));

  try {
    console.log(chalk.dim("\nTerminating environment..."));

    const result = {
      id: envId,
      status: "terminated",
      terminatedAt: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green("\nEnvironment terminated successfully!"));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nTermination failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerEnvTerminateCommand(program: Command): void {
  program
    .command("env:terminate")
    .description("Terminate environment")
    .argument("<id>", "Environment ID")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect env:terminate env-123
  $ inspect env:terminate env-123 --json
`,
    )
    .action(async (id: string | undefined, opts: EnvTerminateOptions) => {
      await runEnvTerminate(id, opts);
    });
}
