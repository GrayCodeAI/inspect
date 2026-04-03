import type { Command } from "commander";
import chalk from "chalk";

export interface PluginListOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runPluginList(options: PluginListOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Plugin List\n"));

  try {
    const plugins = [
      {
        id: "plugin-001",
        name: "custom-reporter",
        version: "1.0.0",
        status: "enabled",
        installedAt: "2025-01-10T10:00:00Z",
      },
      {
        id: "plugin-002",
        name: "slack-notifier",
        version: "2.1.0",
        status: "enabled",
        installedAt: "2025-01-12T14:30:00Z",
      },
      {
        id: "plugin-003",
        name: "jira-integration",
        version: "1.5.0",
        status: "disabled",
        installedAt: "2025-01-08T09:15:00Z",
      },
    ];

    if (options.json) {
      console.log(JSON.stringify({ plugins }, null, 2));
    } else {
      console.log(chalk.dim(`${plugins.length} plugin(s) installed:\n`));
      for (const plugin of plugins) {
        const statusColor = plugin.status === "enabled" ? chalk.green : chalk.gray;
        console.log(`  ${chalk.cyan(plugin.id)} ${statusColor(`[${plugin.status}]`)}`);
        console.log(`  Name: ${plugin.name}`);
        console.log(`  Version: ${chalk.dim(plugin.version)}`);
        console.log(`  Installed: ${chalk.dim(plugin.installedAt)}\n`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to list plugins: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerPluginListCommand(program: Command): void {
  program
    .command("plugin:list")
    .description("List installed plugins")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect plugin:list
  $ inspect plugin:list --json
`,
    )
    .action(async (opts: PluginListOptions) => {
      await runPluginList(opts);
    });
}
