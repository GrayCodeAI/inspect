// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-jest - Jest E2E Adapter for Inspect
// ──────────────────────────────────────────────────────────────────────────────

export { default as InspectEnvironment } from "./environment.js";
export { defineInspectConfig, getInspectConfig, inspect } from "./context.js";
export { matchers } from "./matchers.js";
export type { InspectTestContext, InspectConfig, InspectMatchers } from "./types.js";
export const version = "0.1.0";
