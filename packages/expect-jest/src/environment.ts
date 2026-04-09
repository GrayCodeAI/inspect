// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-jest - Jest Test Environment
// ──────────────────────────────────────────────────────────────────────────────

import type { JestEnvironment } from "jest-environment-node";
import type { Circus } from "@jest/types";
import { createTestContext, cleanupTestContext, getInspectConfig } from "./context.js";
import type { InspectTestContext } from "./types.js";

/** Jest environment for Inspect browser tests */
export default class InspectEnvironment implements JestEnvironment {
  global: typeof globalThis;
  testContext?: InspectTestContext;
  config: ReturnType<typeof getInspectConfig>;

  constructor(config: { globalConfig: typeof jest; projectConfig: typeof jest }) {
    this.global = globalThis;
    this.config = getInspectConfig();
  }

  async setup(): Promise<void> {
    // Environment setup happens before tests
    if (this.config.trace) {
      console.log("[Inspect] Setting up test environment...");
    }
  }

  async teardown(): Promise<void> {
    // Cleanup any remaining contexts
    if (this.testContext) {
      await cleanupTestContext(this.testContext);
      this.testContext = undefined;
    }
  }

  async handleTestEvent(event: Circus.Event, state: Circus.State): Promise<void> {
    switch (event.name) {
      case "test_start": {
        // Create test context at start of each test
        this.testContext = await createTestContext();
        (
          this.global as typeof globalThis & { __inspectContext: InspectTestContext }
        ).__inspectContext = this.testContext;
        break;
      }

      case "test_done": {
        // Screenshot on failure
        if (event.test.errors.length > 0 && this.config.screenshotOnFailure) {
          try {
            await this.testContext?.screenshot(
              `failure-${event.test.name.replace(/\s+/g, "-")}.png`,
            );
          } catch {
            // Ignore screenshot errors
          }
        }

        // Cleanup context
        if (this.testContext) {
          await cleanupTestContext(this.testContext);
          this.testContext = undefined;
        }
        break;
      }
    }
  }
}

export { InspectEnvironment };
