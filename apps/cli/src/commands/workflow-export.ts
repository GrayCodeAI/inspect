import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

export interface WorkflowExportOptions {
  format: string;
  output?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  NOT_FOUND: 2,
  INVALID_FORMAT: 3,
} as const;

async function runWorkflowExport(
  workflowId: string | undefined,
  options: WorkflowExportOptions,
): Promise<void> {
  if (!workflowId) {
    console.error(chalk.red("Error: Workflow ID is required."));
    console.log(chalk.dim("Usage: inspect workflow:export <id>"));
    process.exit(EXIT_CODES.ERROR);
  }

  const format = options.format ?? "yaml";
  if (!["yaml", "typescript"].includes(format)) {
    console.error(chalk.red(`Error: Invalid format "${format}". Use "yaml" or "typescript".`));
    process.exit(EXIT_CODES.INVALID_FORMAT);
  }

  console.log(chalk.blue("\nInspect Workflow Export\n"));
  console.log(chalk.dim(`Workflow ID: ${workflowId}`));
  console.log(chalk.dim(`Format: ${format}`));

  try {
    const workflowPath = resolve(`.inspect/workflows/${workflowId}.json`);
    if (!existsSync(workflowPath)) {
      console.error(chalk.red(`Error: Workflow not found: ${workflowId}`));
      process.exit(EXIT_CODES.NOT_FOUND);
    }

    const workflowData = JSON.parse(readFileSync(workflowPath, "utf-8"));

    const outputPath = options.output
      ? resolve(options.output)
      : resolve(`.inspect/workflows/${workflowId}.${format === "typescript" ? "ts" : "yaml"}`);

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    let content = "";
    if (format === "typescript") {
      content = `import { test, expect } from "@playwright/test";

test("${workflowData.name ?? "workflow"}", async ({ page }) => {
  // Exported from workflow: ${workflowId}
  await page.goto("${workflowData.url ?? "about:blank"}");
});`;
    } else {
      content = `name: ${workflowData.name ?? "workflow"}
id: ${workflowId}
url: ${workflowData.url ?? ""}
steps: []`;
    }

    writeFileSync(outputPath, content, "utf-8");

    if (options.json) {
      console.log(JSON.stringify({ workflowId, format, outputPath }, null, 2));
    } else {
      console.log(chalk.green(`\nExported to: ${outputPath}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nExport failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerWorkflowExportCommand(program: Command): void {
  program
    .command("workflow:export")
    .description("Export workflow")
    .argument("<id>", "Workflow ID")
    .requiredOption("--format <format>", "Export format: yaml, typescript")
    .option("-o, --output <path>", "Output file path")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect workflow:export wf-123 --format yaml
  $ inspect workflow:export wf-123 --format typescript --output ./test.spec.ts
`,
    )
    .action(async (id: string | undefined, opts: WorkflowExportOptions) => {
      await runWorkflowExport(id, opts);
    });
}
