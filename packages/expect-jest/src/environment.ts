// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-jest - Jest Test Environment
// ──────────────────────────────────────────────────────────────────────────────

import { createTestContext, cleanupTestContext, getInspectConfig } from "./context.js";
import type { InspectTestContext } from "./types.js";

interface JestCircusEvent {
  name: string;
  test?: {
    name: string;
    errors: Array<{ message: string }>;
  };
}

interface JestCircusState {
  currentDescribe?: unknown;
}

export default class InspectEnvironment {
  global: typeof globalThis;
  testContext?: InspectTestContext;
  config: ReturnType<typeof getInspectConfig>;

  constructor(_config: unknown) {
    this.global = globalThis;
    this.config = getInspectConfig();
  }

  async setup(): Promise<void> {
    if (this.config.trace) {
      console.log("[Inspect] Setting up test environment...");
    }
  }

  async teardown(): Promise<void> {
    if (this.testContext) {
      await cleanupTestContext(this.testContext);
      this.testContext = undefined;
    }
  }

  async handleTestEvent(event: JestCircusEvent, _state: JestCircusState): Promise<void> {
    switch (event.name) {
      case "test_start": {
        this.testContext = await createTestContext();
        (
          this.global as typeof globalThis & { __inspectContext: InspectTestContext }
        ).__inspectContext = this.testContext;
        break;
      }

      case "test_done": {
        if (event.test?.errors.length && this.config.screenshotOnFailure) {
          try {
            await this.testContext?.screenshot(
              `failure-${event.test.name.replace(/\s+/g, "-")}.png`,
            );
          } catch {
            // Ignore screenshot errors
          }
        }

        if (this.testContext) {
          await cleanupTestContext(this.testContext);
          this.testContext = undefined;
        }
        break;
      }
    }
  }
}
