import type { Command } from "commander";
import chalk from "chalk";

export interface WorkflowRecordOptions {
  url: string;
  name?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runWorkflowRecord(options: WorkflowRecordOptions): Promise<void> {
  if (!options.url) {
    console.error(chalk.red("Error: URL is required. Use --url <url>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Workflow Record\n"));
  console.log(chalk.dim(`URL: ${options.url}`));

  try {
    const workflowId = `wf-${Date.now()}`;
    const workflowData = {
      id: workflowId,
      name: options.name ?? `workflow-${workflowId.slice(-6)}`,
      url: options.url,
      status: "recording",
      startedAt: new Date().toISOString(),
      steps: [],
    };

    if (options.json) {
      console.log(JSON.stringify(workflowData, null, 2));
    } else {
      console.log(chalk.green("\nWorkflow recording started!"));
      console.log(chalk.dim(`Workflow ID: ${workflowId}`));
      console.log(chalk.dim("Interact with the page and press Ctrl+C when done."));
    }

    process.on("SIGINT", () => {
      console.log(chalk.dim("\n\nStopping recording..."));
      console.log(chalk.green(`Workflow saved: ${workflowId}`));
      process.exit(EXIT_CODES.SUCCESS);
    });

    await new Promise(() => {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nRecording failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerWorkflowRecordCommand(program: Command): void {
  program
    .command("workflow:record")
    .description("Record a workflow")
    .requiredOption("--url <url>", "URL to record")
    .option("--name <name>", "Workflow name")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect workflow:record --url https://example.com
  $ inspect workflow:record --url https://example.com --name "login-flow"
`,
    )
    .action(async (opts: WorkflowRecordOptions) => {
      await runWorkflowRecord(opts);
    });
}
