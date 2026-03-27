import type { Command } from "commander";
import chalk from "chalk";

async function runInstall(browsers: string[], options: { withDeps?: boolean; force?: boolean }): Promise<void> {
  const { execFile: execFileCb } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFile = promisify(execFileCb);

  if (browsers.length === 0 && process.stdin.isTTY) {
    const { pickMany } = await import("../utils/picker.js");
    const selected = await pickMany("Select browsers to install:", [
      { label: "Chromium", value: "chromium", description: "recommended" },
      { label: "Firefox", value: "firefox" },
      { label: "WebKit", value: "webkit" },
      { label: "Chrome", value: "chrome", description: "branded" },
      { label: "Microsoft Edge", value: "msedge", description: "branded" },
    ]);
    if (selected.length > 0) {
      browsers = selected;
    }
  }

  const browsersToInstall = browsers.length > 0 ? browsers : ["chromium"];

  console.log(chalk.blue("\nInstalling browsers for Inspect...\n"));

  for (const browser of browsersToInstall) {
    const validBrowsers = ["chromium", "firefox", "webkit", "chrome", "msedge"];
    if (!validBrowsers.includes(browser)) {
      console.log(chalk.yellow(`  Unknown browser: ${browser}. Valid: ${validBrowsers.join(", ")}`));
      continue;
    }

    console.log(chalk.dim(`  Installing ${browser}...`));

    try {
      // Find playwright CLI in local node_modules
      let playwrightCli = "";
      const { join: joinPath } = await import("node:path");
      const { existsSync: fileExists } = await import("node:fs");
      const candidates = [
        joinPath(process.cwd(), "node_modules", "playwright", "cli.js"),
        joinPath(process.cwd(), "node_modules", "playwright-core", "cli.js"),
        joinPath(process.cwd(), "node_modules", ".pnpm", "playwright-core@1.58.2", "node_modules", "playwright-core", "cli.js"),
      ];
      for (const c of candidates) {
        if (fileExists(c)) { playwrightCli = c; break; }
      }

      let args: string[];
      let cmd: string;
      if (playwrightCli) {
        cmd = process.execPath;
        args = [playwrightCli, "install", browser];
      } else {
        cmd = "npx";
        args = ["playwright", "install", browser];
      }
      if (options.withDeps) args.push("--with-deps");
      if (options.force) args.push("--force");

      const { stdout, stderr } = await execFile(cmd, args, { timeout: 300000 });
      if (stdout.trim()) console.log(chalk.dim(`    ${stdout.trim()}`));
      console.log(chalk.green(`  ✓ ${browser} installed`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  ✗ Failed to install ${browser}: ${msg.slice(0, 200)}`));
    }
  }

  console.log(chalk.dim("\nRun 'inspect doctor' to verify installation.\n"));
}

export function registerInstallCommand(program: Command): void {
  program
    .command("install")
    .description("Install browsers for testing (wraps playwright install)")
    .argument("[browsers...]", "Browsers to install: chromium, firefox, webkit, chrome, msedge")
    .option("--with-deps", "Also install system dependencies (may require sudo)")
    .option("--force", "Force reinstall even if already present")
    .addHelpText("after", `
Examples:
  $ inspect install                    Install Chromium (default)
  $ inspect install chromium firefox   Install Chromium and Firefox
  $ inspect install --with-deps        Install browser + system dependencies
  $ inspect install webkit --force     Force reinstall WebKit
`)
    .action(async (browsers: string[], opts) => {
      try {
        await runInstall(browsers, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });
}
