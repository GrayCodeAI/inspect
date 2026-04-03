import type { Command } from "commander";
import chalk from "chalk";

export interface TraceStartOptions {
  name?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runTraceStart(options: TraceStartOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Trace Start\n"));

  try {
    const traceId = `trace-${Date.now()}`;
    const traceData = {
      id: traceId,
      name: options.name ?? `trace-${traceId.slice(-6)}`,
      status: "recording",
      startedAt: new Date().toISOString(),
      events: [],
    };

    if (options.json) {
      console.log(JSON.stringify(traceData, null, 2));
    } else {
      console.log(chalk.green("Trace started!"));
      console.log(chalk.dim(`Trace ID: ${traceId}`));
      console.log(chalk.dim(`Name: ${traceData.name}`));
      console.log(chalk.dim("\nUse 'inspect trace:stop' to stop and export"));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to start trace: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerTraceStartCommand(program: Command): void {
  program
    .command("trace:start")
    .description("Start execution tracing")
    .option("--name <name>", "Trace name")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect trace:start
  $ inspect trace:start --name "debug-session"
`,
    )
    .action(async (opts: TraceStartOptions) => {
      await runTraceStart(opts);
    });
}
