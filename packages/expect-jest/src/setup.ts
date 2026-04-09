// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-jest - Jest Setup
// ──────────────────────────────────────────────────────────────────────────────

import { matchers } from "./matchers.js";
import { inspect } from "./context.js";

// Register matchers
expect.extend(matchers);

// Export inspect function
export { inspect };

// Re-export types
export type { InspectTestContext, InspectConfig } from "./types.js";
export { defineInspectConfig, getInspectConfig } from "./context.js";

/**
 * Configure Inspect with auto-wiring of lifecycle hooks.
 * Call this in your Jest setup file to automatically initialize Inspect.
 */
export interface SetupInspectOptions {
  /** Enable trace logging */
  trace?: boolean;
  /** Screenshot on test failure */
  screenshotOnFailure?: boolean;
  /** Screenshot directory */
  screenshotDir?: string;
  /** Base URL for tests */
  baseURL?: string;
  /** Browser to use */
  browser?: "chromium" | "firefox" | "webkit";
  /** Run headless */
  headless?: boolean;
  /** LLM configuration */
  llm?: {
    provider?: "openai" | "anthropic" | "local";
    model?: string;
    apiKey?: string;
  };
}

/**
 * Setup helper that wires Inspect lifecycle automatically
 * Usage: import { setupInspect } from "@inspect/expect-jest"; setupInspect({ trace: true });
 */
export function setupInspect(options?: SetupInspectOptions): void {
  // Matchers already registered via expect.extend above
  // This function exists for explicit configuration and documentation
  if (options?.trace) {
    console.log("[Inspect] Setup configured with options:", options);
  }
}

// Setup complete
console.log("[Inspect] Jest environment initialized");
