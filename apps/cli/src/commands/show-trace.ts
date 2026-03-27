import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

interface TraceEntry {
  method: string;
  url: string;
  status: number;
  duration: number;
}

interface TraceData {
  instruction: string;
  url: string;
  agent: string;
  timestamp: string;
  requests: TraceEntry[];
}

async function showTrace(tracePath?: string, options?: { json?: boolean }): Promise<void> {
  let filePath: string;

  if (tracePath) {
    filePath = resolve(tracePath);
  } else {
    // Find latest trace file
    const traceDir = join(process.cwd(), ".inspect", "traces");
    if (!existsSync(traceDir)) {
      console.error(chalk.yellow("No traces found. Run a test with --trace to generate one."));
      process.exit(1);
    }

    const files = readdirSync(traceDir)
      .filter(f => f.endsWith(".json"))
      .map(f => ({ name: f, path: join(traceDir, f), mtime: statSync(join(traceDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
      console.error(chalk.yellow("No trace files found. Run: inspect test --trace -m \"...\""));
      process.exit(1);
    }

    filePath = files[0].path;
    console.log(chalk.dim(`Showing latest trace: ${files[0].name}\n`));
  }

  if (!existsSync(filePath)) {
    console.error(chalk.red(`Trace file not found: ${filePath}`));
    process.exit(1);
  }

  const trace: TraceData = JSON.parse(readFileSync(filePath, "utf-8"));

  if (options?.json) {
    process.stdout.write(JSON.stringify(trace, null, 2) + "\n");
    return;
  }

  // Header
  console.log(chalk.blue("Inspect Trace Viewer\n"));
  console.log(`  Instruction: ${trace.instruction}`);
  console.log(`  URL:         ${trace.url ?? "(none)"}`);
  console.log(`  Agent:       ${trace.agent}`);
  console.log(`  Time:        ${trace.timestamp}`);
  console.log(`  Requests:    ${trace.requests.length}\n`);

  if (trace.requests.length === 0) {
    console.log(chalk.dim("  No network requests recorded."));
    return;
  }

  // Summary stats
  const totalDuration = trace.requests.reduce((sum, r) => sum + r.duration, 0);
  const failed = trace.requests.filter(r => r.status >= 400);
  const slow = trace.requests.filter(r => r.duration > 1000);

  console.log(chalk.dim("  Summary:"));
  console.log(`    Total requests:  ${trace.requests.length}`);
  console.log(`    Total duration:  ${totalDuration}ms`);
  if (failed.length > 0) console.log(chalk.red(`    Failed (4xx/5xx): ${failed.length}`));
  if (slow.length > 0) console.log(chalk.yellow(`    Slow (>1s):       ${slow.length}`));
  console.log();

  // Request table
  console.log(chalk.dim("  " + "Method".padEnd(8) + "Status".padEnd(8) + "Duration".padEnd(10) + "URL"));
  console.log(chalk.dim("  " + "─".repeat(80)));

  for (const req of trace.requests) {
    const method = req.method.padEnd(8);
    const status = String(req.status).padEnd(8);
    const duration = `${req.duration}ms`.padEnd(10);
    const url = req.url.length > 60 ? req.url.slice(0, 57) + "..." : req.url;

    let statusColor = chalk.green;
    if (req.status >= 400) statusColor = chalk.red;
    else if (req.status >= 300) statusColor = chalk.yellow;
    else if (req.status === 0) statusColor = chalk.dim;

    const durationColor = req.duration > 1000 ? chalk.yellow : chalk.dim;

    console.log(`  ${chalk.cyan(method)}${statusColor(status)}${durationColor(duration)}${url}`);
  }

  console.log();

  // Show failures in detail
  if (failed.length > 0) {
    console.log(chalk.red(`\n  Failed Requests (${failed.length}):\n`));
    for (const req of failed) {
      console.log(chalk.red(`    ${req.method} ${req.status} ${req.url}`));
    }
  }
}

export function registerShowTraceCommand(program: Command): void {
  program
    .command("show-trace")
    .description("View network trace from a test run")
    .argument("[trace]", "Path to trace JSON file (default: latest)")
    .option("--json", "Output trace as JSON")
    .addHelpText("after", `
Examples:
  $ inspect show-trace                              View latest trace
  $ inspect show-trace .inspect/traces/trace-123.json
  $ inspect show-trace --json | jq '.requests[] | select(.status >= 400)'
`)
    .action(async (tracePath?: string, opts?: { json?: boolean }) => {
      try {
        await showTrace(tracePath, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });
}
