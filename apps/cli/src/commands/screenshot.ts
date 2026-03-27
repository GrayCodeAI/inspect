import type { Command } from "commander";
import chalk from "chalk";

export interface ScreenshotOptions {
  browser?: string;
  device?: string;
  viewport?: string;
  fullPage?: boolean;
  waitForSelector?: string;
  waitForTimeout?: string;
  colorScheme?: string;
  quality?: string;
}

async function captureScreenshot(url: string, output: string, options: ScreenshotOptions): Promise<void> {
  console.log(chalk.dim(`Capturing screenshot of ${url}...`));

  const { BrowserManager } = await import("@inspect/browser");
  const browserMgr = new BrowserManager();

  // Parse viewport
  let viewport = { width: 1280, height: 720 };
  if (options.viewport) {
    const [w, h] = options.viewport.split(/[x,]/).map((s) => parseInt(s.trim(), 10));
    if (w && h) viewport = { width: w, height: h };
  }

  // Apply device preset
  if (options.device) {
    const { DEVICE_PRESETS } = await import("@inspect/shared");
    const preset = (DEVICE_PRESETS as Record<string, any>)[options.device];
    if (preset) {
      viewport = { width: preset.width, height: preset.height };
    }
  }

  await browserMgr.launchBrowser({ headless: true, viewport } as any);
  const page = await browserMgr.newPage();

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

  // Wait for selector if specified
  if (options.waitForSelector) {
    await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
  }

  // Wait for timeout if specified
  if (options.waitForTimeout) {
    await page.waitForTimeout(parseInt(options.waitForTimeout, 10));
  }

  // Determine format from extension
  const ext = output.toLowerCase().split(".").pop();
  const type = ext === "jpg" || ext === "jpeg" ? "jpeg" : "png";

  await page.screenshot({
    path: output,
    fullPage: options.fullPage ?? false,
    type,
    ...(type === "jpeg" && options.quality ? { quality: parseInt(options.quality, 10) } : {}),
  });

  await browserMgr.closeBrowser();

  console.log(chalk.green(`Screenshot saved: ${output}`));
  console.log(chalk.dim(`  URL: ${url}`));
  console.log(chalk.dim(`  Viewport: ${viewport.width}x${viewport.height}`));
  console.log(chalk.dim(`  Full page: ${options.fullPage ? "yes" : "no"}`));
}

export function registerScreenshotCommand(program: Command): void {
  program
    .command("screenshot")
    .description("Capture a page screenshot")
    .argument("<url>", "URL to capture")
    .argument("<output>", "Output file path (e.g. screenshot.png)")
    .option("-b, --browser <browser>", "Browser: chromium, firefox, webkit", "chromium")
    .option("-d, --device <device>", "Emulate device preset")
    .option("--viewport <size>", "Viewport: WIDTHxHEIGHT (default: 1280x720)")
    .option("--full-page", "Capture full scrollable page")
    .option("--wait-for-selector <sel>", "Wait for element before capture")
    .option("--wait-for-timeout <ms>", "Wait N ms before capture")
    .option("--color-scheme <scheme>", "Color scheme: light or dark")
    .option("--quality <1-100>", "JPEG quality (only for .jpg output)")
    .addHelpText("after", `
Examples:
  $ inspect screenshot https://example.com screenshot.png
  $ inspect screenshot https://myapp.com page.png --full-page
  $ inspect screenshot https://myapp.com mobile.png -d iphone-15
  $ inspect screenshot https://myapp.com hero.png --wait-for-selector ".hero-image"
  $ inspect screenshot https://myapp.com page.jpg --quality 80
`)
    .action(async (url: string, output: string, opts: ScreenshotOptions) => {
      try {
        await captureScreenshot(url, output, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });
}
