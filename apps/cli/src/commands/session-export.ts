import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { SessionRecording } from "@inspect/shared";

export interface SessionExportOptions {
  format: string;
  output?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  SESSION_NOT_FOUND: 2,
  INVALID_FORMAT: 3,
} as const;

async function runSessionExport(
  sessionId: string | undefined,
  options: SessionExportOptions,
): Promise<void> {
  if (!sessionId) {
    console.error(chalk.red("Error: Session ID is required."));
    console.log(chalk.dim("Usage: inspect session:export <id> --format <html|json>"));
    process.exit(EXIT_CODES.ERROR);
  }

  const format = options.format ?? "json";
  if (!["html", "json"].includes(format)) {
    console.error(chalk.red(`Error: Invalid format "${format}". Use "html" or "json".`));
    process.exit(EXIT_CODES.INVALID_FORMAT);
  }

  console.log(chalk.blue("\nInspect Session Export\n"));
  console.log(chalk.dim(`Session ID: ${sessionId}`));
  console.log(chalk.dim(`Format: ${format}`));

  try {
    const sessionPath = resolve(`.inspect/recordings/${sessionId}.json`);
    if (!existsSync(sessionPath)) {
      console.error(chalk.red(`Error: Session not found: ${sessionId}`));
      console.error(chalk.dim(`Looked for: ${sessionPath}`));
      process.exit(EXIT_CODES.SESSION_NOT_FOUND);
    }

    const sessionData = readFileSync(sessionPath, "utf-8");
    const session: SessionRecording = JSON.parse(sessionData);

    const outputPath = options.output
      ? resolve(options.output)
      : resolve(`.inspect/exports/session-${sessionId}.${format}`);

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    console.log(chalk.dim("\nExporting session..."));

    if (format === "html") {
      const { SessionRecorder } = await import("@inspect/browser");
      const recorder = new SessionRecorder();
      recorder.generateHTMLViewer(session.events, outputPath);
    } else {
      writeFileSync(outputPath, JSON.stringify(session, null, 2), "utf-8");
    }

    const duration = session.endTime ? Math.round((session.endTime - session.startTime) / 1000) : 0;

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            sessionId,
            format,
            outputPath,
            events: session.events?.length ?? 0,
            duration,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(chalk.green(`\nSession exported to: ${outputPath}`));
      console.log(chalk.dim(`Events: ${session.events?.length ?? 0}`));
      console.log(chalk.dim(`Duration: ${duration}s`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nExport failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerSessionExportCommand(program: Command): void {
  program
    .command("session:export")
    .description("Export session to HTML or JSON")
    .argument("<id>", "Session ID")
    .requiredOption("--format <format>", "Export format: html, json")
    .option("-o, --output <path>", "Output file path")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect session:export abc123 --format html
  $ inspect session:export abc123 --format json --output ./my-session.json
  $ inspect session:export abc123 --format html -o report.html
`,
    )
    .action(async (id: string | undefined, opts: SessionExportOptions) => {
      await runSessionExport(id, opts);
    });
}
