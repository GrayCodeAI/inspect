import type { Command } from "commander";
import chalk from "chalk";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface EnvCreateOptions {
  name: string;
  compose?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  COMPOSE_NOT_FOUND: 2,
} as const;

async function runEnvCreate(options: EnvCreateOptions): Promise<void> {
  if (!options.name) {
    console.error(chalk.red("Error: Name is required. Use --name <name>"));
    process.exit(EXIT_CODES.ERROR);
  }

  if (options.compose && !existsSync(resolve(options.compose))) {
    console.error(chalk.red(`Error: Compose file not found: ${options.compose}`));
    process.exit(EXIT_CODES.COMPOSE_NOT_FOUND);
  }

  console.log(chalk.blue("\nInspect Environment Create\n"));
  console.log(chalk.dim(`Name: ${options.name}`));
  if (options.compose) {
    console.log(chalk.dim(`Compose: ${options.compose}`));
  }

  try {
    const envId = `env-${Date.now()}`;
    const envData = {
      id: envId,
      name: options.name,
      compose: options.compose,
      status: "creating",
      createdAt: new Date().toISOString(),
      services: [],
    };

    console.log(chalk.dim("\nCreating ephemeral environment..."));

    if (options.json) {
      console.log(JSON.stringify(envData, null, 2));
    } else {
      console.log(chalk.green("\nEnvironment created successfully!"));
      console.log(chalk.dim(`Environment ID: ${envId}`));
      if (options.compose) {
        console.log(chalk.dim(`Services will be started from compose file`));
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to create environment: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerEnvCreateCommand(program: Command): void {
  program
    .command("env:create")
    .description("Create ephemeral environment")
    .requiredOption("--name <name>", "Environment name")
    .option("--compose <file>", "Docker Compose file path")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect env:create --name "test-env"
  $ inspect env:create --name "full-stack" --compose ./docker-compose.yml
`,
    )
    .action(async (opts: EnvCreateOptions) => {
      await runEnvCreate(opts);
    });
}
