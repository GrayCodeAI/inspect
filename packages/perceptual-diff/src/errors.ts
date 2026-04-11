// ──────────────────────────────────────────────────────────────────────────────
// Perceptual Diff Errors
// ──────────────────────────────────────────────────────────────────────────────

import { Schema } from "effect";

export class PerceptualDiffError extends Schema.ErrorClass<PerceptualDiffError>(
  "PerceptualDiffError",
)({
  _tag: Schema.tag("PerceptualDiffError"),
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  get displayMessage(): string {
    return `Perceptual diff error: ${this.message}`;
  }
}

export class ImageLoadError extends Schema.ErrorClass<ImageLoadError>("ImageLoadError")({
  _tag: Schema.tag("ImageLoadError"),
  imagePath: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  message = `Failed to load image: ${this.imagePath}`;
}

export class DimensionMismatchError extends Schema.ErrorClass<DimensionMismatchError>(
  "DimensionMismatchError",
)({
  _tag: Schema.tag("DimensionMismatchError"),
  width1: Schema.Number,
  height1: Schema.Number,
  width2: Schema.Number,
  height2: Schema.Number,
}) {
  message = `Image dimensions mismatch: ${this.width1}x${this.height1} vs ${this.width2}x${this.height2}`;
}
