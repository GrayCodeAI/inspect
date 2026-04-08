import type { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page, type BrowserContext } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RECORDING_DIR = join(__dirname, "..", "..", "..", "recordings");

interface SessionInfo {
  name: string;
  eventCount: number;
  sizeKb: number;
  path: string;
}

function join(...paths: string[]): string {
  return resolve(...paths);
}

function listSessions(dir: string): SessionInfo[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const sessions: SessionInfo[] = [];

  for (const file of files) {
    const fullPath = resolve(dir, file);
    const stat = statSync(fullPath);
    try {
      const content = JSON.parse(readFileSync(fullPath, "utf-8"));
      const eventCount = Array.isArray(content) ? content.length : (content.events?.length ?? 0);
      sessions.push({
        name: file.replace(/\.json$/, ""),
        eventCount,
        sizeKb: Math.round(stat.size / 1024),
        path: fullPath,
      });
    } catch {
      // skip unparsable files
    }
  }

  return sessions;
}

async function exportSessionToHtml(sessionFile: string, outputPath?: string): Promise<string | null> {
  let events: unknown[];
  try {
    const content = readFileSync(sessionFile, "utf-8");
    const parsed = JSON.parse(content);
    events = Array.isArray(parsed) ? parsed : (parsed.events ?? []);
  } catch (cause) {
    console.error(chalk.red(`Failed to read session file: ${String(cause)}`));
    return null;
  }

  const sessionId = sessionFile.split("/").pop() ?? "session";
  const eventsJson = JSON.stringify(events);
  const html = [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="UTF-8">',
    `<title>Session Replay - ${sessionId}</title>`,
    "<style>",
    "html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }",
    "#replay-container { width: 100%; height: 100%; }",
    "</style>",
    "</head>",
    "<body>",
    '<div id="replay-container"></div>',
    '<script src="https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.18/dist/index.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/index.js"></script>',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/style.css">',
    "<script>",
    `const events = ${eventsJson};`,
    "new rrwebPlayer({",
    "  target: document.getElementById('replay-container'),",
    "  props: { events, width: window.innerWidth, height: window.innerHeight }",
    "});",
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");

  const out = outputPath || sessionFile.replace(/\.json$/, ".html");
  writeFileSync(out, html, "utf-8");
  return out;
}

async function recordAction(options: RecordOptions): Promise<void> {
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
    url: "https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.18/dist/rrweb.min.js",
  });

  // Wait for rrweb to load
  await context.waitForFunction(() => {
    return typeof window !== "undefined" && !!(window as any).rrweb;
  }, { timeout: 5000 });

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
      await new Promise((resolve) => setTimeout(resolve, 1000)); // small delay
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
  return [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="UTF-8">',
    `<title>Session Replay</title>`,
    "<script src=\"https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.18/dist/rrweb.min.js\"></script>",
    '<script src="https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/index.js\"></script>',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/style.css">',
    "<style>",
    "html, body { margin: 0; padding: 20px; font-family: sans-serif; }",
    "#player { width: 100%; max-width: 1200px; margin: 0 auto; }",
    "</style>",
    "</head>",
    "<body>",
    '<div id="player"></div>',
    "<script>",
    `const events = ${JSON.stringify(events)};`,
    "new rrwebPlayer({",
    "  target: document.getElementById('player'),",
    "  props: { events, width: 1280, height: 720 }",
    "});",
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");
}

export function registerSessionRecordCommand(program: Command): void {
  const sessionCmd = program
    .command("session")
    .description("Session recording and replay commands");

  sessionCmd
    .command("record")
    .description("Start a new session recording")
    .requiredOption("--url <url>", "URL to record")
    .option("--output <path>", "Output file path", join(RECORDING_DIR, `session-${Date.now()}.json`))
    .option("--manual", "Interactive mode (press Enter to stop)")
    .option("--width <pixels>", "Viewport width", "1280")
    .option("--height <pixels>", "Viewport height", "720")
    .action(async (options) => {
      await recordAction(options);
    });

  sessionCmd
    .command("replay")
    .description("Replay a recorded session")
    .argument("<session-file>", "Path to session recording file")
    .option("-p, --port <port>", "Port for replay server", "3000")
    .action(async (sessionFile, options) => {
      const filePath = resolve(sessionFile);
      const port = parseInt(options.port, 10);

      if (!existsSync(filePath)) {
        console.error(chalk.red(`Session file not found: ${filePath}`));
        process.exit(1);
      }

      const htmlPath = await exportSessionToHtml(filePath);
      if (htmlPath) {
        console.log(chalk.green(`\nReplay exported to: ${htmlPath}`));
        console.log(chalk.dim(`Open in browser to replay the session`));
      }
    });

  sessionCmd
    .command("export")
    .description("Export session to HTML replay")
    .argument("<session-file>", "Path to session recording file")
    .option("-o, --output <path>", "Output HTML file path")
    .action(async (sessionFile, options) => {
      const filePath = resolve(sessionFile);

      if (!existsSync(filePath)) {
        console.error(chalk.red(`Session file not found: ${filePath}`));
        process.exit(1);
      }

      const outputPath = options.output || filePath.replace(/\.json$/, ".html");
      const htmlPath = await exportSessionToHtml(filePath, outputPath);
      if (htmlPath) {
        console.log(chalk.green(`\nSession exported to: ${htmlPath}`));
      }
    });

  sessionCmd
    .command("list")
    .description("List recorded sessions")
    .option("-d, --dir <directory>", "Sessions directory", RECORDING_DIR)
    .action(async (options) => {
      const dir = resolve(options.dir);

      if (!existsSync(dir)) {
        console.log(chalk.yellow(`\nNo sessions directory found: ${dir}`));
        return;
      }

      const sessions = listSessions(dir);

      if (sessions.length === 0) {
        console.log(chalk.yellow("\nNo recorded sessions found"));
        return;
      }

      console.log(chalk.blue(`\nRecorded Sessions (${sessions.length} total)\n`));

      for (const session of sessions) {
        console.log(chalk.bold(session.name));
        console.log(chalk.dim(`  Events: ${session.eventCount} | Size: ${session.sizeKb}KB`));
        console.log(chalk.dim(`  File: ${session.path}\n`));
      }
    });
}

      const htmlPath = await exportSessionToHtml(filePath);
      if (htmlPath) {
        console.log(chalk.green(`\nReplay exported to: ${htmlPath}`));
        console.log(chalk.dim(`Open in browser or run \`npx serve -p ${port} ${htmlPath}\``));
      }
    });

  sessionCmd
    .command("export")
    .description("Export session to HTML replay")
    .argument("<session-file>", "Path to session recording file")
    .option("-o, --output <path>", "Output HTML file path")
    .action(async (sessionFile, options) => {
      const filePath = resolve(sessionFile);

      if (!existsSync(filePath)) {
        console.error(chalk.red(`\nSession file not found: ${filePath}`));
        process.exit(1);
      }

      const outputPath = options.output || filePath.replace(/\.json$/, ".html");

      const htmlPath = await exportSessionToHtml(filePath, outputPath);
      if (htmlPath) {
        console.log(chalk.green(`\nSession exported to: ${htmlPath}`));
      }
    });

  sessionCmd
    .command("list")
    .description("List recorded sessions")
    .option("-d, --dir <directory>", "Sessions directory", "./sessions")
    .action(async (options) => {
      const dir = resolve(options.dir);

      if (!existsSync(dir)) {
        console.log(chalk.yellow(`\nNo sessions directory found: ${dir}`));
        return;
      }

      const sessions = listSessions(dir);

      if (sessions.length === 0) {
        console.log(chalk.yellow("\nNo recorded sessions found"));
        return;
      }

      console.log(chalk.blue(`\nRecorded Sessions (${sessions.length} total)\n`));

      for (const session of sessions) {
        console.log(chalk.bold(session.name));
        console.log(chalk.dim(`  Events: ${session.eventCount} | Size: ${session.sizeKb}KB`));
        console.log(chalk.dim(`  File: ${session.path}`));
      }
    });
}

interface SessionInfo {
  name: string;
  eventCount: number;
  sizeKb: number;
  path: string;
}

function listSessions(dir: string): SessionInfo[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const sessions: SessionInfo[] = [];

  for (const file of files) {
    const fullPath = resolve(dir, file);
    const stat = statSync(fullPath);
    try {
      const content = JSON.parse(readFileSync(fullPath, "utf-8"));
      const eventCount = Array.isArray(content) ? content.length : (content.events?.length ?? 0);
      sessions.push({
        name: file.replace(/\.json$/, ""),
        eventCount,
        sizeKb: Math.round(stat.size / 1024),
        path: fullPath,
      });
    } catch {
      // skip unparsable files
    }
  }

  return sessions;
}

async function exportSessionToHtml(
  sessionFile: string,
  outputPath?: string,
): Promise<string | null> {
  let events: unknown[];
  try {
    const content = readFileSync(sessionFile, "utf-8");
    const parsed = JSON.parse(content);
    events = Array.isArray(parsed) ? parsed : (parsed.events ?? []);
  } catch (cause) {
    console.error(chalk.red(`Failed to read session file: ${String(cause)}`));
    return null;
  }

  const sessionId = sessionFile.split("/").pop() ?? "session";
  const eventsJson = JSON.stringify(events);
  const html = [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="UTF-8">',
    `<title>Session Replay - ${sessionId}</title>`,
    "<style>",
    "html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }",
    "#replay-container { width: 100%; height: 100%; }",
    "</style>",
    "</head>",
    "<body>",
    '<div id="replay-container"></div>',
    '<script src="https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/index.js"></script>',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/style.css">',
    "<script>",
    `const events = ${eventsJson};`,
    "new rrwebPlayer({",
    "  target: document.getElementById('replay-container'),",
    "  props: { events, width: window.innerWidth, height: window.innerHeight }",
    "});",
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");

  const out = outputPath || sessionFile.replace(/\.json$/, ".html");
  writeFileSync(out, html, "utf-8");
  return out;
}
