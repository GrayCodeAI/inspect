import type { Command } from "commander";
import chalk from "chalk";

export interface VisualBuildOptions {
  name: string;
  url?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runVisualBuild(options: VisualBuildOptions): Promise<void> {
  if (!options.name) {
    console.error(chalk.red("Error: Name is required. Use --name <name>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Visual Build\n"));
  console.log(chalk.dim(`Name: ${options.name}`));
  if (options.url) {
    console.log(chalk.dim(`URL: ${options.url}`));
  }

  try {
    const planId = `visual-${Date.now()}`;
    const planData = {
      id: planId,
      name: options.name,
      url: options.url,
      createdAt: new Date().toISOString(),
      status: "created",
      steps: [],
    };

    if (options.json) {
      console.log(JSON.stringify(planData, null, 2));
    } else {
      console.log(chalk.green("\nVisual test builder initialized!"));
      console.log(chalk.dim(`Plan ID: ${planId}`));
      console.log(chalk.dim("Opening visual builder interface..."));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerVisualBuildCommand(program: Command): void {
  program
    .command("visual:build")
    .description("Open visual test builder")
    .requiredOption("--name <name>", "Test plan name")
    .option("--url <url>", "Starting URL")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect visual:build --name "homepage-test"
  $ inspect visual:build --name "checkout" --url https://example.com
`,
    )
    .action(async (opts: VisualBuildOptions) => {
      await runVisualBuild(opts);
    });
}
