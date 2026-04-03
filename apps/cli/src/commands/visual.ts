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
  updateSnapshots?: boolean;
  json?: boolean;
}

const DEFAULT_VIEWPORTS = [
  { label: "mobile", width: 375, height: 812 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "desktop", width: 1440, height: 900 },
];

function parseViewports(input?: string): Array<{ label: string; width: number; height: number }> {
  if (!input) return DEFAULT_VIEWPORTS;

  return input.split(",").map((v) => {
    const trimmed = v.trim();
    // Handle preset names
    const preset = DEFAULT_VIEWPORTS.find((p) => p.label === trimmed);
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
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function captureScreenshots(
  url: string,
  viewports: Array<{ label: string; width: number; height: number }>,
  outputDir: string,
  maskSelectors: string[],
  headed: boolean,
): Promise<Map<string, string>> {
  const { BrowserManager } = await import("@inspect/browser");
  const { mkdirSync: mkdirSyncLocal, existsSync: existsSyncLocal } = await import("node:fs");
  const { join: joinLocal } = await import("node:path");

  if (!existsSyncLocal(outputDir)) mkdirSyncLocal(outputDir, { recursive: true });

  const screenshots = new Map<string, string>();
  const browserMgr = new BrowserManager();

  for (const viewport of viewports) {
    console.log(
      chalk.dim(`  Capturing ${viewport.label} (${viewport.width}x${viewport.height})...`),
    );

    await browserMgr.launchBrowser({
      name: "chromium",
      headless: !headed,
      stealth: false,
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await browserMgr.newPage();

    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Mask dynamic elements if specified
    if (maskSelectors.length > 0) {
      for (const selector of maskSelectors) {
        try {
          const escapedSelector = selector.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          await page.evaluate(`
            (function() {
              var els = document.querySelectorAll('${escapedSelector}');
              els.forEach(function(el) { el.style.visibility = 'hidden'; });
            })()
          `);
        } catch {
          /* selector not found, skip */
        }
      }
    }

    const filename = `${viewport.label}-${viewport.width}x${viewport.height}.png`;
    const filepath = joinLocal(outputDir, filename);

    await page.screenshot({
      path: filepath,
      fullPage: true,
    });

    screenshots.set(viewport.label, filepath);
    await browserMgr.closeBrowser();
  }

  return screenshots;
}

function buildPNGChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCRC32(crcInput), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function pngCRC32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

async function computePixelDiff(
  baselinePath: string,
  currentPath: string,
  diffPath: string,
  threshold: number,
): Promise<{ diffPercent: number; diffPixels: number; totalPixels: number; passed: boolean }> {
  const {
    readFileSync,
    writeFileSync,
    mkdirSync: mkdirSyncLocal,
    existsSync: existsSyncLocal,
  } = await import("node:fs");
  const { dirname } = await import("node:path");
  const { inflateSync, deflateSync } = await import("node:zlib");

  if (!existsSyncLocal(baselinePath)) {
    throw new Error(`Baseline not found: ${baselinePath}`);
  }
  if (!existsSyncLocal(currentPath)) {
    throw new Error(`Current screenshot not found: ${currentPath}`);
  }

  const baselineBuf = readFileSync(baselinePath);
  const currentBuf = readFileSync(currentPath);

  // Parse PNG dimensions from IHDR chunk and extract raw pixel data
  function parsePNG(buf: Buffer) {
    if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) {
      throw new Error("Not a valid PNG file");
    }
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    const bitDepth = buf[24];
    const colorType = buf[25];

    let bytesPerPixel: number;
    switch (colorType) {
      case 2:
        bytesPerPixel = 3 * (bitDepth / 8);
        break; // RGB
      case 6:
        bytesPerPixel = 4 * (bitDepth / 8);
        break; // RGBA
      case 0:
        bytesPerPixel = 1 * (bitDepth / 8);
        break; // Grayscale
      case 4:
        bytesPerPixel = 2 * (bitDepth / 8);
        break; // Gray+Alpha
      default:
        throw new Error(`Unsupported PNG color type: ${colorType}`);
    }

    // Collect IDAT chunks
    const idatChunks: Buffer[] = [];
    let offset = 8;
    while (offset < buf.length - 4) {
      const chunkLength = buf.readUInt32BE(offset);
      const chunkType = buf.subarray(offset + 4, offset + 8).toString("ascii");
      if (chunkType === "IDAT") {
        idatChunks.push(buf.subarray(offset + 8, offset + 8 + chunkLength));
      }
      offset += 12 + chunkLength;
    }

    const compressed = Buffer.concat(idatChunks);
    const raw = inflateSync(compressed);

    return { width, height, bytesPerPixel, colorType, bitDepth, raw };
  }

  const baseline = parsePNG(baselineBuf);
  const current = parsePNG(currentBuf);

  if (baseline.width !== current.width || baseline.height !== current.height) {
    // Different dimensions — 100% diff
    return {
      diffPercent: 100,
      diffPixels: baseline.width * baseline.height,
      totalPixels: baseline.width * baseline.height,
      passed: false,
    };
  }

  const { width, height, bytesPerPixel } = baseline;
  const rowBytes = 1 + width * bytesPerPixel; // +1 for filter byte
  const totalPixels = width * height;

  // Create diff image (RGBA)
  const diffBpp = 4;
  const diffRowBytes = 1 + width * diffBpp;
  const diffRaw = Buffer.alloc(height * diffRowBytes);

  let diffPixels = 0;
  const colorThreshold = 25; // per-channel tolerance

  for (let y = 0; y < height; y++) {
    const bRow = y * rowBytes + 1; // skip filter byte
    const cRow = y * rowBytes + 1;
    const dRow = y * diffRowBytes;
    diffRaw[dRow] = 0; // no filter for diff image

    for (let x = 0; x < width; x++) {
      const bOff = bRow + x * bytesPerPixel;
      const cOff = cRow + x * bytesPerPixel;
      const dOff = dRow + 1 + x * diffBpp;

      // Compare RGB channels
      let isDiff = false;
      for (let c = 0; c < Math.min(3, bytesPerPixel); c++) {
        if (Math.abs(baseline.raw[bOff + c] - current.raw[cOff + c]) > colorThreshold) {
          isDiff = true;
          break;
        }
      }

      if (isDiff) {
        diffPixels++;
        // Red highlight for diff pixels
        diffRaw[dOff] = 255; // R
        diffRaw[dOff + 1] = 0; // G
        diffRaw[dOff + 2] = 0; // B
        diffRaw[dOff + 3] = 200; // A
      } else {
        // Dimmed original pixel
        diffRaw[dOff] = Math.floor(current.raw[cOff] * 0.3);
        diffRaw[dOff + 1] = Math.floor(current.raw[cOff + 1] * 0.3);
        diffRaw[dOff + 2] = Math.floor(current.raw[cOff + 2] * 0.3);
        diffRaw[dOff + 3] = 255;
      }
    }
  }

  const diffPercent = (diffPixels / totalPixels) * 100;

  // Write diff PNG
  const diffDirPath = dirname(diffPath);
  if (!existsSyncLocal(diffDirPath)) mkdirSyncLocal(diffDirPath, { recursive: true });

  // Build a minimal PNG: signature + IHDR + IDAT + IEND
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA color type
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = buildPNGChunk("IHDR", ihdrData);

  // IDAT
  const compressedDiff = deflateSync(diffRaw);
  const idatChunk = buildPNGChunk("IDAT", compressedDiff);

  // IEND
  const iendChunk = buildPNGChunk("IEND", Buffer.alloc(0));

  writeFileSync(diffPath, Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]));

  return {
    diffPercent: Math.round(diffPercent * 100) / 100,
    diffPixels,
    totalPixels,
    passed: diffPercent <= threshold * 100,
  };
}

async function runVisual(options: VisualOptions): Promise<void> {
  const outputDir = resolve(options.output ?? ".inspect/visual");
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
      chalk.dim("Will auto-discover stories and capture each component at all viewports."),
    );
    return;
  }

  const url = options.url;
  if (!url && !options.baseline) {
    console.log(chalk.yellow("No URL provided. Use --url or --capture-storybook."));
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
      await captureScreenshots(url, viewports, baselineDir, maskSelectors, options.headed ?? false);
    }

    console.log(chalk.green("\nBaseline captured successfully."));
    console.log(chalk.dim(`Run "inspect visual --url <url>" to compare against this baseline.`));
    return;
  }

  // Compare mode: capture current and diff against baseline
  console.log(chalk.blue("\nRunning visual regression test..."));
  console.log(chalk.dim(`Threshold: ${threshold * 100}% pixel difference allowed`));

  if (!existsSync(baselineDir)) {
    console.log(
      chalk.yellow(
        "No baseline found. Run with --baseline first to capture reference screenshots.",
      ),
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
    options.headed ?? false,
  );

  if (options.updateSnapshots) {
    console.log(chalk.blue("\nUpdating baselines...\n"));
    const {
      copyFileSync,
      mkdirSync: mkdirSyncSnap,
      existsSync: existsSyncSnap,
    } = await import("node:fs");
    if (!existsSyncSnap(baselineDir)) mkdirSyncSnap(baselineDir, { recursive: true });

    for (const [name, currentPath] of currentScreenshots) {
      const baselinePath = join(baselineDir, `${name}.png`);
      copyFileSync(currentPath, baselinePath);
      console.log(chalk.green(`  ✓ Updated baseline: ${name}`));
    }

    console.log(chalk.dim(`\n  ${currentScreenshots.size} baseline(s) updated.\n`));
    return; // Don't run comparison after updating
  }

  // Compare with baseline
  console.log(chalk.dim("\nComparing with baseline..."));
  const results: Array<{
    viewport: string;
    diffPercent: number;
    passed: boolean;
  }> = [];

  for (const [label, currentPath] of currentScreenshots) {
    const baselinePath = join(baselineDir, currentPath.split("/").pop()!);
    if (!existsSync(baselinePath)) {
      console.log(chalk.yellow(`  ${label}: No baseline found (new viewport?)`));
      results.push({ viewport: label, diffPercent: 100, passed: false });
      continue;
    }

    const diffFilePath = join(diffDir, currentPath.split("/").pop()!.replace(".png", "-diff.png"));
    const diff = await computePixelDiff(baselinePath, currentPath, diffFilePath, threshold);
    results.push({
      viewport: label,
      diffPercent: diff.diffPercent,
      passed: diff.passed,
    });

    const icon = diff.passed ? chalk.green("PASS") : chalk.red("FAIL");
    console.log(`  ${icon} ${label}: ${diff.diffPercent.toFixed(2)}% different`);
  }

  if (options.json) {
    process.stdout.write(JSON.stringify({ threshold, results }, null, 2) + "\n");
    return;
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(
    `\n${passed === total ? chalk.green("All viewports match!") : chalk.red(`${total - passed}/${total} viewports have visual differences.`)}`,
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
    .option("--threshold <threshold>", "Pixel diff threshold (0.0-1.0)", "0.1")
    .option("--mask <selectors>", "Comma-separated CSS selectors to mask (hide dynamic content)")
    .option(
      "--viewports <viewports>",
      "Comma-separated viewports: mobile, tablet, desktop, or WxH",
      "mobile,tablet,desktop",
    )
    .option("--slider-report", "Generate interactive slider HTML report")
    .option("--capture-storybook", "Auto-capture all Storybook stories")
    .option("--url <url>", "URL to capture")
    .option("--output <dir>", "Output directory", ".inspect/visual")
    .option("--headed", "Run in headed browser mode")
    .option("-u, --update-snapshots", "Update baselines with current screenshots")
    .option("--json", "Output as JSON")
    .action(async (opts: VisualOptions) => {
      try {
        await runVisual(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
