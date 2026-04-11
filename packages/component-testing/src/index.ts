// ──────────────────────────────────────────────────────────────────────────────
// @inspect/component-testing - Framework-agnostic component testing with Playwright
// ──────────────────────────────────────────────────────────────────────────────

export { ComponentMounter, type MountOptions, type MountedComponent } from "./component-mount.js";
export { ComponentInteractions } from "./component-interactions.js";
export { ComponentAssertions, type SnapshotData } from "./component-assertions.js";
export { ComponentSnapshot } from "./component-snapshot.js";
export { FrameworkDetector, type FrameworkType, type FrameworkInfo } from "./framework-detector.js";
export {
  ComponentMountError,
  ComponentInteractionError,
  ComponentAssertionError,
  FrameworkDetectionError,
  SnapshotMismatchError,
} from "./errors.js";
