import type { Command } from "commander";
import chalk from "chalk";

interface WatchOptions {
  message?: string;
  agent?: string;
  mode?: string;
  url?: string;
  devices?: string;
  browser?: string;
  pattern?: string;
  prioritize?: boolean;
}

async function runWatch(options: WatchOptions): Promise<void> {
  const { watch } = await import("node:fs");
  const { join, resolve: _resolve, extname } = await import("node:path");

  const instruction = options.message ?? "Test the recent changes";
  const pattern = options.pattern ?? "src/**/*.{ts,tsx,js,jsx}";

  console.log(chalk.blue("\nInspect Watch Mode\n"));
  console.log(chalk.dim(`Watching for file changes...`));
  console.log(chalk.dim(`Pattern: ${pattern}`));
  console.log(chalk.dim(`Instruction: ${instruction}`));
  console.log(chalk.dim("Press Ctrl+C to stop.\n"));

  const cwd = process.cwd();
  const srcDir = join(cwd, "src");

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isRunning = false;
  let runCount = 0;
  const changedFilesSinceLastRun: Set<string> = new Set();

  const runTest = async () => {
    if (isRunning) return;
    isRunning = true;
    runCount++;

    const changedFiles = [...changedFilesSinceLastRun];
    changedFilesSinceLastRun.clear();

    console.log(chalk.blue(`\n--- Run #${runCount} (${new Date().toLocaleTimeString()}) ---\n`));

    if (changedFiles.length > 0) {
      console.log(
        chalk.dim(
          `Changed files: ${changedFiles.slice(0, 5).join(", ")}${changedFiles.length > 5 ? ` (+${changedFiles.length - 5} more)` : ""}`,
        ),
      );
    }

    // Smart prioritization if enabled
    if (options.prioritize && changedFiles.length > 0) {
      try {
        const { TestPrioritizer } = await import("@inspect/core");
        const prioritizer = new TestPrioritizer();
        const result = prioritizer.prioritize({
          tests: [{ id: "current", name: instruction, coveredFiles: changedFiles }],
          changedFiles,
        });
        if (result.ranked.length > 0) {
          console.log(
            chalk.dim(`Priority score: ${result.ranked[0].score} (${result.ranked[0].reason})`),
          );
        }
      } catch {
        // Prioritization is best-effort
      }
    }

    try {
      const { runTest: executeTest } = await import("./test.js");
      await executeTest({
        message: instruction,
        agent: options.agent ?? "claude",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mode: (options.mode as any) ?? "dom",
        url: options.url,
        devices: options.devices ?? "desktop-chrome",
        browser: options.browser ?? "chromium",
        target: "unstaged",
      });
    } catch (err) {
      console.error(chalk.red(`Test error: ${err instanceof Error ? err.message : err}`));
    }

    isRunning = false;
    console.log(chalk.dim("\nWaiting for changes..."));
  };

  // Watch src directory
  const watchDirs = [srcDir, join(cwd, "app"), join(cwd, "pages"), join(cwd, "components")];
  const watchers: ReturnType<typeof watch>[] = [];

  const { existsSync } = await import("node:fs");

  for (const dir of watchDirs) {
    if (!existsSync(dir)) continue;

    try {
      const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const ext = extname(filename);
        if (![".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".css", ".html"].includes(ext))
          return;

        // Track changed files for prioritization
        changedFilesSinceLastRun.add(filename);

        // Debounce — wait 500ms after last change
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          console.log(chalk.dim(`\nFile changed: ${filename}`));
          runTest();
        }, 500);
      });

      watchers.push(watcher);
      console.log(chalk.dim(`  Watching: ${dir}`));
    } catch {
      // Directory doesn't exist or can't be watched
    }
  }

  if (watchers.length === 0) {
    console.log(chalk.yellow("No watchable directories found (src/, app/, pages/, components/)."));
    console.log(chalk.dim("Create one of these directories or specify files to watch."));
    return;
  }

  // Keep alive
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      console.log(chalk.dim("\nStopping watch mode..."));
      for (const w of watchers) w.close();
      if (debounceTimer) clearTimeout(debounceTimer);
      resolve();
    });
  });
}

export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("Watch for file changes and re-run tests automatically")
    .option("-m, --message <message>", "Test instruction")
    .option("-a, --agent <agent>", "AI agent: claude, gpt, gemini", "claude")
    .option("--mode <mode>", "Agent mode: dom, hybrid, cua", "dom")
    .option("--url <url>", "Target URL")
    .option("--devices <devices>", "Device presets", "desktop-chrome")
    .option("--browser <browser>", "Browser", "chromium")
    .option("--pattern <glob>", "File glob pattern to watch", "src/**/*.{ts,tsx,js,jsx}")
    .option("--prioritize", "Use smart test prioritization based on changed files")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect watch -m "test the login page"
  $ inspect watch -m "check homepage" --url http://localhost:3000
  $ inspect watch --agent gemini --mode dom
`,
    )
    .action(async (opts: WatchOptions) => {
      try {
        await runWatch(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });
}
