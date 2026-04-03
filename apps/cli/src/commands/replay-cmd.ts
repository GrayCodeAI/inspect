import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { SessionRecording } from "@inspect/shared";

export interface ReplayCmdOptions {
  speed?: string;
  headed?: boolean;
  port?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  FILE_NOT_FOUND: 2,
  INVALID_FORMAT: 3,
} as const;

async function runReplayCmd(
  recordingFile: string | undefined,
  options: ReplayCmdOptions,
): Promise<void> {
  if (!recordingFile) {
    console.error(chalk.red("Error: Recording file is required."));
    console.log(chalk.dim("Usage: inspect replay <recording-file>"));
    process.exit(EXIT_CODES.ERROR);
  }

  const filePath = resolve(recordingFile);
  if (!existsSync(filePath)) {
    console.error(chalk.red(`Error: File not found: ${recordingFile}`));
    process.exit(EXIT_CODES.FILE_NOT_FOUND);
  }

  console.log(chalk.blue("\nInspect Replay\n"));
  console.log(chalk.dim(`File: ${recordingFile}`));
  console.log(chalk.dim(`Speed: ${options.speed ?? "1.0"}x`));
  console.log(chalk.dim(`Mode: ${options.headed ? "headed" : "headless"}`));

  try {
    const { SessionRecorder } = await import("@inspect/browser");

    console.log(chalk.dim("\nLoading recording..."));
    const content = readFileSync(filePath, "utf-8");
    const recording: SessionRecording = JSON.parse(content);

    const duration = recording.endTime
      ? Math.round((recording.endTime - recording.startTime) / 1000)
      : 0;

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            events: recording.events?.length ?? 0,
            duration,
            startTime: recording.startTime,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(chalk.dim(`Events: ${recording.events?.length ?? 0}`));
    console.log(chalk.dim(`Duration: ${duration}s`));
    console.log(chalk.dim(`Start Time: ${new Date(recording.startTime).toISOString()}\n`));

    const recorder = new SessionRecorder();
    const viewerDir = resolve(".inspect/replays");
    if (!existsSync(viewerDir)) {
      mkdirSync(viewerDir, { recursive: true });
    }

    const viewerPath = resolve(viewerDir, `replay-${Date.now()}.html`);
    recorder.generateHTMLViewer(recording.events, viewerPath);

    console.log(chalk.green(`Replay viewer generated: ${viewerPath}`));
    console.log(chalk.dim("Open this file in a browser to view the replay."));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nReplay failed: ${message}`));
    process.exit(EXIT_CODES.INVALID_FORMAT);
  }
}

export function registerReplayCmdCommand(program: Command): void {
  program
    .command("replay-cmd")
    .alias("replay")
    .description("Replay a recorded session")
    .argument("<recording-file>", "Path to recording file")
    .option("--speed <multiplier>", "Playback speed (default: 1.0)", "1.0")
    .option("--headed", "Run browser in headed mode")
    .option("--port <port>", "Port for replay viewer")
    .option("--json", "Output metadata as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect replay session.json
  $ inspect replay session.json --speed 2.0
  $ inspect replay session.json --headed
`,
    )
    .action(async (file: string | undefined, opts: ReplayCmdOptions) => {
      await runReplayCmd(file, opts);
    });
}
