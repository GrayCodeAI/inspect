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

// Setup complete
console.log("[Inspect] Jest environment initialized");
