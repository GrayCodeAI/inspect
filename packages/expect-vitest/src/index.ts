// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-vitest - Vitest E2E Plugin for Inspect
// ──────────────────────────────────────────────────────────────────────────────

// Plugin exports
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

// Setup
export { setupInspect, type SetupInspectOptions } from "./setup.js";

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
export const version = "0.2.0";

// Import for default export
import { inspectPlugin } from "./plugin.js";
import { defineInspectConfig } from "./plugin.js";
import { getInspectConfig } from "./plugin.js";
import { createTestContext } from "./plugin.js";
import { cleanupTestContext } from "./plugin.js";
import { inspectTest } from "./plugin.js";
import { extendExpect } from "./matchers.js";
import { setupInspect } from "./setup.js";
import { createNLAct } from "@inspect/browser";

// Default export
export default {
  inspectPlugin,
  defineInspectConfig,
  getInspectConfig,
  extendExpect,
  createTestContext,
  cleanupTestContext,
  inspectTest,
  setupInspect,
  createNLAct,
  version,
};
