import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ALIASES_FILE = join(homedir(), ".inspect", "aliases.json");

function loadAliases(): Record<string, string> {
  try {
    if (existsSync(ALIASES_FILE)) {
      return JSON.parse(readFileSync(ALIASES_FILE, "utf-8"));
    }
  } catch {
    /* file not readable */
  }
  return {};
}

function saveAliases(aliases: Record<string, string>): void {
  const dir = join(homedir(), ".inspect");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(ALIASES_FILE, JSON.stringify(aliases, null, 2), "utf-8");
}

export function registerAliasCommand(program: Command): void {
  const aliasCmd = program.command("alias").description("Manage command aliases");

  aliasCmd
    .command("set")
    .description("Create or update an alias")
    .argument("<name>", "Alias name")
    .argument("<command>", "Command to alias (quote the full command)")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect alias set smoke "test -m 'smoke test' --preset quick"
  $ inspect alias set mobile "test --devices 'iphone-15,pixel-8' --mode hybrid"
  $ inspect alias set ci-full "test --preset ci --reporter junit --shard 1/3"
`,
    )
    .action((name: string, command: string) => {
      const aliases = loadAliases();
      aliases[name] = command;
      saveAliases(aliases);
      console.log(chalk.green(`Alias set: ${name} → ${command}`));
    });

  aliasCmd
    .command("list")
    .description("List all aliases")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const aliases = loadAliases();
      if (opts.json) {
        process.stdout.write(JSON.stringify(aliases, null, 2) + "\n");
        return;
      }
      const keys = Object.keys(aliases);
      if (keys.length === 0) {
        console.log(chalk.dim("No aliases defined. Use: inspect alias set <name> <command>"));
        return;
      }
      console.log(chalk.blue("\nAliases:\n"));
      for (const [name, cmd] of Object.entries(aliases)) {
        console.log(`  ${chalk.cyan(name.padEnd(20))} → ${cmd}`);
      }
      console.log();
    });

  aliasCmd
    .command("delete")
    .description("Delete an alias")
    .argument("<name>", "Alias name to delete")
    .action((name: string) => {
      const aliases = loadAliases();
      if (!(name in aliases)) {
        console.log(chalk.yellow(`Alias "${name}" not found.`));
        return;
      }
      delete aliases[name];
      saveAliases(aliases);
      console.log(chalk.green(`Alias deleted: ${name}`));
    });

  aliasCmd
    .command("run")
    .description("Run an alias")
    .argument("<name>", "Alias name to run")
    .action(async (name: string) => {
      const aliases = loadAliases();
      const cmd = aliases[name];
      if (!cmd) {
        console.error(
          chalk.red(`Unknown alias: "${name}". Use "inspect alias list" to see available aliases.`),
        );
        process.exit(1);
      }
      console.log(chalk.dim(`Running alias: ${name} → inspect ${cmd}\n`));
      // Re-parse as if the aliased command was typed
      const args = ["node", "inspect", ...cmd.split(/\s+/)];
      await program.parseAsync(args);
    });
}

/**
 * Check if argv contains an alias and expand it.
 * Call this before program.parseAsync() in the main entry point.
 */
export function expandAliases(argv: string[]): string[] {
  if (argv.length < 3) return argv;

  const command = argv[2];
  const aliases = loadAliases();

  if (command in aliases) {
    const expanded = aliases[command].split(/\s+/);
    return [...argv.slice(0, 2), ...expanded, ...argv.slice(3)];
  }

  return argv;
}
