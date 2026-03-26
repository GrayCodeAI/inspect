import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync } from "node:fs";
import { resolve, extname } from "node:path";

export interface ReplayOptions {
  headed?: boolean;
  slowMo?: string;
  device?: string;
  browser?: string;
}

interface FlowStep {
  action: string;
  selector?: string;
  value?: string;
  url?: string;
  key?: string;
  timeout?: number;
  waitFor?: string;
  assertion?: string;
}

interface FlowFile {
  name: string;
  url?: string;
  device?: string;
  steps: FlowStep[];
}

async function runReplay(file: string, options: ReplayOptions): Promise<void> {
  const filePath = resolve(file);

  if (!existsSync(filePath)) {
    console.error(chalk.red(`File not found: ${filePath}`));
    process.exit(1);
  }

  const ext = extname(filePath).toLowerCase();
  if (ext !== ".json") {
    console.error(chalk.red(`Unsupported file format: ${ext}. Use JSON.`));
    process.exit(1);
  }

  let flow: FlowFile;
  try {
    flow = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(chalk.red(`Failed to parse flow file: ${err}`));
    process.exit(1);
  }

  const slowMo = parseInt(options.slowMo ?? "0", 10);
  const device = options.device ?? flow.device;

  console.log(chalk.blue(`\nReplaying: ${flow.name}\n`));
  console.log(chalk.dim(`File: ${filePath}`));
  console.log(chalk.dim(`Steps: ${flow.steps.length}`));
  if (slowMo > 0) console.log(chalk.dim(`Slow-mo: ${slowMo}ms`));
  if (device) console.log(chalk.dim(`Device: ${device}`));

  try {
    // Resolve device viewport
    let viewport = { width: 1920, height: 1080 };
    let isMobile = false;
    if (device) {
      const { DEVICE_PRESETS } = await import("@inspect/shared");
      const preset = (DEVICE_PRESETS as Record<string, any>)[device];
      if (preset) {
        viewport = { width: preset.width, height: preset.height };
        isMobile = preset.mobile ?? false;
      }
    }

    // Launch browser
    console.log(chalk.dim("\nLaunching browser..."));
    const { BrowserManager } = await import("@inspect/browser");
    const browserMgr = new BrowserManager();
    await browserMgr.launchBrowser({
      headless: !(options.headed ?? false),
      slowMo,
      viewport,
      isMobile,
    } as any);
    const page = await browserMgr.newPage();

    // Navigate to starting URL
    const startUrl = flow.url;
    if (startUrl) {
      console.log(chalk.dim(`Navigating to ${startUrl}...`));
      await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // Execute steps
    let passed = 0;
    let failed = 0;
    const startTime = Date.now();

    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      const stepNum = i + 1;
      const prefix = chalk.dim(`[${stepNum}/${flow.steps.length}]`);

      try {
        switch (step.action) {
          case "navigate":
          case "goto":
            console.log(`${prefix} Navigate to ${step.url}`);
            await page.goto(step.url!, { waitUntil: "domcontentloaded", timeout: step.timeout ?? 30000 });
            break;

          case "click":
            console.log(`${prefix} Click ${step.selector}`);
            await page.click(step.selector!, { timeout: step.timeout ?? 10000 });
            break;

          case "fill":
          case "type":
            console.log(`${prefix} Fill ${step.selector} with "${step.value?.slice(0, 30)}"`);
            await page.fill(step.selector!, step.value ?? "");
            break;

          case "select":
            console.log(`${prefix} Select "${step.value}" in ${step.selector}`);
            await page.selectOption(step.selector!, step.value ?? "");
            break;

          case "hover":
            console.log(`${prefix} Hover ${step.selector}`);
            await page.hover(step.selector!);
            break;

          case "press":
            console.log(`${prefix} Press ${step.key}`);
            await page.keyboard.press(step.key!);
            break;

          case "wait":
            console.log(`${prefix} Wait ${step.timeout ?? 1000}ms`);
            await page.waitForTimeout(step.timeout ?? 1000);
            break;

          case "waitFor":
            console.log(`${prefix} Wait for ${step.selector}`);
            await page.waitForSelector(step.selector!, { timeout: step.timeout ?? 10000 });
            break;

          case "screenshot":
            console.log(`${prefix} Screenshot`);
            await page.screenshot({ path: step.value ?? `.inspect/replay-${stepNum}.png` });
            break;

          case "assert":
            console.log(`${prefix} Assert: ${step.assertion}`);
            if (step.selector) {
              const el = await page.$(step.selector);
              if (!el) throw new Error(`Element not found: ${step.selector}`);
            }
            break;

          default:
            console.log(chalk.yellow(`${prefix} Unknown action: ${step.action}`));
        }

        if (slowMo > 0) {
          await new Promise((r) => setTimeout(r, slowMo));
        }

        passed++;
        console.log(chalk.green(`  ✓ Passed`));
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(chalk.red(`  ✗ Failed: ${msg.slice(0, 120)}`));
      }
    }

    const elapsed = Date.now() - startTime;

    // Summary
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

export function registerReplayCommand(program: Command): void {
  program
    .command("replay")
    .description("Replay a saved test flow or recording")
    .argument("<file>", "Flow JSON file to replay")
    .option("--headed", "Run in headed browser mode")
    .option("--slow-mo <ms>", "Slow down replay by N milliseconds", "0")
    .option("--device <device>", "Device preset to replay on")
    .option("--browser <browser>", "Browser: chromium, firefox, webkit", "chromium")
    .action(async (file: string, opts: ReplayOptions) => {
      await runReplay(file, opts);
    });
}
