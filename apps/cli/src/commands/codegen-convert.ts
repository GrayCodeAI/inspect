import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

export interface CodegenConvertOptions {
  format: string;
  output?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  NOT_FOUND: 2,
} as const;

async function runCodegenConvert(
  recording: string | undefined,
  options: CodegenConvertOptions,
): Promise<void> {
  if (!recording) {
    console.error(chalk.red("Error: Recording path is required."));
    console.log(chalk.dim("Usage: inspect codegen:convert <recording>"));
    process.exit(EXIT_CODES.ERROR);
  }

  const format = options.format ?? "playwright";
  if (!["playwright", "inspect"].includes(format)) {
    console.error(chalk.red(`Error: Invalid format "${format}". Use "playwright" or "inspect".`));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Codegen Convert\n"));
  console.log(chalk.dim(`Recording: ${recording}`));
  console.log(chalk.dim(`Format: ${format}`));

  try {
    const recordingPath = resolve(recording);
    if (!existsSync(recordingPath)) {
      console.error(chalk.red(`Error: Recording not found: ${recording}`));
      process.exit(EXIT_CODES.NOT_FOUND);
    }

    const outputPath = options.output
      ? resolve(options.output)
      : resolve(
          `.inspect/generated/test-${Date.now()}.${format === "playwright" ? "spec.ts" : "json"}`,
        );

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    let content = "";
    if (format === "playwright") {
      content = `import { test, expect } from '@playwright/test';

test('converted from recording', async ({ page }) => {
  // Converted from ${recording}
  await page.goto('about:blank');
});`;
    } else {
      content = JSON.stringify(
        {
          name: "converted-test",
          source: recording,
          steps: [],
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      );
    }

    writeFileSync(outputPath, content, "utf-8");

    if (options.json) {
      console.log(JSON.stringify({ recording, format, outputPath }, null, 2));
    } else {
      console.log(chalk.green(`\nConverted to: ${outputPath}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nConversion failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerCodegenConvertCommand(program: Command): void {
  program
    .command("codegen:convert")
    .description("Convert recording to test")
    .argument("<recording>", "Path to recording file")
    .requiredOption("--format <format>", "Output format: playwright, inspect")
    .option("-o, --output <path>", "Output file path")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect codegen:convert recording.json --format playwright
  $ inspect codegen:convert recording.json --format inspect --output ./test.json
`,
    )
    .action(async (recording: string | undefined, opts: CodegenConvertOptions) => {
      await runCodegenConvert(recording, opts);
    });
}
