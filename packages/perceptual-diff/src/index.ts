// ──────────────────────────────────────────────────────────────────────────────
// @inspect/perceptual-diff — SSIM-based perceptual image comparison
// ──────────────────────────────────────────────────────────────────────────────

export { PerceptualDiff, DiffConfig, DiffResult } from "./perceptual-diff.js";
export { computeSSIM, grayscaleToMatrix, SSIMConfig, SSIMResult } from "./ssim.js";
export { DiffReporter, DiffReportEntry, DiffReport } from "./diff-reporter.js";
export { PerceptualDiffError, ImageLoadError, DimensionMismatchError } from "./errors.js";
