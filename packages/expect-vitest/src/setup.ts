// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-vitest - Vitest Setup
// ──────────────────────────────────────────────────────────────────────────────

import { beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { extendExpect } from "./matchers.js";
import { createTestContext, cleanupTestContext, getInspectConfig } from "./plugin.js";
import type { InspectTestContext } from "./types.js";

// Extend expect with custom matchers
extendExpect(expect);

// Global test context storage
declare global {
   
  var __inspectContext: InspectTestContext | undefined;
}

/** Get the current test context */
export function inspect(): InspectTestContext {
  if (!globalThis.__inspectContext) {
    throw new Error(
      "Inspect context not available. Make sure you're running tests with the Inspect plugin.",
    );
  }
  return globalThis.__inspectContext;
}

/** Initialize Inspect before all tests */
beforeAll(async () => {
  const config = getInspectConfig();

  if (config.trace) {
    console.log("[Inspect] Initializing test environment...");
  }
});

/** Create context before each test */
beforeEach(async (context) => {
  const testConfig = context.task?.meta?.inspect as Record<string, unknown> | undefined;

  // Create test context
  const ctx = await createTestContext(testConfig);
  globalThis.__inspectContext = ctx;

  // Add context to Vitest's context
  Object.assign(context, { inspect: ctx });
});

/** Cleanup after each test */
afterEach(async (context) => {
  const config = getInspectConfig();

  // Screenshot on failure
  if (config.screenshotOnFailure && context.task.result?.state === "fail") {
    try {
      const screenshotPath = await globalThis.__inspectContext!.screenshot(
        `failure-${context.task.name.replace(/\s+/g, "-")}.png`,
      );
      console.log(`[Inspect] Screenshot saved: ${screenshotPath}`);
    } catch {
      // Ignore screenshot errors
    }
  }

  // Cleanup
  if (globalThis.__inspectContext) {
    await cleanupTestContext(globalThis.__inspectContext);
    globalThis.__inspectContext = undefined;
  }
});

/** Cleanup after all tests */
afterAll(async () => {
  const config = getInspectConfig();

  if (config.trace) {
    console.log("[Inspect] Test environment cleaned up");
  }
});
