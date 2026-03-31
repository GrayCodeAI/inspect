// ──────────────────────────────────────────────────────────────────────────────
// @inspect/reporter - Visual Diff Comparison
// ──────────────────────────────────────────────────────────────────────────────

/** Options for visual comparison */
export interface VisualDiffOptions {
  /** Mismatch threshold (0-1). Pixels with distance > threshold are different. */
  threshold?: number;
  /** Allowed percentage of mismatched pixels (0-100) before failing */
  allowedMismatchPercent?: number;
  /** Regions to mask (ignore during comparison) */
  masks?: MaskRegion[];
  /** Whether to apply anti-aliasing detection */
  antiAliasing?: boolean;
  /** Color for the diff overlay (RGBA) */
  diffColor?: [number, number, number, number];
}

/** A rectangular region to mask during comparison */
export interface MaskRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional label for the mask */
  label?: string;
}

/** Result of a visual comparison (re-exported from shared/types for compatibility) */
export type { VisualDiffResult } from "../../shared/types/quality.js";

/** Extended result with additional metrics */
export interface VisualDiffResultExtended {
  /** Whether the images match within the threshold */
  matched: boolean;
  /** Percentage of mismatched pixels */
  mismatchPercentage: number;
  /** Diff image as base64 string */
  diffImage?: string;
  /** Dimensions */
  dimensions: { width: number; height: number };
  /** Number of pixels that differ */
  mismatchedPixels: number;
  /** Total pixels compared */
  totalPixels: number;
  /** Diff image as raw RGBA pixel data */
  diffData?: Uint8ClampedArray;
  /** Bounding box of the largest diff region */
  diffBoundingBox?: { x: number; y: number; width: number; height: number };
  /** Time taken for comparison (ms) */
  elapsed: number;
}

/**
 * Pixel-level visual comparison between screenshots.
 *
 * Compares two images (actual vs baseline) at the pixel level,
 * with support for configurable thresholds, masking regions,
 * and anti-aliasing detection.
 *
 * Works with raw RGBA pixel buffers for zero-dependency operation.
 */
export class VisualDiff {
  private options: Required<VisualDiffOptions>;

  constructor(options?: VisualDiffOptions) {
    this.options = {
      threshold: options?.threshold ?? 0.1,
      allowedMismatchPercent: options?.allowedMismatchPercent ?? 0.5,
      masks: options?.masks ?? [],
      antiAliasing: options?.antiAliasing ?? true,
      diffColor: options?.diffColor ?? [255, 0, 255, 200],
    };
  }

  /**
   * Compare two images represented as raw RGBA pixel buffers.
   *
   * @param actual - The actual screenshot (RGBA Uint8ClampedArray)
   * @param baseline - The baseline screenshot (RGBA Uint8ClampedArray)
   * @param width - Image width
   * @param height - Image height
   */
  compare(
    actual: Uint8ClampedArray,
    baseline: Uint8ClampedArray,
    width: number,
    height: number,
  ): VisualDiffResultExtended {
    const start = Date.now();

    if (actual.length !== baseline.length) {
      return {
        matched: false,
        mismatchPercentage: 100,
        diffImage: undefined,
        dimensions: { width, height },
        mismatchedPixels: width * height,
        totalPixels: width * height,
        diffBoundingBox: undefined,
        elapsed: Date.now() - start,
      };
    }

    const totalPixels = width * height;
    const diffData = new Uint8ClampedArray(actual.length);
    let mismatchedPixels = 0;

    // Bounding box tracking
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        // Check if pixel is in a masked region
        if (this.isInMask(x, y)) {
          // Copy actual pixel (neutral)
          diffData[idx] = actual[idx];
          diffData[idx + 1] = actual[idx + 1];
          diffData[idx + 2] = actual[idx + 2];
          diffData[idx + 3] = 80; // Dim masked areas
          continue;
        }

        const r1 = actual[idx], g1 = actual[idx + 1], b1 = actual[idx + 2], a1 = actual[idx + 3];
        const r2 = baseline[idx], g2 = baseline[idx + 1], b2 = baseline[idx + 2], a2 = baseline[idx + 3];

        const distance = this.colorDistance(r1, g1, b1, a1, r2, g2, b2, a2);

        if (distance > this.options.threshold) {
          // Check if it might be anti-aliasing
          if (this.options.antiAliasing && this.isAntiAliased(actual, baseline, x, y, width, height)) {
            // Treat as matching
            diffData[idx] = actual[idx];
            diffData[idx + 1] = actual[idx + 1];
            diffData[idx + 2] = actual[idx + 2];
            diffData[idx + 3] = actual[idx + 3];
          } else {
            mismatchedPixels++;
            diffData[idx] = this.options.diffColor[0];
            diffData[idx + 1] = this.options.diffColor[1];
            diffData[idx + 2] = this.options.diffColor[2];
            diffData[idx + 3] = this.options.diffColor[3];

            // Update bounding box
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        } else {
          // Matching pixel - dim it in the diff output
          diffData[idx] = actual[idx];
          diffData[idx + 1] = actual[idx + 1];
          diffData[idx + 2] = actual[idx + 2];
          diffData[idx + 3] = Math.min(actual[idx + 3], 100);
        }
      }
    }

    const mismatchPercent = totalPixels > 0
      ? (mismatchedPixels / totalPixels) * 100
      : 0;

    const match = mismatchPercent <= this.options.allowedMismatchPercent;

    const diffBoundingBox = mismatchedPixels > 0
      ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
      : undefined;

    return {
      matched: match,
      mismatchPercentage: Math.round(mismatchPercent * 1000) / 1000,
      diffImage: undefined,
      dimensions: { width, height },
      mismatchedPixels,
      totalPixels,
      diffData,
      diffBoundingBox,
      elapsed: Date.now() - start,
    };
  }

  /**
   * Generate a diff image combining actual, baseline, and diff views
   * side by side.
   *
   * Returns RGBA pixel data for a 3x-wide image:
   * [baseline | diff | actual]
   */
  generateDiffImage(
    actual: Uint8ClampedArray,
    baseline: Uint8ClampedArray,
    width: number,
    height: number,
  ): { data: Uint8ClampedArray; width: number; height: number } {
    const diffResult = this.compare(actual, baseline, width, height);
    const compositeWidth = width * 3;
    const composite = new Uint8ClampedArray(compositeWidth * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4;

        // Baseline (left)
        const leftIdx = (y * compositeWidth + x) * 4;
        composite[leftIdx] = baseline[srcIdx];
        composite[leftIdx + 1] = baseline[srcIdx + 1];
        composite[leftIdx + 2] = baseline[srcIdx + 2];
        composite[leftIdx + 3] = baseline[srcIdx + 3];

        // Diff (center)
        const centerIdx = (y * compositeWidth + (x + width)) * 4;
        if (diffResult.diffData) {
          composite[centerIdx] = diffResult.diffData[srcIdx];
          composite[centerIdx + 1] = diffResult.diffData[srcIdx + 1];
          composite[centerIdx + 2] = diffResult.diffData[srcIdx + 2];
          composite[centerIdx + 3] = diffResult.diffData[srcIdx + 3];
        }

        // Actual (right)
        const rightIdx = (y * compositeWidth + (x + width * 2)) * 4;
        composite[rightIdx] = actual[srcIdx];
        composite[rightIdx + 1] = actual[srcIdx + 1];
        composite[rightIdx + 2] = actual[srcIdx + 2];
        composite[rightIdx + 3] = actual[srcIdx + 3];
      }
    }

    return { data: composite, width: compositeWidth, height };
  }

  /**
   * Add a mask region (will be ignored during comparison).
   */
  addMask(region: MaskRegion): void {
    this.options.masks.push(region);
  }

  /**
   * Clear all mask regions.
   */
  clearMasks(): void {
    this.options.masks = [];
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * CIE76 color distance (perceptual difference in CIELAB space).
   * Normalized to 0-1 range.
   */
  private colorDistance(
    r1: number, g1: number, b1: number, a1: number,
    r2: number, g2: number, b2: number, a2: number,
  ): number {
    // Blend with white background based on alpha
    const blend1R = (r1 * a1 + 255 * (255 - a1)) / 255;
    const blend1G = (g1 * a1 + 255 * (255 - a1)) / 255;
    const blend1B = (b1 * a1 + 255 * (255 - a1)) / 255;

    const blend2R = (r2 * a2 + 255 * (255 - a2)) / 255;
    const blend2G = (g2 * a2 + 255 * (255 - a2)) / 255;
    const blend2B = (b2 * a2 + 255 * (255 - a2)) / 255;

    // Simple RGB distance normalized to 0-1
    const dr = (blend1R - blend2R) / 255;
    const dg = (blend1G - blend2G) / 255;
    const db = (blend1B - blend2B) / 255;

    return Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3);
  }

  /**
   * Check if a pixel might be an anti-aliasing artifact.
   */
  private isAntiAliased(
    img1: Uint8ClampedArray,
    img2: Uint8ClampedArray,
    x: number,
    y: number,
    width: number,
    height: number,
  ): boolean {
    // Check if the pixel has neighbors that are very similar in one image
    // but different in the other (characteristic of anti-aliasing)
    let similar1 = 0;
    let similar2 = 0;

    const idx = (y * width + x) * 4;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;

        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

        const nIdx = (ny * width + nx) * 4;

        const dist1 = this.colorDistance(
          img1[idx], img1[idx + 1], img1[idx + 2], img1[idx + 3],
          img1[nIdx], img1[nIdx + 1], img1[nIdx + 2], img1[nIdx + 3],
        );

        const dist2 = this.colorDistance(
          img2[idx], img2[idx + 1], img2[idx + 2], img2[idx + 3],
          img2[nIdx], img2[nIdx + 1], img2[nIdx + 2], img2[nIdx + 3],
        );

        if (dist1 < 0.05) similar1++;
        if (dist2 < 0.05) similar2++;
      }
    }

    // If the pixel has many similar neighbors in one image but not the other,
    // it's likely anti-aliasing
    return Math.abs(similar1 - similar2) >= 3;
  }

  /**
   * Check if a coordinate falls within any mask region.
   */
  private isInMask(x: number, y: number): boolean {
    for (const mask of this.options.masks) {
      if (
        x >= mask.x &&
        x < mask.x + mask.width &&
        y >= mask.y &&
        y < mask.y + mask.height
      ) {
        return true;
      }
    }
    return false;
  }
}
