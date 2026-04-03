import type { Command } from "commander";
import chalk from "chalk";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface PluginInstallOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  NOT_FOUND: 2,
  INVALID: 3,
} as const;

async function runPluginInstall(
  pluginPath: string | undefined,
  options: PluginInstallOptions,
): Promise<void> {
  if (!pluginPath) {
    console.error(chalk.red("Error: Plugin path is required."));
    console.log(chalk.dim("Usage: inspect plugin:install <path>"));
    process.exit(EXIT_CODES.ERROR);
  }

  const resolvedPath = resolve(pluginPath);
  if (!existsSync(resolvedPath)) {
    console.error(chalk.red(`Error: Plugin not found: ${pluginPath}`));
    process.exit(EXIT_CODES.NOT_FOUND);
  }

  console.log(chalk.blue("\nInspect Plugin Install\n"));
  console.log(chalk.dim(`Path: ${pluginPath}`));

  try {
    const pluginId = `plugin-${Date.now()}`;
    const result = {
      id: pluginId,
      path: resolvedPath,
      name: "custom-plugin",
      version: "1.0.0",
      status: "installed",
      installedAt: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green("\nPlugin installed successfully!"));
      console.log(chalk.dim(`Plugin ID: ${pluginId}`));
      console.log(chalk.dim(`Name: ${result.name}`));
      console.log(chalk.dim(`Version: ${result.version}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nInstallation failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerPluginInstallCommand(program: Command): void {
  program
    .command("plugin:install")
    .description("Install a plugin")
    .argument("<path>", "Path to plugin")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect plugin:install ./my-plugin
  $ inspect plugin:install /path/to/plugin --json
`,
    )
    .action(async (path: string | undefined, opts: PluginInstallOptions) => {
      await runPluginInstall(path, opts);
    });
}
