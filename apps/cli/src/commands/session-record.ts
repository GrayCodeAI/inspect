import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { chromium } from "playwright";
import { SessionRecorder } from "@inspect/browser";
import { createInterface } from "node:readline";

const waitForEnter = (prompt: string): Promise<void> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
};

export function registerSessionRecordCommand(program: Command): void {
  const sessionCmd = program
    .command("session")
    .description("Session recording and replay commands");

  sessionCmd
    .command("record")
    .description("Start a new session recording")
    .option("-u, --url <url>", "URL to record", "https://example.com")
    .option("-o, --output <path>", "Output file path", "./sessions/recording.json")
    .option("-n, --name <name>", "Session name")
    .option("--max-events <number>", "Maximum events to record", "10000")
    .option("--mask-passwords", "Mask password inputs", true)
    .option("--manual", "Interactive mode (press Enter to stop)", false)
    .option("--headed", "Show browser window", true)
    .action(async (options) => {
      console.log(chalk.blue("\n🎬 Starting Session Recording\n"));
      console.log(chalk.dim(`URL: ${options.url}`));
      console.log(chalk.dim(`Output: ${options.output}`));
      console.log(chalk.dim(`Mode: ${options.manual ? "manual (interactive)" : "timed (30s)"}\n`));

      const browser = await chromium.launch({ headless: !options.headed });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();

      const recorder = new SessionRecorder();

      try {
        // Start recording
        await recorder.startRecording(page);
        console.log(chalk.green("✓ Recording started"));

        // Navigate to URL
        await page.goto(options.url, { waitUntil: "domcontentloaded" });
        console.log(chalk.green(`✓ Navigated to ${options.url}`));

        if (options.manual) {
          console.log(chalk.yellow("\n🎥 Recording in progress..."));
          console.log(
            chalk.dim("Interact with the browser, then press Enter to stop recording.\n"),
          );
          await waitForEnter("");
        } else {
          console.log(chalk.yellow("\n🎥 Recording for 30 seconds..."));
          await new Promise((resolve) => setTimeout(resolve, 30_000));
        }

        // Stop recording
        const events = await recorder.stopRecording(page);
        console.log(chalk.green(`\n✓ Recording stopped (${events.length} events captured)`));

        // Save recording
        mkdirSync(dirname(options.output), { recursive: true });
        const recordingPath = recorder.saveReplay(
          options.name || "session",
          events,
          dirname(options.output),
        );
        console.log(chalk.green(`✓ Recording saved: ${recordingPath}`));

        // Generate HTML replay
        const htmlPath = recordingPath.replace(/\.json$/, ".html");
        recorder.generateHTMLViewer(events, htmlPath);
        console.log(chalk.green(`✓ Replay viewer: ${htmlPath}`));
        console.log(chalk.dim(`\nOpen ${htmlPath} in a browser to replay the session.`));
      } catch (error) {
        console.error(chalk.red(`\n✗ Recording failed: ${error}`));
        process.exit(1);
      } finally {
        await browser.close();
      }
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
        console.log(chalk.green(`\n✓ Replay exported to: ${htmlPath}`));
        console.log(chalk.dim(`Open in browser or run: npx serve -p ${port} ${dirname(htmlPath)}`));
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
        console.log(chalk.green(`\n✓ Session exported to: ${htmlPath}`));
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

      console.log(chalk.blue(`\n📹 Recorded Sessions (${sessions.length} total)\n`));

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
