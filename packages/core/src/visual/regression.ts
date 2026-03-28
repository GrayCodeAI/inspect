// ============================================================================
// Visual Regression — Captures screenshots, diffs against baselines,
// generates reports, and posts results to GitHub PRs
// ============================================================================

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { PRInfo } from "../github/pr.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("core/visual-regression");

/** Configuration for visual regression testing */
export interface VisualRegressionConfig {
  /** Directory to store baseline screenshots */
  baselineDir: string;
  /** Directory to store current screenshots and reports */
  outputDir: string;
  /** Pixel difference threshold (0-255, default 10) */
  threshold?: number;
  /** Whether to update baselines on first run */
  updateBaselines?: boolean;
  /** GitHub PR info for posting results */
  pr?: PRInfo;
}

/** Result of a single screenshot comparison */
export interface VisualComparisonResult {
  name: string;
  matched: boolean;
  mismatchPercentage: number;
  baselinePath: string;
  currentPath: string;
  diffImage?: string;
  url?: string;
  viewport?: { width: number; height: number };
}

/** Full visual regression report */
export interface VisualRegressionReport {
  results: VisualComparisonResult[];
  passed: number;
  failed: number;
  newBaselines: number;
  reportPath?: string;
  timestamp: number;
}

/**
 * VisualRegression manages screenshot comparison workflows:
 *
 * 1. Capture screenshots during test execution
 * 2. Compare against stored baselines using VisualDiff
 * 3. Generate interactive HTML reports via SliderReport
 * 4. Post results as GitHub PR comments with status checks
 */
export class VisualRegression {
  private config: VisualRegressionConfig;
  private results: VisualComparisonResult[] = [];
  private dirsReady = false;

  constructor(config: VisualRegressionConfig) {
    this.config = config;
  }

  private async ensureDirectories(): Promise<void> {
    if (this.dirsReady) return;
    await mkdir(this.config.baselineDir, { recursive: true });
    await mkdir(this.config.outputDir, { recursive: true });
    this.dirsReady = true;
  }

  /**
   * Compare a screenshot against its baseline.
   * If no baseline exists and updateBaselines is true, creates one.
   */
  async compare(
    name: string,
    screenshotBuffer: Buffer,
    options?: { url?: string; viewport?: { width: number; height: number } },
  ): Promise<VisualComparisonResult> {
    await this.ensureDirectories();
    const { VisualDiff } = await import("@inspect/visual");

    const baselinePath = join(this.config.baselineDir, `${name}.png`);
    const currentPath = join(this.config.outputDir, `${name}.current.png`);

    // Save current screenshot
    await writeFile(currentPath, screenshotBuffer);

    // Check for baseline
    if (!existsSync(baselinePath)) {
      if (this.config.updateBaselines) {
        await writeFile(baselinePath, screenshotBuffer);
        const result: VisualComparisonResult = {
          name,
          matched: true,
          mismatchPercentage: 0,
          baselinePath,
          currentPath,
          url: options?.url,
          viewport: options?.viewport,
        };
        this.results.push(result);
        return result;
      }

      // No baseline and not auto-creating — report as new
      const result: VisualComparisonResult = {
        name,
        matched: true,
        mismatchPercentage: 0,
        baselinePath: "(no baseline)",
        currentPath,
        url: options?.url,
        viewport: options?.viewport,
      };
      this.results.push(result);
      return result;
    }

    // Load baseline and compare
    const baselineBuffer = await readFile(baselinePath);
    const diff = new VisualDiff();

    // Decode PNG dimensions from header (basic approach — width/height at offset 16)
    const width = options?.viewport?.width ?? readPngWidth(baselineBuffer);
    const height = options?.viewport?.height ?? readPngHeight(baselineBuffer);

    const diffResult = diff.compare(
      { data: screenshotBuffer as unknown as Uint8Array, width, height },
      { data: baselineBuffer as unknown as Uint8Array, width, height },
      {
        threshold: this.config.threshold ?? 10,
        includeDiffImage: true,
        computeRegions: true,
      },
    );

    const result: VisualComparisonResult = {
      name,
      matched: diffResult.matched,
      mismatchPercentage: diffResult.mismatchPercentage,
      baselinePath,
      currentPath,
      diffImage: diffResult.diffImage,
      url: options?.url,
      viewport: options?.viewport,
    };

    this.results.push(result);

    // Auto-update baseline if matching
    if (this.config.updateBaselines && diffResult.matched) {
      await writeFile(baselinePath, screenshotBuffer);
    }

    return result;
  }

  /**
   * Generate the full report, including HTML slider report.
   */
  async generateReport(): Promise<VisualRegressionReport> {
    await this.ensureDirectories();
    const passed = this.results.filter((r) => r.matched).length;
    const failed = this.results.filter((r) => !r.matched).length;
    const newBaselines = this.results.filter(
      (r) => r.baselinePath === "(no baseline)",
    ).length;

    let reportPath: string | undefined;

    // Generate HTML slider report if there are results
    if (this.results.length > 0) {
      try {
        const { SliderReport } = await import("@inspect/visual");
        const report = new SliderReport();

        const filtered = this.results.filter(
          (r) => r.baselinePath !== "(no baseline)",
        );
        const entries = await Promise.all(
          filtered.map(async (r) => ({
            label: r.name,
            viewport: r.viewport ?? { width: 1280, height: 720 },
            matched: r.matched,
            mismatchPercentage: r.mismatchPercentage,
            referenceImage: await safeReadBase64(r.baselinePath),
            testImage: await safeReadBase64(r.currentPath),
            diffImage: r.diffImage,
            url: r.url,
            timestamp: Date.now(),
          })),
        );

        if (entries.length > 0) {
          const html = report.generate(entries);
          reportPath = join(this.config.outputDir, "visual-report.html");
          await writeFile(reportPath, html, "utf-8");
        }
      } catch (error) {
        logger.debug("Slider report generation failed (optional)", { err: error instanceof Error ? error.message : String(error) });
      }
    }

    return {
      results: this.results,
      passed,
      failed,
      newBaselines,
      reportPath,
      timestamp: Date.now(),
    };
  }

  /**
   * Post visual regression results to a GitHub PR.
   * Creates a comment with a summary table and sets a commit status.
   */
  async postToGitHub(
    report: VisualRegressionReport,
    pr: PRInfo,
  ): Promise<void> {
    const { PRComments } = await import("../github/comments.js");
    const comments = new PRComments();

    // Build markdown summary
    const statusIcon = report.failed === 0 ? "✅" : "❌";
    const lines = [
      `## ${statusIcon} Visual Regression Results`,
      "",
      `| Metric | Value |`,
      `| --- | --- |`,
      `| Screenshots | ${report.results.length} |`,
      `| Passed | ${report.passed} |`,
      `| Failed | ${report.failed} |`,
      `| New Baselines | ${report.newBaselines} |`,
    ];

    if (report.failed > 0) {
      lines.push("", "### Failed Comparisons", "");
      lines.push("| Screenshot | Mismatch | URL |");
      lines.push("| --- | --- | --- |");
      for (const r of report.results.filter((r) => !r.matched)) {
        lines.push(
          `| ${r.name} | ${r.mismatchPercentage.toFixed(2)}% | ${r.url ?? "-"} |`,
        );
      }
    }

    if (report.reportPath) {
      lines.push("", `> Full interactive report saved to \`${report.reportPath}\``);
    }

    lines.push("", "<!-- inspect-visual-results -->");

    await comments.postComment({
      pr,
      body: lines.join("\n"),
    });

    // Set commit status
    try {
      const sha = await comments.getPRHeadSha(pr);
      await comments.setStatus({
        pr,
        sha,
        state: report.failed === 0 ? "success" : "failure",
        description: report.failed === 0
          ? `${report.passed} screenshots match`
          : `${report.failed} screenshot(s) differ`,
        context: "inspect/visual-regression",
      });
    } catch (error) {
      logger.debug("GitHub status check failed (optional)", { err: error instanceof Error ? error.message : String(error) });
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Read a PNG file as base64 data URI, or return empty string on error */
async function safeReadBase64(filePath: string): Promise<string> {
  try {
    if (!existsSync(filePath) || filePath === "(no baseline)") return "";
    const buf = await readFile(filePath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch (error) {
    logger.debug("Failed to read image for data URL", { filePath, err: error instanceof Error ? error.message : String(error) });
    return "";
  }
}

/** Read PNG width from IHDR chunk (bytes 16-19, big-endian) */
function readPngWidth(buf: Buffer): number {
  if (buf.length < 24) return 1280;
  return buf.readUInt32BE(16);
}

/** Read PNG height from IHDR chunk (bytes 20-23, big-endian) */
function readPngHeight(buf: Buffer): number {
  if (buf.length < 24) return 720;
  return buf.readUInt32BE(20);
}
