import type { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface RecordOptions {
  url: string;
  output: string;
  device?: string;
  width?: string;
  height?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  BROWSER_ERROR: 2,
} as const;

async function runRecord(options: RecordOptions): Promise<void> {
  if (!options.url) {
    console.error(chalk.red("Error: URL is required. Use --url <url>"));
    process.exit(EXIT_CODES.ERROR);
  }

  if (!options.output) {
    console.error(chalk.red("Error: Output file is required. Use --output <file>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Record\n"));
  console.log(chalk.dim(`URL: ${options.url}`));
  console.log(chalk.dim(`Output: ${options.output}`));

  try {
    const { SessionRecorder } = await import("@inspect/browser");
    const { BrowserManager } = await import("@inspect/browser");

    const width = options.width ? parseInt(options.width, 10) : 1920;
    const height = options.height ? parseInt(options.height, 10) : 1080;

    console.log(chalk.dim("\nInitializing browser..."));
    const browserManager = new BrowserManager();
    const _context = await browserManager.launchBrowser({
      name: "recording-session",
      headless: false,
      viewport: { width, height },
    });

    const page = await browserManager.newPage();
    await page.goto(options.url, { waitUntil: "networkidle" });

    console.log(chalk.dim("Starting recording session..."));
    console.log(chalk.dim("Press Ctrl+C to stop recording\n"));

    const outputDir = dirname(resolve(options.output));
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const recorder = new SessionRecorder();
    await recorder.startRecording(page);

    process.on("SIGINT", async () => {
      console.log(chalk.dim("\n\nStopping recording..."));
      const events = await recorder.stopRecording(page);
      const outputPath = recorder.saveReplay("record", events, outputDir);
      await browserManager.closeBrowser();
      console.log(chalk.green(`Recording saved to: ${outputPath}`));
      process.exit(EXIT_CODES.SUCCESS);
    });

    await new Promise(() => {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nRecording failed: ${message}`));
    process.exit(EXIT_CODES.BROWSER_ERROR);
  }
}

export function registerRecordCommand(program: Command): void {
  program
    .command("record")
    .description("Record a browser session")
    .requiredOption("--url <url>", "URL to record")
    .requiredOption("--output <file>", "Output file path")
    .option("--device <device>", "Device preset to use")
    .option("--width <pixels>", "Viewport width", "1920")
    .option("--height <pixels>", "Viewport height", "1080")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect record --url https://example.com --output session.json
  $ inspect record --url https://app.com --output mobile.json --device iphone-15
  $ inspect record --url https://app.com --output custom.json --width 1440 --height 900
`,
    )
    .action(async (opts: RecordOptions) => {
      await runRecord(opts);
    });
}
