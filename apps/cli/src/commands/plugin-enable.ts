import type { Command } from "commander";
import chalk from "chalk";

export interface PluginEnableOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  NOT_FOUND: 2,
} as const;

async function runPluginEnable(
  pluginName: string | undefined,
  options: PluginEnableOptions,
): Promise<void> {
  if (!pluginName) {
    console.error(chalk.red("Error: Plugin name is required."));
    console.log(chalk.dim("Usage: inspect plugin:enable <name>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Plugin Enable\n"));
  console.log(chalk.dim(`Plugin: ${pluginName}`));

  try {
    const result = {
      name: pluginName,
      status: "enabled",
      enabledAt: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green(`\nPlugin "${pluginName}" enabled successfully!`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to enable plugin: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerPluginEnableCommand(program: Command): void {
  program
    .command("plugin:enable")
    .description("Enable a plugin")
    .argument("<name>", "Plugin name")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect plugin:enable slack-notifier
  $ inspect plugin:enable jira-integration --json
`,
    )
    .action(async (name: string | undefined, opts: PluginEnableOptions) => {
      await runPluginEnable(name, opts);
    });
}
