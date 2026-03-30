import type { Command } from "commander";
import chalk from "chalk";

export interface TrailOptions {
  sessionId?: string;
  limit?: string;
  action?: string;
  compliance?: string;
  json?: boolean;
}

async function showTrail(options: TrailOptions): Promise<void> {
  const { AuditTrail } = await import("@inspect/agent");

  const storagePath = ".inspect/audit";
  const trail = new AuditTrail(storagePath);

  const limit = parseInt(options.limit ?? "50", 10);

  console.log(chalk.blue("\nAgent Audit Trail\n"));

  if (options.sessionId) {
    console.log(chalk.dim(`  Session: ${options.sessionId}\n`));
  }

  if (options.compliance) {
    const report = trail.generateComplianceReport(
      options.compliance as "eu-ai-act" | "soc2" | "iso27001",
      options.sessionId,
    );

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(chalk.bold(`  Compliance Report: ${options.compliance.toUpperCase()}\n`));
    console.log(`  Generated: ${report.generatedAt}`);
    console.log(`  Standard: ${report.standard}`);
    console.log(`  Total Actions: ${report.summary.totalActions}`);
    console.log(`  Successful: ${report.summary.successfulActions}`);
    console.log(`  Failed: ${report.summary.failedActions}`);
    console.log(`  Total Cost: $${report.summary.totalCost.toFixed(4)}`);
    console.log(`  Total Tokens: ${report.summary.totalTokens}`);
    console.log(`  Agents: ${report.summary.agentCount}`);
    console.log(`  Sessions: ${report.summary.sessionCount}`);

    if (report.sections.length > 0) {
      console.log(chalk.bold("\n  Sections:"));
      for (const s of report.sections) {
        const icon =
          s.status === "pass"
            ? chalk.green("✓")
            : s.status === "fail"
              ? chalk.red("✗")
              : chalk.yellow("!");
        console.log(`  ${icon} ${s.title}: ${s.details}`);
      }
    }
    return;
  }

  // Show recent entries
  const entries = trail.query({
    sessionId: options.sessionId,
    startTime: Date.now() - 24 * 60 * 60 * 1000,
    endTime: Date.now(),
  });

  const filtered = options.action ? entries.filter((e) => e.action === options.action) : entries;
  const recent = filtered.slice(-limit);

  if (options.json) {
    console.log(JSON.stringify(recent, null, 2));
    return;
  }

  if (recent.length === 0) {
    console.log(chalk.dim("  No audit entries found.\n"));
    return;
  }

  for (const entry of recent) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const actionColor =
      entry.action === "llm_call"
        ? chalk.cyan
        : entry.action === "tool_use"
          ? chalk.yellow
          : entry.action === "navigation"
            ? chalk.blue
            : chalk.dim;

    console.log(
      `  ${chalk.dim(time)} ${actionColor(entry.action.padEnd(12))} ${entry.input.slice(0, 60)}`,
    );
    if (entry.toolCalls.length > 0) {
      console.log(
        chalk.dim(
          `                      ${entry.toolCalls.map((t) => `${t.name}(${t.duration}ms)`).join(", ")}`,
        ),
      );
    }
  }

  console.log(chalk.dim(`\n  Showing ${recent.length} of ${filtered.length} entries\n`));
}

export function registerTrailCommand(program: Command): void {
  program
    .command("trail")
    .description("Show agent audit trail")
    .option("-s, --session <id>", "Filter by session ID")
    .option("-l, --limit <n>", "Max entries to show", "50")
    .option("-a, --action <type>", "Filter by action type (llm_call, tool_use, navigation)")
    .option("--compliance <standard>", "Generate compliance report (eu-ai-act, soc2, internal)")
    .option("--json", "Output as JSON")
    .action(async (opts: TrailOptions) => {
      try {
        await showTrail(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
