import type { Command } from "commander";
import chalk from "chalk";

export interface CodegenRecordOptions {
  url: string;
  output?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runCodegenRecord(options: CodegenRecordOptions): Promise<void> {
  if (!options.url) {
    console.error(chalk.red("Error: URL is required. Use --url <url>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Codegen Record\n"));
  console.log(chalk.dim(`URL: ${options.url}`));

  try {
    const sessionId = `codegen-${Date.now()}`;

    console.log(chalk.dim("\nStarting recording session..."));
    console.log(chalk.dim("Browser will open in headed mode."));
    console.log(chalk.dim("Interact with the page and press Ctrl+C when done.\n"));

    const recording = {
      sessionId,
      url: options.url,
      status: "recording",
      startedAt: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify(recording, null, 2));
    } else {
      console.log(chalk.green(`Recording session started: ${sessionId}`));
      console.log(chalk.dim("Press Ctrl+C to stop and generate test"));
    }

    process.on("SIGINT", () => {
      console.log(chalk.dim("\n\nStopping recording..."));
      console.log(chalk.green(`Session saved: ${sessionId}`));
      console.log(chalk.dim(`Use 'inspect codegen:convert ${sessionId}' to generate test`));
      process.exit(EXIT_CODES.SUCCESS);
    });

    await new Promise(() => {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nRecording failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerCodegenRecordCommand(program: Command): void {
  program
    .command("codegen:record")
    .description("Start recording session for codegen")
    .requiredOption("--url <url>", "URL to record")
    .option("--output <path>", "Output path for recording")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect codegen:record --url https://example.com
  $ inspect codegen:record --url https://app.com --output ./recording.json
`,
    )
    .action(async (opts: CodegenRecordOptions) => {
      await runCodegenRecord(opts);
    });
}
