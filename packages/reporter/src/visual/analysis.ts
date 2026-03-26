// ──────────────────────────────────────────────────────────────────────────────
// @inspect/reporter - AI-Powered Visual Diff Analysis
// ──────────────────────────────────────────────────────────────────────────────

import type { VisualDiffResult, MaskRegion } from "./diff.js";

/** LLM provider interface (minimal subset needed for analysis) */
export interface AnalysisLLM {
  chat(
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string | Array<{ type: string; text?: string; image_base64?: { media_type: string; data: string }; image_url?: { url: string } }>;
    }>,
    tools?: undefined,
    options?: { maxTokens?: number; temperature?: number; responseFormat?: string },
  ): Promise<{ content: string }>;
  supportsVision(): boolean;
}

/** Analysis result */
export interface AnalysisResult {
  /** Overall assessment */
  assessment: "identical" | "minor_change" | "significant_change" | "regression" | "improvement";
  /** Confidence in the assessment (0-1) */
  confidence: number;
  /** Human-readable summary */
  summary: string;
  /** Specific changes detected */
  changes: VisualChange[];
  /** Whether this change should block the pipeline */
  shouldBlock: boolean;
  /** Suggested action */
  suggestedAction: "accept" | "review" | "reject";
  /** Raw LLM response for debugging */
  rawResponse?: string;
}

/** A specific visual change detected */
export interface VisualChange {
  /** What changed */
  description: string;
  /** Where on the page */
  location: string;
  /** Category of change */
  category: "layout" | "color" | "text" | "spacing" | "size" | "visibility" | "new_element" | "removed_element" | "other";
  /** Severity */
  severity: "critical" | "major" | "minor" | "trivial";
  /** Whether this is intentional (AI assessment) */
  likelyIntentional: boolean;
  /** Bounding region if identifiable */
  region?: MaskRegion;
}

/** Options for analysis */
export interface AnalysisOptions {
  /** Context about what changed (git diff, PR description, etc.) */
  changeContext?: string;
  /** What page/component this screenshot is from */
  pageName?: string;
  /** Previous analysis results for this page (for pattern learning) */
  previousAnalyses?: AnalysisResult[];
  /** Maximum tokens for the LLM response */
  maxTokens?: number;
}

/**
 * Uses an LLM to analyze visual diffs and provide intelligent
 * assessment of screenshot changes.
 *
 * Instead of just saying "pixels changed", it can identify:
 * - Layout shifts vs intentional redesign
 * - Content changes vs style changes
 * - Regressions vs improvements
 * - Whether changes are likely intentional
 */
export class AIAnalysis {
  /**
   * Analyze a visual diff using an LLM with vision capabilities.
   *
   * @param diff - The visual diff result with diff image data
   * @param actualBase64 - Base64-encoded actual screenshot
   * @param baselineBase64 - Base64-encoded baseline screenshot
   * @param llm - LLM provider with vision support
   * @param options - Analysis options
   */
  async analyze(
    diff: VisualDiffResult,
    actualBase64: string,
    baselineBase64: string,
    llm: AnalysisLLM,
    options?: AnalysisOptions,
  ): Promise<AnalysisResult> {
    if (!llm.supportsVision()) {
      return this.fallbackAnalysis(diff);
    }

    const prompt = this.buildPrompt(diff, options);

    try {
      const response = await llm.chat(
        [
          {
            role: "system",
            content: ANALYSIS_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_base64",
                image_base64: {
                  media_type: "image/png",
                  data: baselineBase64,
                },
              },
              {
                type: "image_base64",
                image_base64: {
                  media_type: "image/png",
                  data: actualBase64,
                },
              },
            ],
          },
        ],
        undefined,
        {
          maxTokens: options?.maxTokens ?? 1500,
          temperature: 0,
          responseFormat: "json",
        },
      );

      return this.parseResponse(response.content, diff);
    } catch (error) {
      // Fall back to pixel-based analysis
      return this.fallbackAnalysis(diff);
    }
  }

  /**
   * Batch analyze multiple diffs at once (more efficient for large suites).
   */
  async analyzeBatch(
    diffs: Array<{
      name: string;
      diff: VisualDiffResult;
      actualBase64: string;
      baselineBase64: string;
    }>,
    llm: AnalysisLLM,
    options?: AnalysisOptions,
  ): Promise<Map<string, AnalysisResult>> {
    const results = new Map<string, AnalysisResult>();

    // Process in parallel with concurrency limit
    const concurrency = 3;
    for (let i = 0; i < diffs.length; i += concurrency) {
      const batch = diffs.slice(i, i + concurrency);
      const promises = batch.map(async (item) => {
        const result = await this.analyze(
          item.diff,
          item.actualBase64,
          item.baselineBase64,
          llm,
          options,
        );
        results.set(item.name, result);
      });
      await Promise.all(promises);
    }

    return results;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildPrompt(diff: VisualDiffResult, options?: AnalysisOptions): string {
    const parts: string[] = [];

    parts.push("I have two screenshots: the FIRST image is the BASELINE (expected) and the SECOND image is the ACTUAL (current).");
    parts.push(`\nDiff stats: ${diff.mismatchedPixels} pixels differ out of ${diff.totalPixels} (${diff.mismatchPercent.toFixed(2)}%).`);

    if (diff.diffBoundingBox) {
      const bb = diff.diffBoundingBox;
      parts.push(`Changes are concentrated in region: x=${bb.x}, y=${bb.y}, ${bb.width}x${bb.height} pixels.`);
    }

    if (options?.pageName) {
      parts.push(`\nPage/component: ${options.pageName}`);
    }

    if (options?.changeContext) {
      parts.push(`\nChange context (what was modified in code):\n${options.changeContext}`);
    }

    parts.push("\nAnalyze the visual differences and respond with a JSON object matching this schema:");
    parts.push(JSON.stringify({
      assessment: "identical | minor_change | significant_change | regression | improvement",
      confidence: "number 0-1",
      summary: "string - one paragraph summary",
      changes: [{
        description: "string",
        location: "string (e.g., 'top navigation bar', 'login form')",
        category: "layout | color | text | spacing | size | visibility | new_element | removed_element | other",
        severity: "critical | major | minor | trivial",
        likelyIntentional: "boolean",
      }],
      shouldBlock: "boolean - true if this should block the CI pipeline",
      suggestedAction: "accept | review | reject",
    }, null, 2));

    return parts.join("\n");
  }

  private parseResponse(raw: string, diff: VisualDiffResult): AnalysisResult {
    try {
      const parsed = JSON.parse(raw) as Partial<AnalysisResult>;

      return {
        assessment: parsed.assessment ?? "significant_change",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
        summary: parsed.summary ?? "Unable to generate detailed analysis.",
        changes: Array.isArray(parsed.changes) ? parsed.changes.map(normalizeChange) : [],
        shouldBlock: parsed.shouldBlock ?? diff.mismatchPercent > 5,
        suggestedAction: parsed.suggestedAction ?? "review",
        rawResponse: raw,
      };
    } catch {
      return this.fallbackAnalysis(diff, raw);
    }
  }

  /**
   * Fallback analysis when the LLM is unavailable.
   * Uses only pixel-level diff data to make assessments.
   */
  private fallbackAnalysis(diff: VisualDiffResult, rawResponse?: string): AnalysisResult {
    const percent = diff.mismatchPercent;

    let assessment: AnalysisResult["assessment"];
    let shouldBlock: boolean;
    let suggestedAction: AnalysisResult["suggestedAction"];

    if (percent === 0) {
      assessment = "identical";
      shouldBlock = false;
      suggestedAction = "accept";
    } else if (percent < 0.5) {
      assessment = "minor_change";
      shouldBlock = false;
      suggestedAction = "accept";
    } else if (percent < 5) {
      assessment = "minor_change";
      shouldBlock = false;
      suggestedAction = "review";
    } else if (percent < 20) {
      assessment = "significant_change";
      shouldBlock = true;
      suggestedAction = "review";
    } else {
      assessment = "regression";
      shouldBlock = true;
      suggestedAction = "reject";
    }

    const changes: VisualChange[] = [];

    if (diff.diffBoundingBox && percent > 0) {
      const bb = diff.diffBoundingBox;
      changes.push({
        description: `Visual difference detected in a ${bb.width}x${bb.height} pixel region`,
        location: `Region at (${bb.x}, ${bb.y})`,
        category: "other",
        severity: percent > 10 ? "major" : percent > 2 ? "minor" : "trivial",
        likelyIntentional: false,
      });
    }

    return {
      assessment,
      confidence: 0.5, // Low confidence without AI
      summary: `Pixel comparison found ${diff.mismatchedPixels} different pixels (${percent.toFixed(2)}% mismatch).${
        diff.diffBoundingBox
          ? ` Changes concentrated at position (${diff.diffBoundingBox.x}, ${diff.diffBoundingBox.y}).`
          : ""
      }`,
      changes,
      shouldBlock,
      suggestedAction,
      rawResponse,
    };
  }
}

const ANALYSIS_SYSTEM_PROMPT = `You are a visual regression testing specialist. Your job is to compare two screenshots (baseline vs actual) and identify meaningful visual changes.

Guidelines:
- Focus on user-visible changes, not pixel-level noise
- Anti-aliasing differences and sub-pixel rendering changes are trivial
- Layout shifts, missing elements, and broken styling are significant
- Consider whether changes might be intentional (e.g., after a UI update)
- Be precise about the location and nature of changes
- Distinguish between regressions (things got worse) and improvements

Respond with valid JSON only. No markdown, no explanations outside the JSON structure.`;

function normalizeChange(change: Partial<VisualChange>): VisualChange {
  return {
    description: change.description ?? "Unspecified change",
    location: change.location ?? "Unknown",
    category: change.category ?? "other",
    severity: change.severity ?? "minor",
    likelyIntentional: change.likelyIntentional ?? false,
    region: change.region,
  };
}
