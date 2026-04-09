// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-vitest - Vitest E2E Plugin for Inspect
// ──────────────────────────────────────────────────────────────────────────────

// Plugin
export {
  inspectPlugin,
  defineInspectConfig,
  getInspectConfig,
  createTestContext,
  cleanupTestContext,
  inspectTest,
} from "./plugin.js";

// Matchers
export { extendExpect } from "./matchers.js";

// Types
export type {
  InspectTestContext,
  InspectConfig,
  TestOptions,
  AssertionResult,
  InspectMatchers,
  StepResult,
  TestResult,
} from "./types.js";

// Re-export from @inspect/browser for convenience
export { createNLAct } from "@inspect/browser";

// Version
export const version = "0.1.0";

// Default export
export default {
  inspectPlugin,
  defineInspectConfig,
  getInspectConfig,
  extendExpect,
  createTestContext,
  cleanupTestContext,
  inspectTest,
  createNLAct,
  version,
};
