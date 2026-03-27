import type { Command } from "commander";
import chalk from "chalk";

export interface TrackOptions {
  interval?: string;
  output?: string;
  webhook?: string;
}

async function runTrack(urls: string[] | undefined, options: TrackOptions): Promise<void> {
  if (!urls || urls.length === 0) {
    console.error(chalk.red("Error: At least one URL is required for tracking."));
    console.log(chalk.dim("Usage: inspect track <url1> [url2...] --interval 60"));
    process.exit(1);
  }

  console.log(chalk.blue("\nInspect Change Tracker\n"));
  console.log(chalk.dim(`URLs: ${urls.join(", ")}`));
  console.log(chalk.dim(`Interval: ${options.interval ?? "60"}s`));

  try {
    const { ChangeTracker } = await import("@inspect/data");

    const tracker = new ChangeTracker({
      urls,
      interval: parseInt(options.interval ?? "60", 10) * 1000,
      onDiff: (diff) => {
        const changes = diff.added.length + diff.removed.length + diff.modified.length;
        if (changes > 0) {
          console.log(chalk.yellow(`\n  [${diff.url}] Changes detected:`));
          console.log(
            chalk.dim(
              `    Added: ${diff.added.length}, Removed: ${diff.removed.length}, Modified: ${diff.modified.length}`,
            ),
          );
          console.log(chalk.dim(`    Similarity: ${(diff.similarity * 100).toFixed(1)}%`));
        }
      },
    });

    // Take initial snapshots
    console.log(chalk.dim("\nTaking initial snapshots..."));
    await tracker.snapshotAll();
    console.log(chalk.green("Initial snapshots taken."));

    // Start monitoring
    console.log(chalk.dim(`\nMonitoring for changes every ${options.interval ?? "60"}s...`));
    console.log(chalk.dim("Press Ctrl+C to stop.\n"));

    tracker.startMonitoring();

    // Keep process alive
    process.on("SIGINT", async () => {
      tracker.stopMonitoring();
      console.log(chalk.green("\n\nMonitoring stopped."));

      // Show summary
      for (const url of urls) {
        const diffs = tracker.getDiffs(url);
        console.log(chalk.dim(`  ${url}: ${diffs.length} change(s) detected`));
      }

      if (options.output) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(options.output, tracker.export(), "utf-8");
        console.log(chalk.green(`\nData saved to: ${options.output}`));
      }

      process.exit(0);
    });

    // Keep alive
    await new Promise(() => {});
  } catch (error) {
    console.error(
      chalk.red(`\nTracking failed: ${error instanceof Error ? error.message : String(error)}`),
    );
    process.exit(1);
  }
}

export function registerTrackCommand(program: Command): void {
  program
    .command("track")
    .description("Monitor pages for content changes")
    .argument("[urls...]", "URLs to monitor")
    .option("--interval <seconds>", "Check interval in seconds (default: 60)")
    .option("-o, --output <path>", "Save tracking data to file")
    .option("--webhook <url>", "Webhook URL for change notifications")
    .action(runTrack);
}
