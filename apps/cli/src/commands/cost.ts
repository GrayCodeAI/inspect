import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function registerCostCommand(program: Command): void {
  program
    .command("cost")
    .description("Show token usage history and estimated costs")
    .option("-n, --limit <number>", "Number of recent reports to show", "10")
    .action(async (opts: { limit: string }) => {
      const limit = parseInt(opts.limit, 10) || 10;
      const dir = join(process.cwd(), ".inspect", "reports");

      if (!existsSync(dir)) {
        console.log(chalk.dim("No reports found. Run a test first."));
        return;
      }

      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, limit);

      if (files.length === 0) {
        console.log(chalk.dim("No reports found."));
        return;
      }

      let totalTokens = 0;
      let totalCost = 0;
      let totalRuns = 0;

      console.log(chalk.blue("\n  Token Usage History\n"));
      console.log(chalk.dim("  Date                 Tokens      Cost       URL"));
      console.log(chalk.dim("  " + "\u2500".repeat(70)));

      for (const file of files) {
        try {
          const data = JSON.parse(readFileSync(join(dir, file), "utf-8"));
          const tokens = data.cost?.tokens ?? 0;
          const cost = data.cost?.estimatedCost ?? 0;
          const url = (data.url ?? "").slice(0, 30);
          const date = data.timestamp ? new Date(data.timestamp).toLocaleString() : file;

          totalTokens += tokens;
          totalCost += cost;
          totalRuns++;

          const tokenStr = tokens.toLocaleString().padStart(10);
          const costStr = `$${cost.toFixed(4)}`.padStart(10);

          console.log(
            `  ${chalk.dim(date.padEnd(22))} ${chalk.cyan(tokenStr)} ${chalk.green(costStr)}  ${chalk.dim(url)}`,
          );
        } catch {
          /* skip invalid entry */
        }
      }

      console.log(chalk.dim("  " + "\u2500".repeat(70)));
      console.log(
        `  ${chalk.bold("Total")}${" ".repeat(16)} ${chalk.cyan(totalTokens.toLocaleString().padStart(10))} ${chalk.green(`$${totalCost.toFixed(4)}`.padStart(10))}  ${chalk.dim(`${totalRuns} runs`)}`,
      );
      console.log(
        `  ${chalk.dim("Avg per run")}${" ".repeat(10)} ${chalk.dim((totalRuns > 0 ? Math.round(totalTokens / totalRuns) : 0).toLocaleString().padStart(10))} ${chalk.dim(`$${(totalRuns > 0 ? totalCost / totalRuns : 0).toFixed(4)}`.padStart(10))}`,
      );
      console.log("");
    });
}
