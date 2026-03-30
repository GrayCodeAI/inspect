// Flow command — save, list, run, delete saved test flows
import type { Command } from "commander";
import chalk from "chalk";
import { FlowStorage } from "../utils/flow-storage.js";

export function registerFlowCommand(program: Command): void {
  const flow = program.command("flow").description("Manage saved test flows");

  flow
    .command("save")
    .description("Save a new test flow")
    .requiredOption("-n, --name <name>", "Flow name")
    .requiredOption("-m, --message <instruction>", "Test instruction")
    .option("-t, --target <target>", "Target: unstaged, branch, changes", "changes")
    .option("--url <url>", "Target URL")
    .option("-a, --agent <agent>", "AI agent", "claude")
    .option("--mode <mode>", "Agent mode", "dom")
    .option("--devices <devices>", "Device presets", "desktop-chrome")
    .option("--tags <tags>", "Comma-separated tags")
    .action(async (opts) => {
      const storage = new FlowStorage();
      const saved = storage.save({
        name: opts.name,
        instruction: opts.message,
        target: opts.target,
        url: opts.url,
        agent: opts.agent,
        mode: opts.mode,
        devices: opts.devices,
        tags: opts.tags ? opts.tags.split(",").map((t: string) => t.trim()) : [],
      });
      console.log(chalk.green(`\nFlow saved: ${saved.slug}`));
      console.log(chalk.dim(`  Name: ${saved.name}`));
      console.log(chalk.dim(`  Instruction: ${saved.instruction}`));
    });

  flow
    .command("list")
    .description("List saved flows")
    .action(() => {
      const storage = new FlowStorage();
      const flows = storage.list();
      if (flows.length === 0) {
        console.log(chalk.dim("No saved flows. Use `inspect flow save` to create one."));
        return;
      }
      console.log(chalk.blue(`\nSaved Flows (${flows.length}):\n`));
      for (const f of flows) {
        const lastRun = f.lastRun ? new Date(f.lastRun).toLocaleDateString() : "never";
        console.log(chalk.white(`  ${f.slug}`));
        console.log(chalk.dim(`    ${f.instruction}`));
        console.log(chalk.dim(`    Ran ${f.runCount}x | Last: ${lastRun}`));
      }
    });

  flow
    .command("run <slug>")
    .description("Run a saved flow")
    .action(async (slug: string) => {
      const storage = new FlowStorage();
      const saved = storage.load(slug);
      if (!saved) {
        console.error(chalk.red(`Flow not found: ${slug}`));
        process.exit(1);
      }
      storage.recordRun(slug);
      console.log(chalk.blue(`\nRunning flow: ${saved.name}`));
      const { runTest } = await import("./test.js");
      await runTest({
        message: saved.instruction,
        agent: saved.agent ?? "claude",
        mode: (saved.mode as "dom" | "hybrid" | "cua") ?? "dom",
        url: saved.url,
        devices: saved.devices ?? "desktop-chrome",
        browser: "chromium",
        target: saved.target,
      });
    });

  flow
    .command("delete <slug>")
    .description("Delete a saved flow")
    .action((slug: string) => {
      const storage = new FlowStorage();
      if (storage.delete(slug)) {
        console.log(chalk.green(`Flow deleted: ${slug}`));
      } else {
        console.error(chalk.red(`Flow not found: ${slug}`));
      }
    });
}
