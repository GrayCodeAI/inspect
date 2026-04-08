import type { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page, type BrowserContext } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RECORDING_DIR = join(__dirname, "..", "..", "..", "recordings");

interface RecordOptions {
  url?: string;
  script?: string;
  manual?: boolean;
  output?: string;
  device?: string;
  width?: number;
  height?: number;
}

const waitForEnter = (prompt: string): Promise<void> => {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    readline.question(prompt, () => {
      readline.close();
      resolve();
    });
  });
};

async function runRecord(options: RecordOptions): Promise<void> {
  if (!options.url && !options.script) {
    console.error(chalk.red("Error: Either a URL or a script file is required."));
    process.exit(1);
  }

  const output = options.output || join(RECORDING_DIR, `session-${Date.now()}.json`);
  mkdirSync(dirname(output), { recursive: true });

  console.log(chalk.blue("\nInspect Record\n"));
  if (options.url) console.log(chalk.dim(`URL: ${options.url}`));
  if (options.script) console.log(chalk.dim(`Script: ${options.script}`));
  console.log(chalk.dim(`Output: ${output}`));
  console.log(chalk.dim(`Mode: ${options.manual ? "manual (interactive)" : "scripted"}\n`));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1280, height: options.height ?? 720 },
  });

  // Inject runtime script to expose recording functions
  await context.addInitScript({
    content: `
      if (!window.__INSPECT_RUNTIME__) {
        window.__INSPECT_RUNTIME__ = {
          events: [],
          startRecording: () => {},
          stopRecording: () => {},
          getEvents: () => [],
        };
      }
    `,
  });

  // Load rrweb from CDN
  await context.addScriptTag({
    url: "https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb.min.js",
  });

  // Wait for rrweb to load
  await context.waitForFunction(
    () => {
      return typeof window !== "undefined" && !!(window as any).rrweb;
    },
    { timeout: 5000 },
  );

  // Start rrweb recording
  await context.evaluate(() => {
    const runtime = window.__INSPECT_RUNTIME__;
    runtime.events = [];
    runtime.startRecording = () => {
      if ((window as any).rrweb) {
        (window as any).rrwebRecord = (window as any).rrweb.record({
          emit(event) {
            runtime.events.push(event);
          },
          maskAllInputs: true,
          blockClass: "rr-block",
          ignoreClass: "rr-ignore",
          inlineStylesheet: true,
        });
      }
    };
    runtime.stopRecording = () => {
      if ((window as any).rrwebRecord) {
        (window as any).rrwebRecord();
        delete (window as any).rrwebRecord;
      }
    };
    runtime.getEvents = () => runtime.events;
    runtime.startRecording();
  });

  let page: Page;
  try {
    page = await context.newPage();
    if (options.url) {
      await page.goto(options.url, { waitUntil: "domcontentloaded" });
    }

    if (options.script) {
      console.log("Running script... (not implemented yet)");
      await page.waitForTimeout(5000);
    } else if (options.manual) {
      console.log("Recording started. Interact with the browser.");
      console.log("Press Enter when done to stop recording.\n");
      await waitForEnter("");
    } else {
      console.log("No script or manual mode specified. Recording for 30 seconds...\n");
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }

    // Stop recording and get events
    const events = await context.evaluate(() => {
      const runtime = window.__INSPECT_RUNTIME__;
      if (runtime.stopRecording) runtime.stopRecording();
      return runtime.getEvents ? runtime.getEvents() : [];
    });

    // Save events to file
    writeFileSync(output, JSON.stringify(events, null, 2));
    console.log(`\nRecording saved: ${output}`);

    // Generate HTML replay
    const replayHtml = generateReplayHtml(events);
    const replayPath = output.replace(/\.json$/, "-replay.html");
    writeFileSync(replayPath, replayHtml);
    console.log(`Replay generated: ${replayPath}`);
    console.log("Open the replay file in a browser to watch the session.");
  } finally {
    await browser.close();
  }
}

function generateReplayHtml(events: any[]): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Session Replay</title>
  <script src="https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/index.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/style.css" />
  <style>
    body { margin: 0; padding: 20px; font-family: sans-serif; }
    #player { width: 100%; max-width: 1200px; margin: 0 auto; }
  </style>
</head>
<body>
  <div id="player"></div>
  <script>
    const events = ${JSON.stringify(events)};
    new rrwebPlayer({
      target: document.getElementById('player'),
      props: { events, width: 1280, height: 720 }
    });
  </script>
</body>
</html>`;
}

export function registerRecordCommand(program: any): void {
  program
    .command("record")
    .description("Record a browser session with rrweb")
    .option("--url <url>", "URL to record (optional if script provided)")
    .option("--script <file>", "Script file to execute (JSON format)")
    .option("--manual", "Interactive mode (press Enter to stop)")
    .option("--output <path>", "Output file path (default: recordings/session-<timestamp>.json)")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect record --url https://example.com
  $ inspect record --url https://app.com --manual
  $ inspect record --script script.json --output my-session.json
  $ inspect record --url https://app.com --output session.json --width 1440 --height 900
`,
    )
    .action(async (opts: RecordOptions) => {
      await runRecord(opts);
    });
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
