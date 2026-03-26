// ============================================================================
// @inspect/visual - Pixel-level Visual Diff
// ============================================================================

import type { VisualDiffResult, BoundingBox } from "@inspect/shared";

/** Options for visual comparison */
export interface VisualDiffOptions {
  /** Color difference threshold (0-255). Pixels within this threshold are considered matching. */
  threshold?: number;
  /** Maximum mismatch percentage before marking as different */
  maxDiffPercentage?: number;
  /** Whether to detect and ignore anti-aliasing artifacts */
  antiAliasing?: boolean;
  /** Anti-aliasing detection radius */
  antiAliasingRadius?: number;
  /** Alpha channel comparison mode */
  alpha?: "ignore" | "compare";
  /** Diff highlight color [R, G, B, A] */
  diffColor?: [number, number, number, number];
  /** Moved pixel color [R, G, B, A] */
  movedColor?: [number, number, number, number];
  /** Whether to include the diff image buffer in results */
  includeDiffImage?: boolean;
  /** Whether to compute diff regions (bounding boxes of changed areas) */
  computeRegions?: boolean;
}

/** Raw image data (RGBA pixels) */
export interface RawImage {
  /** Raw pixel buffer (RGBA, 4 bytes per pixel) */
  data: Uint8Array | Buffer;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
}

const DEFAULT_THRESHOLD = 10;
const DEFAULT_DIFF_COLOR: [number, number, number, number] = [255, 0, 0, 200];
const DEFAULT_MOVED_COLOR: [number, number, number, number] = [255, 165, 0, 200];

/**
 * VisualDiff performs pixel-by-pixel RGBA comparison between two images
 * with anti-aliasing detection and diff image generation.
 */
export class VisualDiff {
  /**
   * Compare two images pixel by pixel.
   *
   * Both images must have the same dimensions. If they differ,
   * the comparison uses the larger dimensions (padding the smaller image).
   */
  compare(actual: RawImage, baseline: RawImage, options: VisualDiffOptions = {}): VisualDiffResult {
    const threshold = options.threshold ?? DEFAULT_THRESHOLD;
    const antiAliasing = options.antiAliasing ?? true;
    const antiAliasingRadius = options.antiAliasingRadius ?? 1;
    const alpha = options.alpha ?? "ignore";
    const diffColor = options.diffColor ?? DEFAULT_DIFF_COLOR;
    const includeDiffImage = options.includeDiffImage ?? true;
    const computeRegions = options.computeRegions ?? false;

    // Use the maximum dimensions
    const width = Math.max(actual.width, baseline.width);
    const height = Math.max(actual.height, baseline.height);
    const totalPixels = width * height;

    // Create diff image buffer
    const diffData = includeDiffImage ? new Uint8Array(width * height * 4) : null;

    let diffCount = 0;
    const diffPixels: Array<{ x: number; y: number }> = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const actualPixel = this.getPixel(actual, x, y);
        const baselinePixel = this.getPixel(baseline, x, y);

        // Compare pixels
        const colorDiff = this.pixelDifference(actualPixel, baselinePixel, alpha);
        const isMatch = colorDiff <= threshold;

        if (!isMatch) {
          // Check anti-aliasing
          if (antiAliasing && this.isAntiAliased(actual, baseline, x, y, antiAliasingRadius, threshold)) {
            // Anti-aliased pixel - mark as matching
            if (diffData) {
              this.setPixel(diffData, width, x, y, actualPixel);
            }
          } else {
            // Real difference
            diffCount++;
            if (diffData) {
              this.setPixel(diffData, width, x, y, diffColor);
            }
            if (computeRegions) {
              diffPixels.push({ x, y });
            }
          }
        } else {
          // Matching pixel - blend actual into diff image with reduced opacity
          if (diffData) {
            const blended: [number, number, number, number] = [
              Math.round(actualPixel[0] * 0.3),
              Math.round(actualPixel[1] * 0.3),
              Math.round(actualPixel[2] * 0.3),
              255,
            ];
            this.setPixel(diffData, width, x, y, blended);
          }
        }
      }
    }

    const mismatchPercentage = totalPixels > 0 ? (diffCount / totalPixels) * 100 : 0;
    const maxDiff = options.maxDiffPercentage ?? 0;
    const matched = mismatchPercentage <= maxDiff;

    // Compute diff regions
    let diffRegions: BoundingBox[] | undefined;
    if (computeRegions && diffPixels.length > 0) {
      diffRegions = this.computeDiffRegions(diffPixels, width, height);
    }

    // Encode diff image as base64
    let diffImage: string | undefined;
    if (diffData && includeDiffImage) {
      diffImage = Buffer.from(diffData).toString("base64");
    }

    return {
      matched,
      mismatchPercentage: Math.round(mismatchPercentage * 1000) / 1000,
      diffImage,
      dimensions: { width, height },
      diffRegions,
    };
  }

  /**
   * Generate a diff image buffer (raw RGBA).
   * Changed pixels are highlighted in red on a dimmed version of the actual image.
   */
  generateDiffImage(
    actual: RawImage,
    baseline: RawImage,
    options: VisualDiffOptions = {},
  ): RawImage {
    const result = this.compare(actual, baseline, { ...options, includeDiffImage: true });
    const width = Math.max(actual.width, baseline.width);
    const height = Math.max(actual.height, baseline.height);

    return {
      data: result.diffImage ? Buffer.from(result.diffImage, "base64") : new Uint8Array(width * height * 4),
      width,
      height,
    };
  }

  /**
   * Get a pixel's RGBA values from an image.
   * Returns transparent black for out-of-bounds coordinates.
   */
  private getPixel(image: RawImage, x: number, y: number): [number, number, number, number] {
    if (x < 0 || x >= image.width || y < 0 || y >= image.height) {
      return [0, 0, 0, 0];
    }
    const offset = (y * image.width + x) * 4;
    return [
      image.data[offset],
      image.data[offset + 1],
      image.data[offset + 2],
      image.data[offset + 3],
    ];
  }

  /**
   * Set a pixel's RGBA values in a buffer.
   */
  private setPixel(
    data: Uint8Array,
    width: number,
    x: number,
    y: number,
    color: [number, number, number, number],
  ): void {
    const offset = (y * width + x) * 4;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = color[3];
  }

  /**
   * Calculate the color difference between two pixels.
   * Uses Euclidean distance in RGB space (or RGBA if alpha comparison is enabled).
   */
  private pixelDifference(
    a: [number, number, number, number],
    b: [number, number, number, number],
    alpha: "ignore" | "compare",
  ): number {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];

    if (alpha === "compare") {
      const da = a[3] - b[3];
      return Math.sqrt(dr * dr + dg * dg + db * db + da * da) / 2;
    }

    // Blend with alpha for comparison
    const alphaA = a[3] / 255;
    const alphaB = b[3] / 255;

    const rA = a[0] * alphaA + 255 * (1 - alphaA);
    const gA = a[1] * alphaA + 255 * (1 - alphaA);
    const bA = a[2] * alphaA + 255 * (1 - alphaA);

    const rB = b[0] * alphaB + 255 * (1 - alphaB);
    const gB = b[1] * alphaB + 255 * (1 - alphaB);
    const bB = b[2] * alphaB + 255 * (1 - alphaB);

    const drB = rA - rB;
    const dgB = gA - gB;
    const dbB = bA - bB;

    return Math.sqrt(drB * drB + dgB * dgB + dbB * dbB) / Math.sqrt(3);
  }

  /**
   * Check if a pixel difference is likely due to anti-aliasing.
   * Compares the pixel's neighborhood to see if it's a transition zone.
   */
  private isAntiAliased(
    imageA: RawImage,
    imageB: RawImage,
    x: number,
    y: number,
    radius: number,
    threshold: number,
  ): boolean {
    const pixelA = this.getPixel(imageA, x, y);

    // Check if the pixel in imageA is on an edge
    let hasHighContrast = false;
    let hasLowContrast = false;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;

        const neighbor = this.getPixel(imageA, x + dx, y + dy);
        const diff = this.pixelDifference(pixelA, neighbor, "ignore");

        if (diff > threshold * 2) {
          hasHighContrast = true;
        } else if (diff < threshold / 2) {
          hasLowContrast = true;
        }

        if (hasHighContrast && hasLowContrast) {
          return true; // This is an anti-aliased edge pixel
        }
      }
    }

    // Also check the baseline image
    const pixelB = this.getPixel(imageB, x, y);
    hasHighContrast = false;
    hasLowContrast = false;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;

        const neighbor = this.getPixel(imageB, x + dx, y + dy);
        const diff = this.pixelDifference(pixelB, neighbor, "ignore");

        if (diff > threshold * 2) hasHighContrast = true;
        else if (diff < threshold / 2) hasLowContrast = true;

        if (hasHighContrast && hasLowContrast) return true;
      }
    }

    return false;
  }

  /**
   * Compute bounding boxes around clusters of different pixels.
   * Uses a simple grid-based clustering approach.
   */
  private computeDiffRegions(
    diffPixels: Array<{ x: number; y: number }>,
    width: number,
    height: number,
  ): BoundingBox[] {
    if (diffPixels.length === 0) return [];

    // Use a grid to cluster nearby pixels
    const gridSize = 32;
    const grid = new Map<string, Array<{ x: number; y: number }>>();

    for (const pixel of diffPixels) {
      const gx = Math.floor(pixel.x / gridSize);
      const gy = Math.floor(pixel.y / gridSize);
      const key = `${gx},${gy}`;

      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key)!.push(pixel);
    }

    // Merge adjacent grid cells into regions
    const regions: BoundingBox[] = [];
    const visited = new Set<string>();

    for (const [key, pixels] of grid) {
      if (visited.has(key)) continue;

      // BFS to find connected grid cells
      const cluster: Array<{ x: number; y: number }> = [];
      const queue = [key];
      visited.add(key);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentPixels = grid.get(current);
        if (currentPixels) {
          cluster.push(...currentPixels);
        }

        const [gx, gy] = current.split(",").map(Number);
        // Check 8-connected neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const neighborKey = `${gx + dx},${gy + dy}`;
            if (grid.has(neighborKey) && !visited.has(neighborKey)) {
              visited.add(neighborKey);
              queue.push(neighborKey);
            }
          }
        }
      }

      // Compute bounding box for the cluster
      if (cluster.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of cluster) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }

        // Add padding
        const padding = 4;
        regions.push({
          x: Math.max(0, minX - padding),
          y: Math.max(0, minY - padding),
          width: Math.min(width, maxX + padding) - Math.max(0, minX - padding),
          height: Math.min(height, maxY + padding) - Math.max(0, minY - padding),
        });
      }
    }

    return regions;
  }
}
