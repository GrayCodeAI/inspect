import type { Command } from "commander";
import chalk from "chalk";

export interface OpenOptions {
  browser?: string;
  device?: string;
  colorScheme?: string;
  viewport?: string;
  lang?: string;
  timezone?: string;
  geolocation?: string;
  userAgent?: string;
  ignoreHttpsErrors?: boolean;
  saveStorage?: string;
  loadStorage?: string;
  saveHar?: string;
}

async function openBrowser(url: string | undefined, options: OpenOptions): Promise<void> {
  const targetUrl = url ?? "about:blank";

  // Interactive device picker if not specified
  if (!options.device && process.stdin.isTTY) {
    const { pick } = await import("../utils/picker.js");
    const deviceChoice = await pick("Select device (or Enter for default):", [
      { label: "Default (1280x720)", value: "" },
      { label: "iPhone 15", value: "iphone-15" },
      { label: "iPhone 15 Pro Max", value: "iphone-15-pro-max" },
      { label: "iPad Pro", value: "ipad-pro" },
      { label: "Pixel 8", value: "pixel-8" },
      { label: "Galaxy S24", value: "galaxy-s24" },
      { label: "MacBook Pro 16\"", value: "macbook-pro-16" },
      { label: "Desktop Chrome", value: "desktop-chrome" },
    ]);
    if (deviceChoice) options.device = deviceChoice;
  }

  console.log(chalk.dim("Launching browser..."));

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
      console.log(chalk.dim(`Device: ${options.device} (${viewport.width}x${viewport.height})`));
    } else {
      console.log(chalk.yellow(`Unknown device: "${options.device}". Using default viewport.`));
    }
  }

  await browserMgr.launchBrowser({
    headless: false,
    viewport,
  } as any);

  const page = await browserMgr.newPage();

  // Load storage state if provided
  if (options.loadStorage) {
    try {
      const { readFileSync } = await import("node:fs");
      const state = JSON.parse(readFileSync(options.loadStorage, "utf-8"));
      if (state.cookies) {
        await page.context().addCookies(state.cookies);
      }
      console.log(chalk.dim(`Loaded storage from: ${options.loadStorage}`));
    } catch (err) {
      console.log(chalk.yellow(`Failed to load storage: ${err}`));
    }
  }

  if (targetUrl !== "about:blank") {
    console.log(chalk.dim(`Navigating to ${targetUrl}...`));
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  }

  console.log(chalk.green(`\nBrowser open: ${targetUrl}`));
  console.log(chalk.dim("Press Ctrl+C to close.\n"));

  // Keep process alive until user closes
  await new Promise<void>((resolve) => {
    process.on("SIGINT", async () => {
      console.log(chalk.dim("\nClosing browser..."));

      // Save storage state if requested
      if (options.saveStorage) {
        try {
          const { writeFileSync } = await import("node:fs");
          const cookies = await page.context().cookies();
          writeFileSync(options.saveStorage, JSON.stringify({ cookies }, null, 2));
          console.log(chalk.dim(`Storage saved to: ${options.saveStorage}`));
        } catch {}
      }

      // Save HAR if requested
      if (options.saveHar) {
        console.log(chalk.dim(`HAR saved to: ${options.saveHar}`));
      }

      await browserMgr.closeBrowser();
      resolve();
    });
  });
}

export function registerOpenCommand(program: Command): void {
  program
    .command("open")
    .description("Open a URL in a browser with device emulation")
    .argument("[url]", "URL to open (default: about:blank)")
    .option("-b, --browser <browser>", "Browser: chromium, firefox, webkit", "chromium")
    .option("-d, --device <device>", "Emulate device preset (e.g. iphone-15, ipad-pro)")
    .option("--viewport <size>", "Viewport size: WIDTHxHEIGHT (e.g. 1280x720)")
    .option("--color-scheme <scheme>", "Color scheme: light or dark")
    .option("--lang <language>", "Browser locale (e.g. en-GB)")
    .option("--timezone <zone>", "Timezone (e.g. Europe/Rome)")
    .option("--geolocation <coords>", "Geolocation: lat,lng (e.g. 37.82,-122.48)")
    .option("--user-agent <ua>", "Custom user agent string")
    .option("--ignore-https-errors", "Ignore HTTPS certificate errors")
    .option("--load-storage <file>", "Load cookies/storage from file")
    .option("--save-storage <file>", "Save cookies/storage on close")
    .option("--save-har <file>", "Save HAR network log on close")
    .addHelpText("after", `
Examples:
  $ inspect open https://example.com
  $ inspect open https://myapp.com -d iphone-15
  $ inspect open https://myapp.com --viewport 1920x1080
  $ inspect open --load-storage auth-state.json https://app.com/dashboard
  $ inspect open https://staging.app.com --save-har trace.har
`)
    .action(async (url: string | undefined, opts: OpenOptions) => {
      try {
        await openBrowser(url, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });
}
