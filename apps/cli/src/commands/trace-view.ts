import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface TraceViewOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  NOT_FOUND: 2,
} as const;

async function runTraceView(
  traceFile: string | undefined,
  options: TraceViewOptions,
): Promise<void> {
  if (!traceFile) {
    console.error(chalk.red("Error: Trace file is required."));
    console.log(chalk.dim("Usage: inspect trace:view <file>"));
    process.exit(EXIT_CODES.ERROR);
  }

  const filePath = resolve(traceFile);
  if (!existsSync(filePath)) {
    console.error(chalk.red(`Error: Trace file not found: ${traceFile}`));
    process.exit(EXIT_CODES.NOT_FOUND);
  }

  console.log(chalk.blue("\nInspect Trace View\n"));
  console.log(chalk.dim(`File: ${traceFile}`));

  try {
    const content = readFileSync(filePath, "utf-8");
    const trace = JSON.parse(content);

    if (options.json) {
      console.log(JSON.stringify(trace, null, 2));
    } else {
      console.log(chalk.dim(`\nTrace: ${trace.name ?? "unnamed"}`));
      console.log(chalk.dim(`Status: ${trace.status}`));
      console.log(chalk.dim(`Events: ${trace.events?.length ?? 0}\n`));

      if (trace.events && trace.events.length > 0) {
        console.log(chalk.dim("Events:"));
        for (const event of trace.events) {
          const time = event.timestamp ? `[${event.timestamp}ms]` : "";
          console.log(`  ${chalk.dim(time)} ${event.type}: ${JSON.stringify(event)}`);
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to view trace: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerTraceViewCommand(program: Command): void {
  program
    .command("trace:view")
    .description("View trace in markdown format")
    .argument("<file>", "Path to trace file")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect trace:view trace.json
  $ inspect trace:view trace.json --json
`,
    )
    .action(async (file: string | undefined, opts: TraceViewOptions) => {
      await runTraceView(file, opts);
    });
}
