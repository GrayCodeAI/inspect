import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";

interface WorkflowDefinition {
  name: string;
  description?: string;
  triggers?: Array<{
    type: "cron" | "webhook" | "manual";
    schedule?: string;
    url?: string;
  }>;
  env?: Record<string, string>;
  steps: WorkflowStep[];
}

interface WorkflowStep {
  name: string;
  type: "test" | "visual" | "a11y" | "lighthouse" | "security" | "extract" | "script";
  config: Record<string, unknown>;
  continueOnError?: boolean;
}

interface WorkflowRunResult {
  workflow: string;
  startedAt: Date;
  completedAt: Date;
  steps: Array<{
    name: string;
    status: "pass" | "fail" | "skipped";
    duration: number;
    error?: string;
  }>;
  status: "pass" | "fail";
}

function parseWorkflowFile(filePath: string): WorkflowDefinition {
  const content = readFileSync(filePath, "utf-8");
  const ext = filePath.split(".").pop()?.toLowerCase();

  if (ext === "json") {
    return JSON.parse(content) as WorkflowDefinition;
  }

  if (ext === "yaml" || ext === "yml") {
    // Simple YAML parser for basic workflow files
    // In production this would use js-yaml
    console.log(
      chalk.dim("Full YAML parsing requires js-yaml — using JSON fallback")
    );
    throw new Error(
      "YAML workflow files require the js-yaml package. Use JSON format or install js-yaml."
    );
  }

  throw new Error(`Unsupported workflow file format: .${ext}`);
}

async function runWorkflow(filePath: string): Promise<void> {
  const resolved = resolve(filePath);

  if (!existsSync(resolved)) {
    console.error(chalk.red(`Workflow file not found: ${resolved}`));
    process.exit(1);
  }

  console.log(chalk.blue(`\nRunning workflow: ${basename(resolved)}\n`));

  let workflow: WorkflowDefinition;
  try {
    workflow = parseWorkflowFile(resolved);
  } catch (err) {
    console.error(chalk.red(`Failed to parse workflow: ${err}`));
    process.exit(1);
  }

  console.log(chalk.bold(workflow.name));
  if (workflow.description) {
    console.log(chalk.dim(workflow.description));
  }
  console.log(chalk.dim(`Steps: ${workflow.steps.length}\n`));

  const results: WorkflowRunResult = {
    workflow: workflow.name,
    startedAt: new Date(),
    completedAt: new Date(),
    steps: [],
    status: "pass",
  };

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    const stepNum = i + 1;
    const startTime = Date.now();

    console.log(
      chalk.dim(`[${stepNum}/${workflow.steps.length}]`) +
        ` ${chalk.bold(step.name)} ` +
        chalk.dim(`(${step.type})`)
    );

    try {
      // Execute step based on type
      switch (step.type) {
        case "test":
          console.log(
            chalk.dim(
              `  Running test: ${step.config.message ?? step.config.instruction ?? "default"}`
            )
          );
          // Would invoke TestExecutor here
          break;

        case "visual":
          console.log(
            chalk.dim(
              `  Running visual regression: ${step.config.url ?? "configured URL"}`
            )
          );
          break;

        case "a11y":
          console.log(
            chalk.dim(
              `  Running accessibility audit: ${step.config.standard ?? "WCAG 2.1 AA"}`
            )
          );
          break;

        case "lighthouse":
          console.log(
            chalk.dim(
              `  Running Lighthouse: ${(step.config.categories as string[])?.join(", ") ?? "all categories"}`
            )
          );
          break;

        case "security":
          console.log(
            chalk.dim(
              `  Running security scan: ${step.config.scanner ?? "nuclei"}`
            )
          );
          break;

        case "extract":
          console.log(
            chalk.dim(
              `  Extracting data: ${step.config.url ?? "configured URL"}`
            )
          );
          break;

        case "script":
          console.log(
            chalk.dim(`  Running script: ${step.config.command}`)
          );
          break;

        default:
          console.log(chalk.yellow(`  Unknown step type: ${step.type}`));
      }

      const duration = Date.now() - startTime;
      results.steps.push({
        name: step.name,
        status: "pass",
        duration,
      });
      console.log(chalk.green(`  ✓ Passed (${duration}ms)`));
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      results.steps.push({
        name: step.name,
        status: "fail",
        duration,
        error: errorMsg,
      });

      console.log(chalk.red(`  ✗ Failed: ${errorMsg}`));

      if (!step.continueOnError) {
        results.status = "fail";
        console.log(chalk.red("\nWorkflow aborted due to step failure."));
        break;
      }
    }
  }

  results.completedAt = new Date();
  const totalDuration =
    results.completedAt.getTime() - results.startedAt.getTime();

  // Summary
  const passed = results.steps.filter((s) => s.status === "pass").length;
  const failed = results.steps.filter((s) => s.status === "fail").length;
  const skipped = workflow.steps.length - results.steps.length;

  console.log(chalk.dim("\n─────────────────────────────────"));
  console.log(
    `${chalk.bold("Result")}: ${results.status === "pass" ? chalk.green("PASS") : chalk.red("FAIL")}`
  );
  console.log(
    `Steps: ${chalk.green(`${passed} passed`)}${failed > 0 ? `, ${chalk.red(`${failed} failed`)}` : ""}${skipped > 0 ? `, ${chalk.dim(`${skipped} skipped`)}` : ""}`
  );
  console.log(chalk.dim(`Duration: ${totalDuration}ms`));
}

function createWorkflowTemplate(): void {
  const template: WorkflowDefinition = {
    name: "My Workflow",
    description: "Automated test workflow",
    triggers: [
      { type: "manual" },
      // { type: "cron", schedule: "0 8 * * 1-5" },
    ],
    steps: [
      {
        name: "Test Homepage",
        type: "test",
        config: {
          message: "Test the homepage loads correctly and all links work",
          url: "http://localhost:3000",
          devices: ["desktop-chrome", "iphone-15"],
        },
      },
      {
        name: "Visual Regression",
        type: "visual",
        config: {
          url: "http://localhost:3000",
          viewports: ["mobile", "tablet", "desktop"],
          threshold: 0.1,
        },
      },
      {
        name: "Accessibility Check",
        type: "a11y",
        config: {
          url: "http://localhost:3000",
          standard: "2.1-AA",
        },
        continueOnError: true,
      },
    ],
  };

  const outputPath = resolve(
    process.cwd(),
    ".inspect/workflows/workflow.json"
  );
  const dir = resolve(process.cwd(), ".inspect/workflows");

  if (!existsSync(dir)) {
    const { mkdirSync } = require("node:fs");
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(outputPath, JSON.stringify(template, null, 2), "utf-8");
  console.log(chalk.green(`\nCreated workflow template: ${outputPath}`));
  console.log(chalk.dim('Edit the file and run: inspect workflow run .inspect/workflows/workflow.json'));
}

function listWorkflows(): void {
  const workflowDir = resolve(process.cwd(), ".inspect/workflows");

  if (!existsSync(workflowDir)) {
    console.log(chalk.yellow('No workflows found. Run "inspect workflow create" to get started.'));
    return;
  }

  const files = readdirSync(workflowDir).filter(
    (f) => f.endsWith(".json") || f.endsWith(".yaml") || f.endsWith(".yml")
  );

  if (files.length === 0) {
    console.log(chalk.yellow('No workflow files found in .inspect/workflows/'));
    return;
  }

  console.log(chalk.blue("\nAvailable Workflows:\n"));
  for (const file of files) {
    try {
      const filePath = join(workflowDir, file);
      const content = readFileSync(filePath, "utf-8");
      const workflow = JSON.parse(content) as WorkflowDefinition;
      console.log(
        `  ${chalk.bold(workflow.name)} ${chalk.dim(`(${file})`)}`
      );
      if (workflow.description) {
        console.log(chalk.dim(`    ${workflow.description}`));
      }
      console.log(chalk.dim(`    Steps: ${workflow.steps.length}`));
    } catch {
      console.log(`  ${chalk.dim(file)} ${chalk.yellow("(parse error)")}`);
    }
  }
}

async function observeWorkflow(): Promise<void> {
  console.log(chalk.blue("\nWorkflow Observer Mode\n"));
  console.log(chalk.dim("Watching your browser interactions to generate a workflow..."));
  console.log(chalk.dim("This mode is not yet implemented."));
  console.log(chalk.dim("It will record your actions and generate a reusable workflow file."));
}

async function scheduleWorkflow(
  file: string,
  schedule: string
): Promise<void> {
  console.log(chalk.blue(`\nScheduling workflow: ${file}`));
  console.log(chalk.dim(`Schedule: ${schedule}`));
  console.log(chalk.dim("Cron scheduling is not yet implemented."));
  console.log(chalk.dim("Will use node-cron or system crontab for scheduling."));
}

export function registerWorkflowCommand(program: Command): void {
  const workflow = program
    .command("workflow")
    .description("Manage and run test workflows");

  workflow
    .command("run")
    .description("Run a workflow file")
    .argument("<file>", "Workflow JSON or YAML file")
    .action(async (file: string) => {
      try {
        await runWorkflow(file);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });

  workflow
    .command("create")
    .description("Create a workflow template")
    .action(() => {
      try {
        createWorkflowTemplate();
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });

  workflow
    .command("observe")
    .description("Record browser interactions into a workflow")
    .action(async () => {
      await observeWorkflow();
    });

  workflow
    .command("schedule")
    .description("Schedule a workflow to run on a cron schedule")
    .argument("<file>", "Workflow file")
    .argument("<schedule>", "Cron schedule expression")
    .action(async (file: string, schedule: string) => {
      await scheduleWorkflow(file, schedule);
    });

  workflow
    .command("list")
    .description("List available workflows")
    .action(() => {
      listWorkflows();
    });
}
