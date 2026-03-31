/**
 * @inspect dev - Developer tools command group
 *
 * Subcommands:
 *   inspect dev generate - Generate code/config
 *   inspect dev alias    - Manage command aliases
 *   inspect dev engine   - Engine management
 */
import type { Command } from "commander";

export function registerDevCommand(program: Command): void {
  const devCmd = program
    .command("dev")
    .description("Developer tools (generate, alias, engine)")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect dev generate test --name "login"
  $ inspect dev alias add quick "test -m"
  $ inspect dev engine status
`,
    );

  // generate subcommand
  devCmd
    .command("generate <type>")
    .description("Generate code or configuration")
    .option("--name <name>", "Name for generated file")
    .option("--template <template>", "Template to use")
    .option("--output <path>", "Output path")
    .action(async (type: string, _options) => {
      const { registerGenerateCommand } = await import("./generate.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerGenerateCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "generate", type], { from: "user" });
    });

  // alias subcommand
  devCmd
    .command("alias <action> [name] [command]")
    .description("Manage command aliases")
    .option("--json", "Output as JSON")
    .action(
      async (action: string, name: string | undefined, command: string | undefined, _options) => {
        const { registerAliasCommand } = await import("./alias.js");
        const { Command } = await import("commander");
        const tempProgram = new Command();
        registerAliasCommand(tempProgram);
        const args = [action, ...(name ? [name] : []), ...(command ? [command] : [])];
        await tempProgram.parseAsync(["node", "inspect", "alias", ...args], { from: "user" });
      },
    );

  // engine subcommand
  devCmd
    .command("engine <action>")
    .description("Engine management")
    .option("--json", "Output as JSON")
    .action(async (action: string, _options) => {
      const { registerEngineCommand } = await import("./engine.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerEngineCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "engine", action], { from: "user" });
    });
}
