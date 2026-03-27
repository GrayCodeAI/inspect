import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync } from "node:fs";
import { resolve, extname, basename, normalize } from "node:path";

export interface RunOptions {
  env?: string;
  parallel?: boolean;
  verbose?: boolean;
}

interface YAMLTestStep {
  name: string;
  type?: string;
  action?: string;
  url?: string;
  selector?: string;
  value?: string;
  assertion?: string;
  timeout?: number;
  continueOnError?: boolean;
}

interface YAMLTestDefinition {
  name: string;
  description?: string;
  url?: string;
  device?: string;
  env?: Record<string, string>;
  setup?: YAMLTestStep[];
  steps: YAMLTestStep[];
  teardown?: YAMLTestStep[];
}

function parseSimpleYAML(content: string): YAMLTestDefinition {
  // Simple YAML parser for test definition files
  // Handles basic key-value, arrays, and nested objects
  const lines = content.split("\n");
  const result: Record<string, unknown> = {};
  let currentSection: string | null = null;
  let currentArray: unknown[] | null = null;
  let currentItem: Record<string, unknown> | null = null;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    const stripped = trimmed.trim();

    if (indent === 0 && stripped.endsWith(":") && !stripped.includes(" ")) {
      // Top-level section
      currentSection = stripped.slice(0, -1);
      if (currentSection === "steps" || currentSection === "setup" || currentSection === "teardown") {
        currentArray = [];
        result[currentSection] = currentArray;
      }
      currentItem = null;
      continue;
    }

    if (indent === 0 && stripped.includes(": ")) {
      const colonIdx = stripped.indexOf(": ");
      const key = stripped.slice(0, colonIdx).trim();
      const value = stripped.slice(colonIdx + 2).trim();
      result[key] = value.replace(/^["']|["']$/g, "");
      continue;
    }

    if (currentArray !== null) {
      if (stripped.startsWith("- ")) {
        // New array item
        if (stripped.includes(": ")) {
          currentItem = {};
          const kv = stripped.slice(2);
          const colonIdx = kv.indexOf(": ");
          const key = kv.slice(0, colonIdx).trim();
          const value = kv.slice(colonIdx + 2).trim();
          currentItem[key] = value.replace(/^["']|["']$/g, "");
          currentArray.push(currentItem);
        } else {
          currentArray.push(stripped.slice(2).replace(/^["']|["']$/g, ""));
          currentItem = null;
        }
      } else if (currentItem && stripped.includes(": ")) {
        const colonIdx = stripped.indexOf(": ");
        const key = stripped.slice(0, colonIdx).trim();
        const value = stripped.slice(colonIdx + 2).trim();
        currentItem[key] = value.replace(/^["']|["']$/g, "");
      }
    } else if (currentSection === "env" && stripped.includes(": ")) {
      if (!result.env) result.env = {};
      const colonIdx = stripped.indexOf(": ");
      const key = stripped.slice(0, colonIdx).trim();
      const value = stripped.slice(colonIdx + 2).trim();
      (result.env as Record<string, string>)[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  return result as unknown as YAMLTestDefinition;
}

async function runYamlTest(file: string, options: RunOptions): Promise<void> {
  const filePath = resolve(file);

  if (!existsSync(filePath)) {
    console.error(chalk.red(`File not found: ${filePath}`));
    process.exit(1);
  }

  // Load env file if provided
  if (options.env) {
    const envPath = resolve(options.env);
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
          process.env[key] = value;
        }
      }
      console.log(chalk.dim(`Loaded env from: ${envPath}`));
    }
  }

  // Parse the test file
  const content = readFileSync(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();

  let testDef: YAMLTestDefinition;
  if (ext === ".json") {
    testDef = JSON.parse(content);
  } else if (ext === ".yaml" || ext === ".yml") {
    testDef = parseSimpleYAML(content);
  } else {
    console.error(chalk.red(`Unsupported format: ${ext}. Use .yaml, .yml, or .json`));
    process.exit(1);
  }

  // Apply env vars from test definition
  if (testDef.env) {
    for (const [key, value] of Object.entries(testDef.env)) {
      process.env[key] = value;
    }
  }

  console.log(chalk.blue(`\nRunning: ${testDef.name}\n`));
  if (testDef.description) console.log(chalk.dim(testDef.description));
  console.log(chalk.dim(`File: ${basename(filePath)}`));
  console.log(chalk.dim(`Steps: ${testDef.steps.length}`));
  if (testDef.url) console.log(chalk.dim(`URL: ${testDef.url}`));

  try {
    // Launch browser
    console.log(chalk.dim("\nLaunching browser..."));
    const { BrowserManager } = await import("@inspect/browser");
    const browserMgr = new BrowserManager();

    let viewport = { width: 1920, height: 1080 };
    if (testDef.device) {
      const { DEVICE_PRESETS } = await import("@inspect/shared");
      const preset = (DEVICE_PRESETS as Record<string, any>)[testDef.device];
      if (preset) viewport = { width: preset.width, height: preset.height };
    }

    await browserMgr.launchBrowser({ headless: true, viewport } as any);
    const page = await browserMgr.newPage();

    if (testDef.url) {
      await page.goto(testDef.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Execute steps
    const allSteps = [
      ...(testDef.setup ?? []).map((s) => ({ ...s, phase: "setup" })),
      ...testDef.steps.map((s) => ({ ...s, phase: "test" })),
      ...(testDef.teardown ?? []).map((s) => ({ ...s, phase: "teardown" })),
    ];

    let passed = 0;
    let failed = 0;
    const startTime = Date.now();

    for (let i = 0; i < allSteps.length; i++) {
      const step = allSteps[i];
      const prefix = chalk.dim(`[${step.phase}:${i + 1}]`);
      const action = step.action ?? step.type ?? "unknown";

      try {
        if (options.verbose) {
          console.log(`${prefix} ${step.name ?? action}: ${JSON.stringify(step).slice(0, 100)}`);
        } else {
          console.log(`${prefix} ${step.name ?? action}`);
        }

        switch (action) {
          case "navigate":
          case "goto":
            await page.goto(step.url!, { waitUntil: "domcontentloaded", timeout: step.timeout ?? 30000 });
            break;
          case "click":
            await page.click(step.selector!, { timeout: step.timeout ?? 10000 });
            break;
          case "fill":
          case "type":
            await page.fill(step.selector!, step.value ?? "");
            break;
          case "select":
            await page.selectOption(step.selector!, step.value ?? "");
            break;
          case "hover":
            await page.hover(step.selector!);
            break;
          case "wait":
            await page.waitForTimeout(step.timeout ?? 1000);
            break;
          case "waitFor":
            await page.waitForSelector(step.selector!, { timeout: step.timeout ?? 10000 });
            break;
          case "assert":
            if (step.selector) {
              const el = await page.$(step.selector);
              if (!el) throw new Error(`Element not found: ${step.selector}`);
            } else {
              throw new Error("Assert step requires a 'selector' property");
            }
            break;
          case "screenshot": {
            const screenshotPath = normalize(step.value ?? `.inspect/run-step-${i + 1}.png`);
            // Prevent writing outside the current working directory
            const resolvedPath = resolve(screenshotPath);
            if (!resolvedPath.startsWith(resolve("."))) {
              throw new Error(`Screenshot path "${screenshotPath}" resolves outside the current directory`);
            }
            await page.screenshot({ path: screenshotPath });
            break;
          }
          default:
            console.log(chalk.yellow(`  Unknown action: ${action}`));
        }

        passed++;
        console.log(chalk.green("  ✓"));
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(chalk.red(`  ✗ ${msg.slice(0, 120)}`));
        if (!step.continueOnError && step.phase !== "teardown") {
          console.log(chalk.red("\nAborted due to step failure."));
          break;
        }
      }
    }

    const elapsed = Date.now() - startTime;

    console.log(chalk.dim("\n─────────────────────────────────────────"));
    console.log(
      `\n${chalk.bold("Result")}: ${failed === 0 ? chalk.green("PASS") : chalk.red("FAIL")}`,
    );
    console.log(
      `Steps: ${chalk.green(`${passed} passed`)}${failed > 0 ? `, ${chalk.red(`${failed} failed`)}` : ""}`,
    );
    console.log(chalk.dim(`Duration: ${(elapsed / 1000).toFixed(1)}s\n`));

    await browserMgr.closeBrowser();

    if (failed > 0) process.exit(1);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nError: ${msg}`));
    process.exit(1);
  }
}

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run a YAML/JSON test definition file")
    .argument("<file>", "YAML or JSON test file to run")
    .option("--env <env>", "Environment variables file (.env)")
    .option("--parallel", "Run test steps in parallel where possible")
    .option("--verbose", "Show detailed output")
    .addHelpText("after", `
Examples:
  $ inspect run tests/login.yaml
  $ inspect run tests/checkout.json --env .env.staging
  $ inspect run tests/smoke.yaml --verbose
`)
    .action(async (file: string, opts: RunOptions) => {
      await runYamlTest(file, opts);
    });
}
