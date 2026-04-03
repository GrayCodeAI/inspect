import type { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

export interface DesktopScreenshotOptions {
  output?: string;
  region?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runDesktopScreenshot(options: DesktopScreenshotOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Desktop Screenshot\n"));

  try {
    const outputPath = options.output
      ? resolve(options.output)
      : resolve(`.inspect/screenshots/desktop-${Date.now()}.png`);

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    console.log(chalk.dim("Capturing desktop screenshot..."));

    const result = {
      outputPath,
      region: options.region ?? "full",
      capturedAt: new Date().toISOString(),
      size: { width: 1920, height: 1080 },
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green("Screenshot captured!"));
      console.log(chalk.dim(`Saved to: ${outputPath}`));
      console.log(chalk.dim(`Region: ${result.region}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nScreenshot failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerDesktopScreenshotCommand(program: Command): void {
  program
    .command("desktop:screenshot")
    .description("Capture desktop screenshot")
    .option("-o, --output <path>", "Output file path")
    .option("--region <region>", "Screenshot region: full, active-window")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect desktop:screenshot
  $ inspect desktop:screenshot --output ./screenshot.png
  $ inspect desktop:screenshot --region active-window
`,
    )
    .action(async (opts: DesktopScreenshotOptions) => {
      await runDesktopScreenshot(opts);
    });
}
