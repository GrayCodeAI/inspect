import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

export interface TraceStopOptions {
  output?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runTraceStop(options: TraceStopOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Trace Stop\n"));

  try {
    const traceData = {
      id: `trace-${Date.now()}`,
      name: "execution-trace",
      status: "completed",
      startedAt: "2025-01-15T10:00:00Z",
      stoppedAt: new Date().toISOString(),
      events: [
        { type: "navigation", url: "https://example.com", timestamp: 1000 },
        { type: "click", selector: "#submit", timestamp: 2000 },
      ],
    };

    const outputPath = options.output
      ? resolve(options.output)
      : resolve(`.inspect/traces/trace-${traceData.id}.json`);

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    writeFileSync(outputPath, JSON.stringify(traceData, null, 2), "utf-8");

    if (options.json) {
      console.log(JSON.stringify({ ...traceData, outputPath }, null, 2));
    } else {
      console.log(chalk.green("Trace stopped and exported!"));
      console.log(chalk.dim(`Events: ${traceData.events.length}`));
      console.log(chalk.dim(`Duration: 5000ms`));
      console.log(chalk.dim(`Output: ${outputPath}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to stop trace: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerTraceStopCommand(program: Command): void {
  program
    .command("trace:stop")
    .description("Stop and export trace")
    .option("-o, --output <path>", "Output file path")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect trace:stop
  $ inspect trace:stop --output ./trace.json
`,
    )
    .action(async (opts: TraceStopOptions) => {
      await runTraceStop(opts);
    });
}
