import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

export interface VisualExportOptions {
  format: string;
  output?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  NOT_FOUND: 2,
} as const;

async function runVisualExport(
  planId: string | undefined,
  options: VisualExportOptions,
): Promise<void> {
  if (!planId) {
    console.error(chalk.red("Error: Plan ID is required."));
    console.log(chalk.dim("Usage: inspect visual:export <id>"));
    process.exit(EXIT_CODES.ERROR);
  }

  const format = options.format ?? "json";
  if (!["playwright", "json"].includes(format)) {
    console.error(chalk.red(`Error: Invalid format "${format}". Use "playwright" or "json".`));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Visual Export\n"));
  console.log(chalk.dim(`Plan ID: ${planId}`));
  console.log(chalk.dim(`Format: ${format}`));

  try {
    const outputPath = options.output
      ? resolve(options.output)
      : resolve(`.inspect/visual/${planId}.${format === "playwright" ? "spec.ts" : "json"}`);

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    let content = "";
    if (format === "playwright") {
      content = `import { test, expect } from '@playwright/test';

test('${planId}', async ({ page }) => {
  // Generated from visual builder
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});`;
    } else {
      content = JSON.stringify(
        {
          id: planId,
          steps: [],
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      );
    }

    writeFileSync(outputPath, content, "utf-8");

    if (options.json) {
      console.log(JSON.stringify({ planId, format, outputPath }, null, 2));
    } else {
      console.log(chalk.green(`\nExported to: ${outputPath}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nExport failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerVisualExportCommand(program: Command): void {
  program
    .command("visual:export")
    .description("Export visual plan")
    .argument("<id>", "Plan ID")
    .requiredOption("--format <format>", "Export format: playwright, json")
    .option("-o, --output <path>", "Output file path")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect visual:export abc123 --format playwright
  $ inspect visual:export abc123 --format json --output ./plan.json
`,
    )
    .action(async (id: string | undefined, opts: VisualExportOptions) => {
      await runVisualExport(id, opts);
    });
}
