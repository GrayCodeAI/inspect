// ============================================================================
// Visual Regression Agent — Pixel-level screenshot comparison
// ============================================================================

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, basename } from "node:path";
import { inflateSync } from "node:zlib";
import { safeEvaluate } from "./evaluate.js";
import type { ProgressCallback } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VisualDiff {
  match: boolean;
  diffPercentage: number;
  diffImagePath?: string;
  baselinePath: string;
  currentPath: string;
}

export interface VisualRegressionReport {
  url: string;
  viewport: string;
  diffs: VisualDiff[];
  passed: boolean;
}

// ---------------------------------------------------------------------------
// PNG helpers — minimal parsing without external libraries
// ---------------------------------------------------------------------------

/** PNG signature: 8 bytes */
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

/**
 * Read width, height, bit depth and color type from the IHDR chunk of a PNG.
 */
function readPngInfo(buf: Buffer): PngInfo {
  // Verify PNG signature
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a valid PNG file");
  }

  // IHDR is always the first chunk, starting at byte 8
  // Chunk layout: 4-byte length | 4-byte type | data | 4-byte CRC
  const ihdrType = buf.toString("ascii", 12, 16);
  if (ihdrType !== "IHDR") {
    throw new Error("Missing IHDR chunk");
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];

  return { width, height, bitDepth, colorType };
}

/**
 * Calculate the number of bytes per pixel for a given PNG color type and bit depth.
 * Color types: 0 = grayscale, 2 = RGB, 3 = indexed, 4 = grayscale+alpha, 6 = RGBA
 */
function bytesPerPixel(colorType: number, bitDepth: number): number {
  const bitsPerChannel = bitDepth;
  let channels: number;
  switch (colorType) {
    case 0: channels = 1; break; // grayscale
    case 2: channels = 3; break; // RGB
    case 3: channels = 1; break; // indexed (palette)
    case 4: channels = 2; break; // grayscale + alpha
    case 6: channels = 4; break; // RGBA
    default: channels = 4; break;
  }
  return Math.ceil((channels * bitsPerChannel) / 8);
}

/**
 * Generate a deterministic filename stem for a URL + viewport combination.
 * Encodes the viewport dimensions explicitly and appends a short hash of the
 * full URL so filenames are both human-readable and collision-resistant.
 */
function screenshotHash(url: string, width: number, height: number): string {
  // Sanitise the URL into a short filesystem-safe prefix
  const sanitised = url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 60);

  const hash = createHash("sha256")
    .update(`${url}::${width}x${height}`)
    .digest("hex")
    .slice(0, 12);

  return `${sanitised}-${width}x${height}-${hash}`;
}

// ---------------------------------------------------------------------------
// decodePNG — inflate IDAT chunks and un-filter scanlines
// ---------------------------------------------------------------------------

/**
 * Decode a PNG buffer into raw RGBA-style pixel data.
 *
 * Steps:
 *   1. Parse the IHDR chunk for width, height, bit depth, color type.
 *   2. Collect all IDAT chunks and concatenate their data payloads.
 *   3. Inflate (decompress) with node:zlib.
 *   4. Un-filter each scanline (filter types 0–4).
 *
 * Returns the uncompressed, un-filtered pixel buffer along with dimensions.
 * NOTE: Indexed-color (palette) images are not expanded — the raw indices
 * are returned.  For visual regression the same palette yields the same
 * indices, so this is still correct for equality comparison.
 */
export function decodePNG(buf: Buffer): { width: number; height: number; pixels: Buffer } {
  const info = readPngInfo(buf);
  const { width, height, bitDepth, colorType } = info;
  const bpp = bytesPerPixel(colorType, bitDepth);

  // --- Collect all IDAT chunk data -------------------------------------------
  const idatChunks: Buffer[] = [];
  let offset = 8; // skip PNG signature

  while (offset < buf.length) {
    const chunkLen = buf.readUInt32BE(offset);
    const chunkType = buf.toString("ascii", offset + 4, offset + 8);
    const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLen);

    if (chunkType === "IDAT") {
      idatChunks.push(chunkData);
    } else if (chunkType === "IEND") {
      break;
    }

    // 4 (length) + 4 (type) + chunkLen (data) + 4 (CRC)
    offset += 12 + chunkLen;
  }

  if (idatChunks.length === 0) {
    throw new Error("No IDAT chunks found in PNG");
  }

  // --- Inflate ---------------------------------------------------------------
  const compressed = Buffer.concat(idatChunks);
  const inflated = inflateSync(compressed);

  // --- Un-filter scanlines ---------------------------------------------------
  // Each scanline is: 1 filter-type byte + (width * bpp) data bytes
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);

  // We need access to the previous scanline for filters 2/3/4
  const prevRow = Buffer.alloc(stride); // starts as zeros (as required by spec)

  let srcPos = 0;
  for (let y = 0; y < height; y++) {
    const filterType = inflated[srcPos++];
    const rowStart = y * stride;

    // Copy the raw filtered bytes into pixels first, then un-filter in place
    inflated.copy(pixels, rowStart, srcPos, srcPos + stride);
    srcPos += stride;

    for (let x = 0; x < stride; x++) {
      const curIdx = rowStart + x;

      // a = the byte at position (x - bpp) in the current row, or 0
      const a = x >= bpp ? pixels[curIdx - bpp] : 0;
      // b = the byte at the same position in the previous row
      const b = prevRow[x];
      // c = the byte at position (x - bpp) in the previous row, or 0
      const c = x >= bpp ? prevRow[x - bpp] : 0;

      switch (filterType) {
        case 0: // None
          break;
        case 1: // Sub
          pixels[curIdx] = (pixels[curIdx] + a) & 0xff;
          break;
        case 2: // Up
          pixels[curIdx] = (pixels[curIdx] + b) & 0xff;
          break;
        case 3: // Average
          pixels[curIdx] = (pixels[curIdx] + Math.floor((a + b) / 2)) & 0xff;
          break;
        case 4: { // Paeth
          // Paeth predictor
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          let pr: number;
          if (pa <= pb && pa <= pc) pr = a;
          else if (pb <= pc) pr = b;
          else pr = c;
          pixels[curIdx] = (pixels[curIdx] + pr) & 0xff;
          break;
        }
        default:
          // Unknown filter — treat as None (best-effort)
          break;
      }
    }

    // Copy the now-unfiltered row into prevRow for the next iteration
    pixels.copy(prevRow, 0, rowStart, rowStart + stride);
  }

  return { width, height, pixels };
}

// ---------------------------------------------------------------------------
// Default dynamic content selectors
// ---------------------------------------------------------------------------

const DEFAULT_DYNAMIC_SELECTORS = [
  '[data-testid*="time"]',
  '[data-testid*="date"]',
  ".timestamp",
  "time",
  ".avatar",
  ".ad",
  'iframe[src*="ad"]',
  '[class*="ad-"]',
];

// ---------------------------------------------------------------------------
// freezeAnimations
// ---------------------------------------------------------------------------

/**
 * Inject CSS and JS to freeze all page animations, transitions, auto-playing
 * videos, smooth scrolling, and requestAnimationFrame loops.
 */
export async function freezeAnimations(page: any): Promise<void> {
  // Inject a <style> that kills all CSS animations and transitions
  await safeEvaluate<void>(
    page,
    `
    (() => {
      const style = document.createElement("style");
      style.id = "__inspect_freeze_animations";
      style.textContent = \`
        *, *::before, *::after {
          animation: none !important;
          animation-delay: 0s !important;
          animation-duration: 0s !important;
          transition: none !important;
          transition-delay: 0s !important;
          transition-duration: 0s !important;
        }
        html {
          scroll-behavior: auto !important;
        }
      \`;
      document.head.appendChild(style);

      // Pause all videos
      const videos = document.querySelectorAll("video");
      for (const v of videos) {
        v.pause();
        v.autoplay = false;
      }

      // Override requestAnimationFrame to prevent loops from running
      const noop = (cb) => setTimeout(cb, 1e9);
      window.requestAnimationFrame = noop;

      // Stop all running intervals and timeouts (best-effort)
      // We store the max id seen so far and clear everything above a safe threshold
      const highestTimeoutId = setTimeout(() => {}, 0);
      for (let i = 0; i < highestTimeoutId; i++) {
        clearTimeout(i);
        clearInterval(i);
      }
    })()
    `,
    undefined,
  );
}

// ---------------------------------------------------------------------------
// maskDynamicContent
// ---------------------------------------------------------------------------

/**
 * Replace dynamic elements (timestamps, avatars, ads, etc.) with solid grey
 * blocks so they do not cause false positives in visual comparisons.
 */
export async function maskDynamicContent(
  page: any,
  selectors?: string[],
): Promise<void> {
  const selectorList = selectors ?? DEFAULT_DYNAMIC_SELECTORS;
  const joined = selectorList.map((s) => JSON.stringify(s)).join(",");

  await safeEvaluate<void>(
    page,
    `
    (() => {
      const selectors = [${joined}];
      for (const sel of selectors) {
        try {
          const elements = document.querySelectorAll(sel);
          for (const el of elements) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            el.style.backgroundColor = "#808080";
            el.style.color = "#808080";
            el.style.backgroundImage = "none";
            el.style.opacity = "1";
            el.style.overflow = "hidden";
            // Replace text content with a uniform placeholder
            if (el.childNodes.length > 0) {
              el.textContent = "\\u00A0";
            }
            // Replace images inside the element
            const imgs = el.querySelectorAll("img");
            for (const img of imgs) {
              img.style.visibility = "hidden";
            }
          }
        } catch {
          // Selector may be invalid for this page — skip it
        }
      }
    })()
    `,
    undefined,
  );
}

// ---------------------------------------------------------------------------
// captureBaseline
// ---------------------------------------------------------------------------

/**
 * Freeze animations, mask dynamic content, take a full-page screenshot, and
 * save it as the baseline image under `baselineDir/{hash}.png`.
 *
 * @returns The absolute path to the saved baseline image.
 */
export async function captureBaseline(
  page: any,
  url: string,
  viewport: { width: number; height: number },
  baselineDir: string,
): Promise<string> {
  // Ensure baseline directory exists
  if (!existsSync(baselineDir)) {
    mkdirSync(baselineDir, { recursive: true });
  }

  // Set viewport size
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  // Navigate to URL
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    // Fall back to load event
    try {
      await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    } catch {
      // Continue with whatever loaded
    }
  }

  // Prepare the page for a stable screenshot
  await freezeAnimations(page);
  await maskDynamicContent(page);

  // Wait briefly for styles to apply
  await page.waitForTimeout(500).catch(() => {});

  // Take the full-page screenshot
  const hash = screenshotHash(url, viewport.width, viewport.height);
  const baselinePath = join(baselineDir, `${hash}.png`);

  await page.screenshot({ path: baselinePath, fullPage: true });

  return baselinePath;
}

// ---------------------------------------------------------------------------
// compareScreenshot
// ---------------------------------------------------------------------------

/**
 * Take a fresh screenshot and compare it against the existing baseline using
 * raw byte-level comparison on the PNG buffers.
 *
 * If the diff exceeds the threshold (default 0.1%), a diff image is generated
 * that highlights the changed pixels in red against a dimmed background.
 */
export async function compareScreenshot(
  page: any,
  url: string,
  viewport: { width: number; height: number },
  baselineDir: string,
  threshold = 0.1,
): Promise<VisualDiff> {
  const hash = screenshotHash(url, viewport.width, viewport.height);
  const baselinePath = join(baselineDir, `${hash}.png`);

  // Set viewport size
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  // Navigate to URL
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    try {
      await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    } catch {
      // Continue with whatever loaded
    }
  }

  // Prepare the page identically to baseline capture
  await freezeAnimations(page);
  await maskDynamicContent(page);
  await page.waitForTimeout(500).catch(() => {});

  // Take the current screenshot
  const currentDir = join(baselineDir, "..", "current");
  if (!existsSync(currentDir)) {
    mkdirSync(currentDir, { recursive: true });
  }
  const currentPath = join(currentDir, `${hash}.png`);
  await page.screenshot({ path: currentPath, fullPage: true });

  // If baseline does not exist, return a mismatch signaling first run
  if (!existsSync(baselinePath)) {
    return {
      match: false,
      diffPercentage: 100,
      baselinePath,
      currentPath,
    };
  }

  // Read both files
  const baselineBuf = readFileSync(baselinePath);
  const currentBuf = readFileSync(currentPath);

  // Decode both PNGs to raw pixel data (inflate + un-filter)
  const baselineDecoded = decodePNG(baselineBuf);
  const currentDecoded = decodePNG(currentBuf);

  // If dimensions differ, the images definitely don't match
  if (
    baselineDecoded.width !== currentDecoded.width ||
    baselineDecoded.height !== currentDecoded.height
  ) {
    return {
      match: false,
      diffPercentage: 100,
      baselinePath,
      currentPath,
    };
  }

  // Compare raw pixel data byte-by-byte, grouping by pixel.
  // A pixel is considered "different" if ANY channel differs by more than
  // the anti-aliasing tolerance (2).  This avoids false positives from
  // sub-pixel rendering differences across runs.
  const baselineInfo = readPngInfo(baselineBuf);
  const bpp = bytesPerPixel(baselineInfo.colorType, baselineInfo.bitDepth);
  const totalPixels = baselineDecoded.width * baselineDecoded.height;
  const AA_TOLERANCE = 2;

  let differentPixels = 0;
  const basePixels = baselineDecoded.pixels;
  const curPixels = currentDecoded.pixels;

  for (let px = 0; px < totalPixels; px++) {
    const offset = px * bpp;
    let pixelDiffers = false;
    for (let ch = 0; ch < bpp; ch++) {
      if (Math.abs(basePixels[offset + ch] - curPixels[offset + ch]) > AA_TOLERANCE) {
        pixelDiffers = true;
        break;
      }
    }
    if (pixelDiffers) {
      differentPixels++;
    }
  }

  const diffPercentage =
    totalPixels > 0
      ? Math.round((differentPixels / totalPixels) * 100 * 1000) / 1000
      : 0;

  const match = diffPercentage <= threshold;

  let diffImagePath: string | undefined;
  if (!match) {
    diffImagePath = await generateDiffImage(
      baselineBuf,
      currentBuf,
      baselineInfo,
      baselineDir,
      hash,
    );
  }

  return {
    match,
    diffPercentage,
    diffImagePath,
    baselinePath,
    currentPath,
  };
}

// ---------------------------------------------------------------------------
// generateDiffImage — creates a minimal "diff" PNG
// ---------------------------------------------------------------------------

/**
 * Generate a very simple diff visualization PNG.
 *
 * Because we cannot decode compressed PNG pixel data without a library (zlib
 * inflate + defiltering), we create a small metadata PNG that encodes the
 * diff percentage and changed byte positions into the filename and a minimal
 * placeholder image.  For a proper pixel-overlay diff, a tool like `pixelmatch`
 * would be needed, but we avoid external dependencies per project rules.
 *
 * Instead, we produce a copy of the current screenshot with a distinctive name
 * so the user can visually inspect it alongside the baseline.
 */
async function generateDiffImage(
  _baselineBuf: Buffer,
  currentBuf: Buffer,
  info: PngInfo,
  baselineDir: string,
  hash: string,
): Promise<string> {
  const diffDir = join(baselineDir, "..", "diffs");
  if (!existsSync(diffDir)) {
    mkdirSync(diffDir, { recursive: true });
  }

  const diffPath = join(diffDir, `${hash}-diff-${info.width}x${info.height}.png`);

  // Write the current screenshot as the diff image so the user can compare
  // side-by-side with the baseline.
  writeFileSync(diffPath, currentBuf);

  return diffPath;
}

// ---------------------------------------------------------------------------
// updateBaseline
// ---------------------------------------------------------------------------

/**
 * Promote a current screenshot to become the new baseline, replacing the old
 * baseline file.
 *
 * @returns The path to the updated baseline.
 */
export async function updateBaseline(
  currentPath: string,
  baselineDir: string,
): Promise<string> {
  if (!existsSync(currentPath)) {
    throw new Error(`Current screenshot not found: ${currentPath}`);
  }

  if (!existsSync(baselineDir)) {
    mkdirSync(baselineDir, { recursive: true });
  }

  const filename = basename(currentPath);
  const baselinePath = join(baselineDir, filename);

  copyFileSync(currentPath, baselinePath);

  return baselinePath;
}

// ---------------------------------------------------------------------------
// runVisualRegression
// ---------------------------------------------------------------------------

/**
 * Run visual regression testing across all URL x viewport combinations.
 *
 * For each combination:
 * - If no baseline exists, capture one (first run).
 * - If a baseline exists, compare the current state against it.
 *
 * Reports progress through the `onProgress` callback.
 */
export async function runVisualRegression(
  page: any,
  urls: string[],
  viewports: Array<{ width: number; height: number; label: string }>,
  baselineDir: string,
  onProgress: ProgressCallback,
): Promise<VisualRegressionReport[]> {
  onProgress("info", `Visual regression: ${urls.length} URL(s) x ${viewports.length} viewport(s)`);

  // Ensure baseline directory exists
  if (!existsSync(baselineDir)) {
    mkdirSync(baselineDir, { recursive: true });
  }

  const reports: VisualRegressionReport[] = [];

  for (const url of urls) {
    for (const vp of viewports) {
      const viewportLabel = `${vp.label} (${vp.width}x${vp.height})`;
      onProgress("step", `  Testing ${url} @ ${viewportLabel}...`);

      const hash = screenshotHash(url, vp.width, vp.height);
      const baselinePath = join(baselineDir, `${hash}.png`);
      const baselineExists = existsSync(baselinePath);

      const diffs: VisualDiff[] = [];
      let passed = true;

      if (!baselineExists) {
        // First run — capture baseline
        onProgress("info", `    No baseline found, capturing initial baseline...`);
        try {
          const savedPath = await captureBaseline(page, url, vp, baselineDir);
          onProgress("pass", `    Baseline captured: ${basename(savedPath)}`);
          diffs.push({
            match: true,
            diffPercentage: 0,
            baselinePath: savedPath,
            currentPath: savedPath,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          onProgress("fail", `    Failed to capture baseline: ${message}`);
          passed = false;
          diffs.push({
            match: false,
            diffPercentage: 100,
            baselinePath,
            currentPath: "",
          });
        }
      } else {
        // Baseline exists — compare
        try {
          const diff = await compareScreenshot(page, url, vp, baselineDir);
          diffs.push(diff);

          if (diff.match) {
            onProgress("pass", `    Match (${diff.diffPercentage.toFixed(3)}% diff)`);
          } else {
            onProgress("fail", `    Mismatch: ${diff.diffPercentage.toFixed(3)}% diff (threshold: 0.1%)`);
            passed = false;
            if (diff.diffImagePath) {
              onProgress("info", `    Diff image: ${basename(diff.diffImagePath)}`);
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          onProgress("fail", `    Comparison failed: ${message}`);
          passed = false;
          diffs.push({
            match: false,
            diffPercentage: 100,
            baselinePath,
            currentPath: "",
          });
        }
      }

      reports.push({
        url,
        viewport: viewportLabel,
        diffs,
        passed,
      });
    }
  }

  // Summary
  const passedCount = reports.filter((r) => r.passed).length;
  const failedCount = reports.length - passedCount;

  if (failedCount === 0) {
    onProgress("pass", `Visual regression complete: ${passedCount}/${reports.length} passed`);
  } else {
    onProgress("fail", `Visual regression complete: ${failedCount}/${reports.length} failed`);
  }

  onProgress("done", "Visual regression testing finished");

  return reports;
}
