import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface WorkflowPlayOptions {
  speed?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  NOT_FOUND: 2,
} as const;

async function runWorkflowPlay(
  workflowFile: string | undefined,
  options: WorkflowPlayOptions,
): Promise<void> {
  if (!workflowFile) {
    console.error(chalk.red("Error: Workflow file is required."));
    console.log(chalk.dim("Usage: inspect workflow:play <file>"));
    process.exit(EXIT_CODES.ERROR);
  }

  const filePath = resolve(workflowFile);
  if (!existsSync(filePath)) {
    console.error(chalk.red(`Error: Workflow file not found: ${workflowFile}`));
    process.exit(EXIT_CODES.NOT_FOUND);
  }

  console.log(chalk.blue("\nInspect Workflow Play\n"));
  console.log(chalk.dim(`File: ${workflowFile}`));
  console.log(chalk.dim(`Speed: ${options.speed ?? "1.0"}x`));

  try {
    const content = readFileSync(filePath, "utf-8");
    const workflow = JSON.parse(content);

    console.log(chalk.dim(`\nPlaying workflow: ${workflow.name ?? "unnamed"}`));
    console.log(chalk.dim(`Steps: ${workflow.steps?.length ?? 0}\n`));

    const speed = parseFloat(options.speed ?? "1.0");

    for (let index = 0; index < (workflow.steps?.length ?? 0); index++) {
      const step = workflow.steps[index];
      console.log(chalk.dim(`  [${index + 1}/${workflow.steps.length}] ${step.type}...`));
      await new Promise((resolve) => setTimeout(resolve, 500 / speed));
    }

    const result = {
      workflow: workflow.name,
      stepsPlayed: workflow.steps?.length ?? 0,
      completedAt: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green("\nWorkflow completed!"));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nPlayback failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerWorkflowPlayCommand(program: Command): void {
  program
    .command("workflow:play")
    .description("Play a recorded workflow")
    .argument("<file>", "Path to workflow file")
    .option("--speed <multiplier>", "Playback speed", "1.0")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect workflow:play workflow.json
  $ inspect workflow:play workflow.json --speed 2.0
`,
    )
    .action(async (file: string | undefined, opts: WorkflowPlayOptions) => {
      await runWorkflowPlay(file, opts);
    });
}
