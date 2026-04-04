// ============================================================================
// @inspect/visual - Visual Regression Testing Toolkit
// ============================================================================

export { VisualDiff, type VisualDiffOptions, type RawImage } from "./diff.js";
export { SliderReport, type VisualReportEntry } from "./slider-report.js";
export { ElementMasking, DEFAULT_MASK_SELECTORS, type MaskOptions } from "./masking.js";
export { StorybookCapture, type StorybookCaptureOptions } from "./storybook.js";
export {
  ViewportCapture,
  VIEWPORT_PRESETS,
  VIEWPORT_COLLECTIONS,
  type LabeledViewport,
  type ViewportCaptureOptions,
} from "./viewports.js";
export { ApprovalWorkflow, type ApprovalEntry, type ApprovalStatus } from "./approval.js";
