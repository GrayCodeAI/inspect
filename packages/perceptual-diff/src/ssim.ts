// ──────────────────────────────────────────────────────────────────────────────
// SSIM (Structural Similarity Index) Implementation
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Schema } from "effect";
import { DimensionMismatchError } from "./errors.js";

export class SSIMConfig extends Schema.Class<SSIMConfig>("SSIMConfig")({
  windowSize: Schema.Number,
  k1: Schema.Number,
  k2: Schema.Number,
  l: Schema.Number,
}) {}

export class SSIMResult extends Schema.Class<SSIMResult>("SSIMResult")({
  score: Schema.Number,
  meanX: Schema.Number,
  meanY: Schema.Number,
  varianceX: Schema.Number,
  varianceY: Schema.Number,
  covariance: Schema.Number,
}) {}

export const computeSSIM = (image1: number[][], image2: number[][], config?: Partial<SSIMConfig>) =>
  Effect.gen(function* () {
    const resolvedConfig = new SSIMConfig({
      windowSize: 11,
      k1: 0.01,
      k2: 0.03,
      l: 255,
      ...config,
    });

    if (image1.length !== image2.length || image1[0].length !== image2[0].length) {
      return yield* new DimensionMismatchError({
        width1: image1[0].length,
        height1: image1.length,
        width2: image2[0].length,
        height2: image2.length,
      });
    }

    const rows = image1.length;
    const cols = image1[0].length;

    const mean = (image: number[][]): number => {
      let sum = 0;
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          sum += image[i][j];
        }
      }
      return sum / (rows * cols);
    };

    const variance = (image: number[][], meanVal: number): number => {
      let sum = 0;
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          sum += (image[i][j] - meanVal) ** 2;
        }
      }
      return sum / (rows * cols - 1);
    };

    const covariance = (
      image1Arr: number[][],
      image2Arr: number[][],
      meanX: number,
      meanY: number,
    ): number => {
      let sum = 0;
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          sum += (image1Arr[i][j] - meanX) * (image2Arr[i][j] - meanY);
        }
      }
      return sum / (rows * cols - 1);
    };

    const meanX = mean(image1);
    const meanY = mean(image2);
    const varianceX = variance(image1, meanX);
    const varianceY = variance(image2, meanY);
    const covarianceXY = covariance(image1, image2, meanX, meanY);

    const c1 = (resolvedConfig.k1 * resolvedConfig.l) ** 2;
    const c2 = (resolvedConfig.k2 * resolvedConfig.l) ** 2;

    const numerator = (2 * meanX * meanY + c1) * (2 * covarianceXY + c2);
    const denominator = (meanX ** 2 + meanY ** 2 + c1) * (varianceX + varianceY + c2);

    const ssimScore = numerator / denominator;

    return new SSIMResult({
      score: ssimScore,
      meanX,
      meanY,
      varianceX,
      varianceY,
      covariance: covarianceXY,
    });
  }).pipe(Effect.withSpan("ssim.computeSSIM"));

export const grayscaleToMatrix = (pixels: number[], width: number, height: number): number[][] => {
  const matrix: number[][] = [];
  for (let i = 0; i < height; i++) {
    const row: number[] = [];
    for (let j = 0; j < width; j++) {
      row.push(pixels[i * width + j]);
    }
    matrix.push(row);
  }
  return matrix;
};
