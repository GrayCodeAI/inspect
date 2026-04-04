import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function registerSessionRecordCommand(program: Command): void {
  const sessionCmd = program
    .command("session")
    .description("Session recording and replay commands");

  sessionCmd
    .command("record")
    .description("Start a new session recording")
    .option("-u, --url <url>", "URL to start recording from", "about:blank")
    .option("-o, --output <path>", "Output directory for recording", "./sessions")
    .option("-n, --name <name>", "Session name")
    .option("--max-events <number>", "Maximum events to record", "10000")
    .option("--mask-passwords", "Mask password inputs", true)
    .action(async (options) => {
      console.log(chalk.blue("\nSession recording initiated\n"));
      console.log(chalk.dim(`URL: ${options.url}`));
      console.log(chalk.dim(`Output: ${options.output}`));
      console.log(chalk.yellow("Session recording requires browser automation via the CLI TUI."));
      console.log(chalk.dim("Run `inspect test` with recording enabled to capture a session."));
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
