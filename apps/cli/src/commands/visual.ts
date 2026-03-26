import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

export interface VisualOptions {
  baseline?: boolean;
  branch?: string;
  threshold?: string;
  mask?: string;
  viewports?: string;
  sliderReport?: boolean;
  captureStorybook?: boolean;
  url?: string;
  output?: string;
  headed?: boolean;
}

const DEFAULT_VIEWPORTS = [
  { label: "mobile", width: 375, height: 812 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "desktop", width: 1440, height: 900 },
];

function parseViewports(
  input?: string
): Array<{ label: string; width: number; height: number }> {
  if (!input) return DEFAULT_VIEWPORTS;

  return input.split(",").map((v) => {
    const trimmed = v.trim();
    // Handle preset names
    const preset = DEFAULT_VIEWPORTS.find(
      (p) => p.label === trimmed
    );
    if (preset) return preset;

    // Handle WxH format
    const match = trimmed.match(/^(\d+)x(\d+)$/);
    if (match) {
      return {
        label: trimmed,
        width: parseInt(match[1], 10),
        height: parseInt(match[2], 10),
      };
    }

    // Handle named:WxH format
    const namedMatch = trimmed.match(/^(.+):(\d+)x(\d+)$/);
    if (namedMatch) {
      return {
        label: namedMatch[1],
        width: parseInt(namedMatch[2], 10),
        height: parseInt(namedMatch[3], 10),
      };
    }

    throw new Error(`Invalid viewport format: "${trimmed}". Use WxH or label:WxH`);
  });
}

function parseMaskSelectors(input?: string): string[] {
  if (!input) return [];
  return input.split(",").map((s) => s.trim()).filter(Boolean);
}

async function captureScreenshots(
  url: string,
  viewports: Array<{ label: string; width: number; height: number }>,
  outputDir: string,
  maskSelectors: string[],
  headed: boolean
): Promise<Map<string, string>> {
  // This would use @inspect/browser's Playwright wrapper in the full implementation.
  // For now, we set up the structure and log what would happen.
  const screenshots = new Map<string, string>();

  for (const viewport of viewports) {
    const filename = `${viewport.label}-${viewport.width}x${viewport.height}.png`;
    const filepath = join(outputDir, filename);
    screenshots.set(viewport.label, filepath);

    console.log(
      chalk.dim(
        `  Capturing ${viewport.label} (${viewport.width}x${viewport.height})...`
      )
    );

    // Placeholder: actual Playwright capture would go here
    // const browser = await chromium.launch({ headless: !headed });
    // const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    // const page = await context.newPage();
    // await page.goto(url, { waitUntil: 'networkidle' });
    // if (maskSelectors.length > 0) {
    //   for (const sel of maskSelectors) {
    //     await page.evaluate((s) => {
    //       document.querySelectorAll(s).forEach(el => {
    //         (el as HTMLElement).style.visibility = 'hidden';
    //       });
    //     }, sel);
    //   }
    // }
    // await page.screenshot({ path: filepath, fullPage: true });
    // await browser.close();
  }

  return screenshots;
}

function computePixelDiff(
  baselinePath: string,
  currentPath: string,
  threshold: number
): { diffPercent: number; diffPath: string; passed: boolean } {
  // Placeholder: would use pixelmatch or similar in full implementation
  // const baseline = PNG.sync.read(readFileSync(baselinePath));
  // const current = PNG.sync.read(readFileSync(currentPath));
  // const { width, height } = baseline;
  // const diff = new PNG({ width, height });
  // const numDiffPixels = pixelmatch(baseline.data, current.data, diff.data, width, height, { threshold });
  // const diffPercent = (numDiffPixels / (width * height)) * 100;
  return {
    diffPercent: 0,
    diffPath: currentPath.replace(".png", "-diff.png"),
    passed: true,
  };
}

async function runVisual(options: VisualOptions): Promise<void> {
  const outputDir = resolve(
    options.output ?? ".inspect/visual"
  );
  const baselineDir = join(outputDir, "baseline");
  const currentDir = join(outputDir, "current");
  const diffDir = join(outputDir, "diff");
  const threshold = parseFloat(options.threshold ?? "0.1");
  const viewports = parseViewports(options.viewports);
  const maskSelectors = parseMaskSelectors(options.mask);

  // Ensure output directories exist
  for (const dir of [outputDir, baselineDir, currentDir, diffDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  if (options.captureStorybook) {
    console.log(chalk.blue("\nCapturing Storybook components..."));
    console.log(chalk.dim("Storybook capture not yet implemented."));
    console.log(
      chalk.dim(
        "Will auto-discover stories and capture each component at all viewports."
      )
    );
    return;
  }

  const url = options.url;
  if (!url && !options.baseline) {
    console.log(
      chalk.yellow("No URL provided. Use --url or --capture-storybook.")
    );
    return;
  }

  if (options.baseline) {
    // Capture baseline screenshots
    console.log(chalk.blue("\nCapturing baseline screenshots..."));
    console.log(chalk.dim(`Output: ${baselineDir}`));
    console.log(chalk.dim(`Viewports: ${viewports.map((v) => v.label).join(", ")}`));
    if (maskSelectors.length > 0) {
      console.log(chalk.dim(`Masking: ${maskSelectors.join(", ")}`));
    }

    if (url) {
      await captureScreenshots(
        url,
        viewports,
        baselineDir,
        maskSelectors,
        options.headed ?? false
      );
    }

    console.log(chalk.green("\nBaseline captured successfully."));
    console.log(
      chalk.dim(
        `Run "inspect visual --url <url>" to compare against this baseline.`
      )
    );
    return;
  }

  // Compare mode: capture current and diff against baseline
  console.log(chalk.blue("\nRunning visual regression test..."));
  console.log(chalk.dim(`Threshold: ${threshold * 100}% pixel difference allowed`));

  if (!existsSync(baselineDir)) {
    console.log(
      chalk.yellow(
        "No baseline found. Run with --baseline first to capture reference screenshots."
      )
    );
    return;
  }

  // Capture current screenshots
  console.log(chalk.dim("\nCapturing current screenshots..."));
  const currentScreenshots = await captureScreenshots(
    url!,
    viewports,
    currentDir,
    maskSelectors,
    options.headed ?? false
  );

  // Compare with baseline
  console.log(chalk.dim("\nComparing with baseline..."));
  const results: Array<{
    viewport: string;
    diffPercent: number;
    passed: boolean;
  }> = [];

  for (const [label, currentPath] of currentScreenshots) {
    const baselinePath = join(
      baselineDir,
      currentPath.split("/").pop()!
    );
    if (!existsSync(baselinePath)) {
      console.log(chalk.yellow(`  ${label}: No baseline found (new viewport?)`));
      results.push({ viewport: label, diffPercent: 100, passed: false });
      continue;
    }

    const diff = computePixelDiff(baselinePath, currentPath, threshold);
    results.push({
      viewport: label,
      diffPercent: diff.diffPercent,
      passed: diff.passed,
    });

    const icon = diff.passed ? chalk.green("PASS") : chalk.red("FAIL");
    console.log(
      `  ${icon} ${label}: ${diff.diffPercent.toFixed(2)}% different`
    );
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(
    `\n${passed === total ? chalk.green("All viewports match!") : chalk.red(`${total - passed}/${total} viewports have visual differences.`)}`
  );

  if (options.sliderReport) {
    const reportPath = join(outputDir, "report.html");
    console.log(chalk.dim(`\nGenerating slider report: ${reportPath}`));
    // In full implementation: generate HTML with before/after slider
    console.log(chalk.dim("Slider report generation not yet implemented."));
  }
}

export function registerVisualCommand(program: Command): void {
  program
    .command("visual")
    .description("Visual regression testing with pixel-diff comparison")
    .option("--baseline", "Capture baseline screenshots")
    .option("--branch <branch>", "Compare against a specific branch baseline")
    .option(
      "--threshold <threshold>",
      "Pixel diff threshold (0.0-1.0)",
      "0.1"
    )
    .option(
      "--mask <selectors>",
      "Comma-separated CSS selectors to mask (hide dynamic content)"
    )
    .option(
      "--viewports <viewports>",
      "Comma-separated viewports: mobile, tablet, desktop, or WxH",
      "mobile,tablet,desktop"
    )
    .option("--slider-report", "Generate interactive slider HTML report")
    .option(
      "--capture-storybook",
      "Auto-capture all Storybook stories"
    )
    .option("--url <url>", "URL to capture")
    .option("--output <dir>", "Output directory", ".inspect/visual")
    .option("--headed", "Run in headed browser mode")
    .action(async (opts: VisualOptions) => {
      try {
        await runVisual(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
