import type { Command } from "commander";
import chalk from "chalk";

export interface ChaosOptions {
  duration?: string;
  species?: string;
  fpsThreshold?: string;
  headed?: boolean;
  maxErrors?: string;
  json?: boolean;
}

async function runChaos(url: string | undefined, options: ChaosOptions): Promise<void> {
  if (!url) {
    console.error(chalk.red("Error: URL is required for chaos testing."));
    console.log(chalk.dim("Usage: inspect chaos <url>"));
    process.exit(1);
  }

  const duration = parseInt(options.duration ?? "30", 10);
  const fpsThreshold = parseInt(options.fpsThreshold ?? "10", 10);
  const maxErrors = parseInt(options.maxErrors ?? "50", 10);
  const species = options.species
    ? options.species.split(",").map((s) => s.trim())
    : ["clicker", "typer", "scroller", "formFiller"];

  console.log(chalk.blue("\nChaos Testing\n"));
  console.log(chalk.dim(`URL: ${url}`));
  console.log(chalk.dim(`Duration: ${duration}s`));
  console.log(chalk.dim(`Species: ${species.join(", ")}`));
  console.log(chalk.dim(`FPS threshold: ${fpsThreshold}`));

  try {
    // Launch browser
    console.log(chalk.dim("\nLaunching browser..."));
    const { BrowserManager } = await import("@inspect/browser");
    const browserMgr = new BrowserManager();
    await browserMgr.launchBrowser({
      headless: !(options.headed ?? false),
      viewport: { width: 1920, height: 1080 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const page = await browserMgr.newPage();

    console.log(chalk.dim(`Navigating to ${url}...`));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Run chaos engine
    console.log(chalk.dim("Starting chaos testing...\n"));
    const { ChaosEngine } = await import("@inspect/chaos");
    const engine = new ChaosEngine();

    const startTime = Date.now();
    const report = await engine.unleash(page, {
      species: species as Array<"clicker" | "typer" | "scroller" | "formFiller" | "toucher">,
      count: Math.round(duration * 10),
      delay: 100,
      fpsThreshold,
      maxErrors,
      showMarkers: options.headed ?? false,
      onInteraction: (index: number) => {
        if (index % 50 === 0) {
          process.stdout.write(chalk.dim(`  ${index} interactions...\r`));
        }
      },
      onError: (error: Error) => {
        console.log(chalk.yellow(`  Error: ${error.message.slice(0, 100)}`));
      },
    });
    const elapsed = Date.now() - startTime;

    const interactions = report.interactions ?? 0;
    const errors = report.errors ?? [];
    const fpsDrops = report.fpsDrops ?? [];
    const consoleErrors = report.consoleErrors ?? [];

    if (options.json) {
      const data = {
        interactions,
        elapsed,
        errors: errors.map((e: unknown) =>
          typeof e === "string" ? e : ((e as { message?: string }).message ?? String(e)),
        ),
        consoleErrors,
        fpsDrops,
        passed: errors.length === 0 && fpsDrops.length === 0,
      };
      process.stdout.write(JSON.stringify(data, null, 2) + "\n");
      await browserMgr.closeBrowser();
      return;
    }

    // Display results
    console.log(chalk.dim("\n─────────────────────────────────────────\n"));

    console.log(chalk.bold("Chaos Test Results:\n"));
    console.log(`  Interactions:   ${interactions}`);
    console.log(`  Duration:       ${(elapsed / 1000).toFixed(1)}s`);
    console.log(
      `  JS Errors:      ${errors.length > 0 ? chalk.red(String(errors.length)) : chalk.green("0")}`,
    );
    console.log(
      `  Console Errors: ${consoleErrors.length > 0 ? chalk.yellow(String(consoleErrors.length)) : chalk.green("0")}`,
    );
    console.log(
      `  FPS Drops:      ${fpsDrops.length > 0 ? chalk.red(String(fpsDrops.length)) : chalk.green("0")}`,
    );

    if (errors.length > 0) {
      console.log(chalk.red("\n  JavaScript Errors:"));
      for (const err of errors.slice(0, 10)) {
        const msg =
          typeof err === "string" ? err : ((err as { message?: string }).message ?? String(err));
        console.log(chalk.dim(`    - ${msg.slice(0, 120)}`));
      }
      if (errors.length > 10) {
        console.log(chalk.dim(`    ... and ${errors.length - 10} more`));
      }
    }

    if (fpsDrops.length > 0) {
      console.log(chalk.yellow("\n  FPS Drops (below threshold):"));
      for (const drop of fpsDrops.slice(0, 5)) {
        const d = drop as { fps?: number; timestamp?: number };
        console.log(chalk.dim(`    - ${d.fps ?? "?"} FPS at ${d.timestamp ?? "?"}ms`));
      }
    }

    const passed = errors.length === 0 && fpsDrops.length === 0;
    console.log(`\n  Result: ${passed ? chalk.green("PASS") : chalk.red("FAIL")}\n`);

    await browserMgr.closeBrowser();

    if (!passed) {
      process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nError: ${msg}`));
    process.exit(1);
  }
}

export function registerChaosCommand(program: Command): void {
  program
    .command("chaos")
    .description("Run chaos/monkey testing on a web page")
    .argument("[url]", "URL to test")
    .option("--duration <seconds>", "Test duration in seconds", "30")
    .option("--species <types>", "Gremlin species: clicker,typer,scroller,formFiller,toucher")
    .option("--fps-threshold <fps>", "FPS drop threshold for failure", "10")
    .option("--max-errors <count>", "Max JS errors before stopping", "50")
    .option("--headed", "Run browser in headed mode")
    .option("--json", "Output as JSON")
    .action(async (url: string | undefined, opts: ChaosOptions) => {
      await runChaos(url, opts);
    });
}
