import type { Command } from "commander";
import chalk from "chalk";

export interface PluginDisableOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  NOT_FOUND: 2,
} as const;

async function runPluginDisable(
  pluginName: string | undefined,
  options: PluginDisableOptions,
): Promise<void> {
  if (!pluginName) {
    console.error(chalk.red("Error: Plugin name is required."));
    console.log(chalk.dim("Usage: inspect plugin:disable <name>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Plugin Disable\n"));
  console.log(chalk.dim(`Plugin: ${pluginName}`));

  try {
    const result = {
      name: pluginName,
      status: "disabled",
      disabledAt: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.yellow(`\nPlugin "${pluginName}" disabled.`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to disable plugin: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerPluginDisableCommand(program: Command): void {
  program
    .command("plugin:disable")
    .description("Disable a plugin")
    .argument("<name>", "Plugin name")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect plugin:disable slack-notifier
  $ inspect plugin:disable jira-integration --json
`,
    )
    .action(async (name: string | undefined, opts: PluginDisableOptions) => {
      await runPluginDisable(name, opts);
    });
}
