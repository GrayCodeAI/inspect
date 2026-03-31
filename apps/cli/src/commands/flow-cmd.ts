import { Command } from "commander";
import chalk from "chalk";
import { FlowManager, type SavedFlow } from "@inspect/core";

export function registerFlowCmdCommand(program: Command): void {
  const flow = program
    .command("flow")
    .description("Manage saved test flows");

  flow
    .command("list")
    .description("List all saved flows")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const manager = new FlowManager();
      const flows = await manager.list();

      if (opts.json) {
        console.log(JSON.stringify(flows, null, 2));
        return;
      }

      const lines: string[] = [];
      lines.push("");
      lines.push(chalk.hex("#a855f7").bold("  \u25c6 Saved Test Flows"));
      lines.push("");

      if (flows.length === 0) {
        lines.push("  No saved flows. Create one with: inspect flow save");
      } else {
        for (const f of flows) {
          const status = f.lastRunAt
            ? chalk.hex("#22c55e")(`last run: ${new Date(f.lastRunAt).toLocaleDateString()}`)
            : chalk.hex("#64748b")("never run");
          lines.push(`  ${chalk.hex("#e2e8f0")(f.name.padEnd(25))} ${chalk.hex("#94a3b8")(f.description.slice(0, 40))} ${status}`);
          lines.push(`    ${chalk.hex("#64748b")(`id: ${f.id} | runs: ${f.runCount} | created: ${new Date(f.createdAt).toLocaleDateString()}`)}`);
        }
      }

      lines.push("");
      console.log(lines.join("\n"));
    });

  flow
    .command("save")
    .description("Save current test configuration as a reusable flow")
    .requiredOption("-n, --name <name>", "Flow name")
    .option("-d, --description <text>", "Flow description")
    .option("-m, --instruction <text>", "Test instruction")
    .option("--url <url>", "Base URL")
    .option("--cookie-browsers <browsers>", "Browsers for cookie extraction (comma-separated)")
    .option("--tag <tags>", "Tags (comma-separated)")
    .action(async (opts) => {
      const manager = new FlowManager();
      const saved = await manager.save({
        name: opts.name,
        description: opts.description || opts.instruction || "",
        instruction: opts.instruction || "",
        baseUrl: opts.url,
        cookieBrowsers: opts.cookieBrowsers ? opts.cookieBrowsers.split(",") : [],
        tags: opts.tag ? opts.tag.split(",") : [],
      });

      console.log(chalk.green(`\n\u25c6 Flow saved: ${saved.name}`));
      console.log(chalk.hex("#64748b")(`  ID: ${saved.id}`));
      console.log(chalk.hex("#64748b")(`  Instruction: ${saved.instruction}`));
      console.log(chalk.hex("#64748b")(`  Run with: inspect test --flow ${saved.id}\n`));
    });

  flow
    .command("run")
    .description("Run a saved flow")
    .requiredOption("-i, --id <id>", "Flow ID")
    .action(async (opts) => {
      const manager = new FlowManager();
      const flowData = await manager.load(opts.id);
      await manager.recordRun(opts.id);

      console.log(chalk.green(`\n\u25c6 Running flow: ${flowData.name}`));
      console.log(chalk.hex("#64748b")(`  Instruction: ${flowData.instruction}`));
      console.log(chalk.hex("#64748b")(`  URL: ${flowData.baseUrl ?? "not specified"}`));
      console.log(chalk.hex("#64748b")(`  Cookie browsers: ${flowData.cookieBrowsers.join(", ") || "none"}`));
      console.log(chalk.hex("#64748b")(`  Run count: ${flowData.runCount}\n`));
    });

  flow
    .command("delete")
    .description("Delete a saved flow")
    .requiredOption("-i, --id <id>", "Flow ID")
    .action(async (opts) => {
      const manager = new FlowManager();
      await manager.delete(opts.id);
      console.log(chalk.green(`\n\u25c6 Flow deleted: ${opts.id}\n`));
    });
}
