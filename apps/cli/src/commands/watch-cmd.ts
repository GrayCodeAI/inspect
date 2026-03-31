import { Command } from "commander";
import chalk from "chalk";
import { WatchManager, type WatchEvent, type WatchConfig } from "@inspect/core";

export function registerWatchCmdCommand(program: Command): void {
  program
    .command("watch-cmd")
    .description("Watch mode - continuous file monitoring with heuristic-first, agent-second assessment")
    .option("-c, --cwd <path>", "Working directory", process.cwd())
    .option("-i, --include <patterns>", "File patterns to include (comma-separated)", "**/*.{ts,tsx,js,jsx}")
    .option("-e, --exclude <patterns>", "File patterns to exclude (comma-separated)", "node_modules,dist")
    .option("--interval <ms>", "Poll interval in milliseconds", "2000")
    .option("--settle <ms>", "Settle delay in milliseconds", "3000")
    .option("--agent <name>", "Coding agent to use (claude, codex, copilot, etc.)")
    .option("-m, --instruction <text>", "Test instruction")
    .option("--url <url>", "Base URL to test")
    .option("--cookie-browser <browsers>", "Browsers to extract cookies from (comma-separated)")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const config: WatchConfig = {
        cwd: opts.cwd,
        pollInterval: parseInt(opts.interval, 10),
        settleDelay: parseInt(opts.settle, 10),
        include: opts.include.split(","),
        exclude: opts.exclude.split(","),
      };

      const watch = new WatchManager(config);

      watch.on("start", (data: { fileCount: number }) => {
        if (!opts.json) {
          console.log(chalk.green(`\n\u25c6 Watch mode started - monitoring ${data.fileCount} files`));
          console.log(chalk.hex("#64748b")(`  Poll interval: ${config.pollInterval}ms | Settle delay: ${config.settleDelay}ms`));
          console.log(chalk.hex("#64748b")(`  Include: ${config.include?.join(", ")}\n`));
        }
      });

      watch.on("event", (event: WatchEvent) => {
        if (opts.json) {
          console.log(JSON.stringify(event));
          return;
        }
        switch (event.type) {
          case "polling":
            process.stdout.write(chalk.hex("#475569")("."));
            break;
          case "change-detected":
            console.log(chalk.yellow(`\n\u25c6 Change detected (fingerprint: ${event.fingerprint.slice(0, 8)})`));
            break;
          case "settling":
            console.log(chalk.hex("#64748b")("  Waiting for changes to settle..."));
            break;
          case "assessing":
            console.log(chalk.blue("  Assessing changes..."));
            break;
          case "run-starting":
            console.log(chalk.green(`\n\u25c6 Running tests (fingerprint: ${event.fingerprint.slice(0, 8)})`));
            break;
          case "run-skipped":
            console.log(chalk.hex("#f59e0b")(`  Skipped (fingerprint: ${event.fingerprint.slice(0, 8)})`));
            break;
          case "run-completed":
            const color = event.result === "pass" ? "#22c55e" : "#ef4444";
            console.log(chalk.hex(color)(`  ${event.result === "pass" ? "\u2713" : "\u2717"} ${event.result.toUpperCase()}`));
            break;
          case "error":
            console.log(chalk.red(`  Error: ${event.error}`));
            break;
        }
      });

      watch.on("change", async (data: { files: Array<{ path: string }>; fingerprint: string }) => {
        if (!opts.json) {
          console.log(chalk.hex("#94a3b8")(`  Changed files: ${data.files.map((f) => f.path).join(", ")}`));
        }
      });

      watch.on("run", async () => {
        if (!opts.json) {
          console.log(chalk.blue("  Executing test run..."));
        }
      });

      process.on("SIGINT", async () => {
        if (!opts.json) console.log(chalk.yellow("\n\n\u25c6 Stopping watch mode..."));
        await watch.stop();
        process.exit(0);
      });

      await watch.start();
    });
}
