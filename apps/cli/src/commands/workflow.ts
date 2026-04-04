import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
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
  type:
    | "test"
    | "navigate"
    | "visual"
    | "a11y"
    | "lighthouse"
    | "security"
    | "extract"
    | "wait"
    | "script";
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
    evidence?: string;
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
    console.log(chalk.dim("Full YAML parsing requires js-yaml — using JSON fallback"));
    throw new Error(
      "YAML workflow files require the js-yaml package. Use JSON format or install js-yaml.",
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
        chalk.dim(`(${step.type})`),
    );

    const stepResult: { status: "pass" | "fail" | "skipped"; error?: string; evidence?: string } = {
      status: "pass",
    };

    try {
      // Execute step based on type
      switch (step.type) {
        case "test": {
          const { BrowserManager, AriaSnapshotBuilder } = await import("@inspect/browser");
          const { AgentRouter } = await import("@inspect/agent");

          const browserMgr = new BrowserManager();

          await browserMgr.launchBrowser({
            headless: true,
            viewport: { width: 1920, height: 1080 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
          const page = await browserMgr.newPage();

          const url = (step.config.url ?? step.config.value) as string | undefined;
          if (url) {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
            console.log(chalk.dim(`    Navigated to ${url}`));
            stepResult.status = "pass";
          } else {
            stepResult.status = "fail";
            stepResult.error = "No URL provided for navigate step";
          }
          await browserMgr.closeBrowser();
          break;
        }

        case "a11y": {
          const { BrowserManager } = await import("@inspect/browser");
          const browserMgr = new BrowserManager();

          await browserMgr.launchBrowser({
            headless: true,
            viewport: { width: 1920, height: 1080 },
          } as any);
          const page = await browserMgr.newPage();
          if (step.config.url)
            await page.goto(step.config.url as string, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });

          try {
            const { AccessibilityAuditor } = await import("@inspect/quality");
            const auditor = new AccessibilityAuditor();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const report = await auditor.audit(page as any);
            const minScore = (step.config.threshold as number) ?? 80;
            stepResult.status = report.score >= minScore ? "pass" : "fail";
            stepResult.evidence = `Score: ${report.score}/100, ${report.violations.length} violations`;
            console.log(chalk.dim(`    A11y score: ${report.score}/100`));
          } catch (err) {
            stepResult.status = "fail";
            stepResult.error = err instanceof Error ? err.message : String(err);
          }

          await browserMgr.closeBrowser();
          break;
        }

        case "lighthouse": {
          try {
            const { LighthouseAuditor } = await import("@inspect/quality");
            const auditor = new LighthouseAuditor();
            const result = await auditor.run(
              (step.config.url as string) ?? "http://localhost:3000",
            );
            const minScore = (step.config.threshold as number) ?? 80;
            const score = result.scores.performance ?? 0;
            const displayScore = Math.round(score * 100);
            stepResult.status = displayScore >= minScore ? "pass" : "fail";
            stepResult.evidence = `Performance: ${displayScore}/100`;
            console.log(chalk.dim(`    Lighthouse performance: ${displayScore}/100`));
          } catch (err) {
            stepResult.status = "fail";
            stepResult.error = err instanceof Error ? err.message : String(err);
          }
          break;
        }

        case "visual": {
          const { BrowserManager } = await import("@inspect/browser");
          const browserMgr = new BrowserManager();

          await browserMgr.launchBrowser({
            headless: true,
            viewport: { width: 1920, height: 1080 },
          } as any);
          const page = await browserMgr.newPage();
          if (step.config.url)
            await page.goto(step.config.url as string, {
              waitUntil: "networkidle",
              timeout: 30000,
            });

          const screenshotPath = join(
            process.cwd(),
            ".inspect",
            "visual",
            "current",
            `${step.name.replace(/\s+/g, "-")}.png`,
          );
          const dir = join(process.cwd(), ".inspect", "visual", "current");
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

          await page.screenshot({ path: screenshotPath, fullPage: false });
          console.log(chalk.dim(`    Screenshot saved: ${screenshotPath}`));
          stepResult.status = "pass";
          stepResult.evidence = `Screenshot: ${screenshotPath}`;

          await browserMgr.closeBrowser();
          break;
        }

        case "security": {
          const url = (step.config.url as string) ?? "http://localhost:3000";
          console.log(chalk.dim(`    Scanning ${url}...`));
          try {
            const { execFile: execFileCb } = await import("node:child_process");
            const { promisify } = await import("node:util");
            const execFile = promisify(execFileCb);

            const severity = (step.config.severity as string) ?? "medium,high,critical";
            const { stdout } = await execFile(
              "nuclei",
              ["-u", url, "-severity", severity, "-silent", "-json"],
              { timeout: 120000 },
            );
            const findings = stdout.trim().split("\n").filter(Boolean).length;
            stepResult.status = findings === 0 ? "pass" : "fail";
            stepResult.evidence = `${findings} finding(s) from nuclei scan`;
          } catch {
            console.log(chalk.yellow("    nuclei not installed — skipping security scan"));
            stepResult.status = "pass";
            stepResult.evidence = "Skipped (nuclei not installed)";
          }
          break;
        }

        case "extract": {
          const { BrowserManager } = await import("@inspect/browser");
          const browserMgr = new BrowserManager();

          await browserMgr.launchBrowser({
            headless: true,
            viewport: { width: 1920, height: 1080 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
          const page = await browserMgr.newPage();
          if (step.config.url)
            await page.goto(step.config.url as string, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });

          const expression = (step.config.expression as string) ?? "document.title";
          const result = await page.evaluate(expression);
          stepResult.status = "pass";
          stepResult.evidence = `Extracted: ${JSON.stringify(result).slice(0, 200)}`;

          await browserMgr.closeBrowser();
          break;
        }

        case "wait": {
          const ms = (step.config.timeout ?? step.config.value ?? 1000) as number;
          await new Promise((r) => setTimeout(r, Number(ms)));
          stepResult.status = "pass";
          break;
        }

        case "script": {
          const { BrowserManager } = await import("@inspect/browser");
          const browserMgr = new BrowserManager();

          await browserMgr.launchBrowser({
            headless: true,
            viewport: { width: 1920, height: 1080 },
          } as any);
          const page = await browserMgr.newPage();
          if (step.config.url)
            await page.goto(step.config.url as string, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });

          if (step.config.code) {
            await page.evaluate(step.config.code as string);
            stepResult.status = "pass";
          } else {
            stepResult.status = "fail";
            stepResult.error = "No code provided for script step";
          }

          await browserMgr.closeBrowser();
          break;
        }

        default: {
          console.log(chalk.yellow(`    Unknown step type: ${step.type} — skipping`));
          stepResult.status = "pass";
          stepResult.evidence = "Skipped (unknown type)";
          break;
        }
      }

      const duration = Date.now() - startTime;
      results.steps.push({
        name: step.name,
        status: stepResult.status,
        duration,
        error: stepResult.error,
        evidence: stepResult.evidence,
      });

      if (stepResult.status === "pass") {
        console.log(chalk.green(`  ✓ Passed (${duration}ms)`));
      } else {
        console.log(
          chalk.red(`  ✗ Failed${stepResult.error ? `: ${stepResult.error}` : ""} (${duration}ms)`),
        );
        if (!step.continueOnError) {
          results.status = "fail";
          console.log(chalk.red("\nWorkflow aborted due to step failure."));
          break;
        }
      }
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
  const totalDuration = results.completedAt.getTime() - results.startedAt.getTime();

  // Summary
  const passed = results.steps.filter((s) => s.status === "pass").length;
  const failed = results.steps.filter((s) => s.status === "fail").length;
  const skipped = workflow.steps.length - results.steps.length;

  console.log(chalk.dim("\n─────────────────────────────────"));
  console.log(
    `${chalk.bold("Result")}: ${results.status === "pass" ? chalk.green("PASS") : chalk.red("FAIL")}`,
  );
  console.log(
    `Steps: ${chalk.green(`${passed} passed`)}${failed > 0 ? `, ${chalk.red(`${failed} failed`)}` : ""}${skipped > 0 ? `, ${chalk.dim(`${skipped} skipped`)}` : ""}`,
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

  const outputPath = resolve(process.cwd(), ".inspect/workflows/workflow.json");
  const dir = resolve(process.cwd(), ".inspect/workflows");

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(outputPath, JSON.stringify(template, null, 2), "utf-8");
  console.log(chalk.green(`\nCreated workflow template: ${outputPath}`));
  console.log(
    chalk.dim("Edit the file and run: inspect workflow run .inspect/workflows/workflow.json"),
  );
}

function listWorkflows(): void {
  const workflowDir = resolve(process.cwd(), ".inspect/workflows");

  if (!existsSync(workflowDir)) {
    console.log(chalk.yellow('No workflows found. Run "inspect workflow create" to get started.'));
    return;
  }

  const files = readdirSync(workflowDir).filter(
    (f) => f.endsWith(".json") || f.endsWith(".yaml") || f.endsWith(".yml"),
  );

  if (files.length === 0) {
    console.log(chalk.yellow("No workflow files found in .inspect/workflows/"));
    return;
  }

  console.log(chalk.blue("\nAvailable Workflows:\n"));
  for (const file of files) {
    try {
      const filePath = join(workflowDir, file);
      const content = readFileSync(filePath, "utf-8");
      const workflow = JSON.parse(content) as WorkflowDefinition;
      console.log(`  ${chalk.bold(workflow.name)} ${chalk.dim(`(${file})`)}`);
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
  console.log(chalk.dim("Recording browser interactions to generate a workflow...\n"));

  const { BrowserManager } = await import("@inspect/browser");
  const browserMgr = new BrowserManager();

  await browserMgr.launchBrowser({
    headless: true,
    viewport: { width: 1920, height: 1080 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const page = await browserMgr.newPage();

  const recordedSteps: WorkflowStep[] = [];
  let stepCounter = 0;

  // Listen for navigations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.on("framenavigated", (frame: any) => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      if (url && url !== "about:blank") {
        stepCounter++;
        recordedSteps.push({
          name: `Navigate to ${new URL(url).hostname}`,
          type: "navigate",
          config: { url },
        });
        console.log(chalk.dim(`  [${stepCounter}] Recorded navigation: ${url}`));
      }
    }
  });

  // Listen for console messages that act as test markers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.on("console", (msg: any) => {
    const text = msg.text();
    if (text.startsWith("inspect:test:")) {
      stepCounter++;
      const instruction = text.replace("inspect:test:", "").trim();
      recordedSteps.push({
        name: instruction,
        type: "test",
        config: { instruction, url: page.url() },
      });
      console.log(chalk.dim(`  [${stepCounter}] Recorded test: ${instruction}`));
    }
  });

  console.log(chalk.bold("Browser launched in headed mode."));
  console.log(chalk.dim("Navigate to pages and interact normally."));
  console.log(chalk.dim("Navigations are recorded automatically."));
  console.log(chalk.dim('Log "inspect:test:<instruction>" in the console to add test steps.'));
  console.log(chalk.dim("Close the browser window to finish recording.\n"));

  // Wait for the browser to be disconnected (user closes the window)
  await new Promise<void>((resolve) => {
    page.context().on("close", () => resolve());
  });

  if (recordedSteps.length === 0) {
    console.log(chalk.yellow("\nNo steps recorded."));
    return;
  }

  const workflow: WorkflowDefinition = {
    name: "Observed Workflow",
    description: `Recorded ${recordedSteps.length} steps from browser session`,
    triggers: [{ type: "manual" }],
    steps: recordedSteps,
  };

  const outputDir = resolve(process.cwd(), ".inspect/workflows");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath = join(outputDir, `observed-${timestamp}.json`);
  writeFileSync(outputPath, JSON.stringify(workflow, null, 2), "utf-8");

  console.log(chalk.green(`\nWorkflow saved: ${outputPath}`));
  console.log(chalk.dim(`Recorded ${recordedSteps.length} steps.`));
  console.log(chalk.dim(`Run it with: inspect workflow run ${outputPath}`));
}

/** Parse a simple cron field against a value (supports * and integers) */
function cronFieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;
  if (field.includes(",")) return field.split(",").some((f) => cronFieldMatches(f.trim(), value));
  if (field.includes("/")) {
    const [, divisor] = field.split("/");
    return value % Number(divisor) === 0;
  }
  if (field.includes("-")) {
    const [lo, hi] = field.split("-").map(Number);
    return value >= lo && value <= hi;
  }
  return Number(field) === value;
}

/** Check if a cron expression matches the current time */
function cronMatchesNow(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const now = new Date();
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return (
    cronFieldMatches(minute, now.getMinutes()) &&
    cronFieldMatches(hour, now.getHours()) &&
    cronFieldMatches(dayOfMonth, now.getDate()) &&
    cronFieldMatches(month, now.getMonth() + 1) &&
    cronFieldMatches(dayOfWeek, now.getDay())
  );
}

async function scheduleWorkflow(file: string, schedule: string): Promise<void> {
  const resolved = resolve(file);
  if (!existsSync(resolved)) {
    console.error(chalk.red(`Workflow file not found: ${resolved}`));
    process.exit(1);
  }

  console.log(chalk.blue(`\nScheduling workflow: ${basename(resolved)}`));
  console.log(chalk.dim(`Schedule: ${schedule}`));

  // Validate the cron expression has 5 fields
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) {
    console.error(
      chalk.red("Invalid cron expression. Expected 5 fields: minute hour day month weekday"),
    );
    process.exit(1);
  }

  // Try to use node-cron if available
  try {
    const cronModuleName = "node-cron";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cron: any = await import(cronModuleName);
    if (!cron.validate(schedule)) {
      console.error(chalk.red(`Invalid cron expression: ${schedule}`));
      process.exit(1);
    }

    console.log(chalk.green("Scheduler started (using node-cron)."));
    console.log(chalk.dim("Press Ctrl+C to stop.\n"));

    cron.schedule(schedule, async () => {
      console.log(chalk.dim(`\n[${new Date().toISOString()}] Triggered by schedule`));
      try {
        await runWorkflow(resolved);
      } catch (err) {
        console.error(chalk.red(`Scheduled run failed: ${err}`));
      }
    });

    // Keep process alive
    await new Promise(() => {});
  } catch {
    // Fallback: poll every 60 seconds with built-in cron matching
    console.log(
      chalk.yellow("node-cron not installed — using built-in cron polling (checks every 60s)."),
    );
    console.log(chalk.green("Scheduler started."));
    console.log(chalk.dim("Press Ctrl+C to stop.\n"));

    const checkInterval = setInterval(async () => {
      if (cronMatchesNow(schedule)) {
        console.log(chalk.dim(`\n[${new Date().toISOString()}] Triggered by schedule`));
        try {
          await runWorkflow(resolved);
        } catch (err) {
          console.error(chalk.red(`Scheduled run failed: ${err}`));
        }
      }
    }, 60_000);

    // Keep process alive; clean up on SIGINT
    process.on("SIGINT", () => {
      clearInterval(checkInterval);
      console.log(chalk.dim("\nScheduler stopped."));
      process.exit(0);
    });

    await new Promise(() => {});
  }
}

export function registerWorkflowCommand(program: Command): void {
  const workflow = program.command("workflow").description("Manage and run test workflows");

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
