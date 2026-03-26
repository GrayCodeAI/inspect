import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";

export interface SessionsOptions {
  id?: string;
  browser?: string;
  headed?: boolean;
  viewport?: string;
}

interface SessionInfo {
  id: string;
  browser: string;
  status: "active" | "idle" | "closed";
  createdAt: string;
  lastActivity: string;
  url?: string;
  viewport: { width: number; height: number };
  pid?: number;
}

const SESSIONS_DIR = resolve(".inspect/sessions");

function getSessionsFilePath(): string {
  return join(SESSIONS_DIR, "registry.json");
}

function loadSessions(): SessionInfo[] {
  const filePath = getSessionsFilePath();
  if (!existsSync(filePath)) return [];
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

function saveSessions(sessions: SessionInfo[]): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  writeFileSync(getSessionsFilePath(), JSON.stringify(sessions, null, 2), "utf-8");
}

async function runSessions(action: string, options: SessionsOptions): Promise<void> {
  switch (action) {
    case "list": {
      const sessions = loadSessions();
      console.log(chalk.blue("\nBrowser Sessions\n"));

      if (sessions.length === 0) {
        console.log(chalk.dim("  No active sessions."));
        console.log(chalk.dim('  Use "inspect sessions create" to start one.'));
      } else {
        console.log(
          "  " +
            "ID".padEnd(38) +
            "Browser".padEnd(12) +
            "Status".padEnd(10) +
            "Viewport".padEnd(14) +
            "Last Activity",
        );
        console.log("  " + "-".repeat(90));
        for (const session of sessions) {
          const statusColor =
            session.status === "active" ? chalk.green : session.status === "idle" ? chalk.yellow : chalk.dim;
          console.log(
            `  ${session.id.padEnd(38)} ${session.browser.padEnd(12)} ${statusColor(session.status.padEnd(10))} ${`${session.viewport.width}x${session.viewport.height}`.padEnd(14)} ${session.lastActivity}`,
          );
        }
      }
      console.log(`\n  ${sessions.length} session${sessions.length !== 1 ? "s" : ""}\n`);
      break;
    }

    case "create": {
      const browser = options.browser ?? "chromium";
      const viewportStr = options.viewport ?? "1920x1080";
      const [w, h] = viewportStr.split("x").map(Number);
      const viewport = { width: w || 1920, height: h || 1080 };

      console.log(chalk.blue("\nCreating browser session...\n"));
      console.log(chalk.dim(`Browser: ${browser}`));
      console.log(chalk.dim(`Viewport: ${viewport.width}x${viewport.height}`));

      try {
        const { BrowserManager } = await import("@inspect/browser");
        const browserMgr = new BrowserManager();
        await browserMgr.launchBrowser({
          headless: !(options.headed ?? false),
          viewport,
        } as any);

        const sessionId = randomUUID();
        const session: SessionInfo = {
          id: sessionId,
          browser,
          status: "active",
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          viewport,
          pid: process.pid,
        };

        const sessions = loadSessions();
        sessions.push(session);
        saveSessions(sessions);

        console.log(chalk.green(`\nSession created: ${sessionId}`));
        console.log(chalk.dim(`Use "inspect sessions attach --id ${sessionId}" to connect.`));
        console.log(chalk.dim("Press Ctrl+C to close this session.\n"));

        const shutdown = async () => {
          console.log(chalk.dim("\nClosing session..."));
          await browserMgr.closeBrowser();
          const updatedSessions = loadSessions().map((s) =>
            s.id === sessionId ? { ...s, status: "closed" as const, lastActivity: new Date().toISOString() } : s,
          );
          saveSessions(updatedSessions);
          console.log(chalk.dim("Session closed."));
          process.exit(0);
        };

        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);

        await new Promise(() => {});
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Failed to create session: ${msg}`));
        process.exit(1);
      }
      break;
    }

    case "attach": {
      if (!options.id) {
        console.error(chalk.red("Error: --id is required to attach to a session."));
        process.exit(1);
      }

      const sessions = loadSessions();
      const session = sessions.find((s) => s.id === options.id || s.id.startsWith(options.id!));

      if (!session) {
        console.error(chalk.red(`Session not found: ${options.id}`));
        process.exit(1);
      }

      if (session.status === "closed") {
        console.error(chalk.yellow(`Session ${session.id} is already closed.`));
        process.exit(1);
      }

      console.log(chalk.blue(`\nAttaching to session: ${session.id}\n`));
      console.log(chalk.dim(`Browser: ${session.browser}`));
      console.log(chalk.dim(`Created: ${session.createdAt}`));
      console.log(chalk.dim(`Status: ${session.status}`));

      // Update session activity
      const updatedSessions = sessions.map((s) =>
        s.id === session.id ? { ...s, status: "active" as const, lastActivity: new Date().toISOString() } : s,
      );
      saveSessions(updatedSessions);

      console.log(chalk.green("\nAttached. Session is ready for commands.\n"));
      break;
    }

    case "destroy": {
      if (!options.id) {
        console.error(chalk.red("Error: --id is required to destroy a session."));
        process.exit(1);
      }

      const sessions = loadSessions();
      const sessionIdx = sessions.findIndex((s) => s.id === options.id || s.id.startsWith(options.id!));

      if (sessionIdx === -1) {
        console.error(chalk.red(`Session not found: ${options.id}`));
        process.exit(1);
      }

      const session = sessions[sessionIdx];
      sessions.splice(sessionIdx, 1);
      saveSessions(sessions);

      console.log(chalk.green(`\nSession destroyed: ${session.id}`));
      console.log(chalk.dim(`Browser: ${session.browser}, Created: ${session.createdAt}\n`));
      break;
    }

    default:
      console.error(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.dim("Available actions: list, create, attach, destroy"));
      process.exit(1);
  }
}

export function registerSessionsCommand(program: Command): void {
  program
    .command("sessions")
    .description("Manage persistent browser sessions")
    .argument("<action>", "list | create | attach | destroy")
    .option("--id <id>", "Session ID (for attach/destroy)")
    .option("--browser <browser>", "Browser: chromium, firefox, webkit", "chromium")
    .option("--headed", "Run in headed browser mode")
    .option("--viewport <viewport>", "Viewport size: WIDTHxHEIGHT", "1920x1080")
    .action(async (action: string, opts: SessionsOptions) => {
      await runSessions(action, opts);
    });
}
