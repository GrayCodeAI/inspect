import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getProjectRoot } from "./project-context.js";

export interface InspectConfig {
  url?: string;
  agent?: { primary?: string; mode?: string; fallback?: string };
  devices?: string[];
  browser?: { type?: string; headless?: boolean };
  git?: { scope?: string; maxFiles?: number; maxDiffChars?: number };
  a11y?: { enabled?: boolean; standard?: string };
  lighthouse?: { enabled?: boolean };
  visual?: { enabled?: boolean; threshold?: number };
  timeouts?: { test?: number; step?: number; navigation?: number };
  maxSteps?: number;
  reporting?: { format?: string; output?: string; prComment?: boolean };
  /** Slack webhook URL for notifications */
  slackWebhookUrl?: string;
  /** Discord webhook URL for notifications */
  discordWebhookUrl?: string;
  /** Only notify on failure */
  notifyOnFailureOnly?: boolean;
  /** Test prioritization weights */
  prioritization?: {
    flakiness?: number;
    failureRecency?: number;
    changeOverlap?: number;
    speed?: number;
    reliability?: number;
  };
  /** Cross-browser testing config */
  crossBrowser?: {
    browsers?: Array<"chromium" | "firefox" | "webkit">;
    parallel?: boolean;
  };
}

const CONFIG_FILES = [
  "inspect.config.ts",
  "inspect.config.js",
  "inspect.config.json",
  ".inspectrc.json",
  ".inspectrc",
];

/**
 * Load the inspect config file from the project root (sync, JSON only).
 * For TS/JS configs, use loadConfigAsync().
 */
export function loadConfig(cwd?: string): InspectConfig | null {
  const dir = cwd ?? getProjectRoot();

  for (const file of CONFIG_FILES) {
    const filePath = resolve(dir, file);
    if (!existsSync(filePath)) continue;

    try {
      if (file.endsWith(".json") || file === ".inspectrc") {
        const content = readFileSync(filePath, "utf-8");
        return JSON.parse(content) as InspectConfig;
      }
      // TS/JS files need async loading — return marker
      return {} as InspectConfig;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Load the inspect config file with full TS/JS support via dynamic import.
 *
 * For `.ts` files, this relies on the Node.js loader (e.g., tsx, ts-node)
 * being available. For `.js` files, uses native ESM import.
 */
export async function loadConfigAsync(cwd?: string): Promise<InspectConfig | null> {
  const dir = cwd ?? getProjectRoot();

  for (const file of CONFIG_FILES) {
    const filePath = resolve(dir, file);
    if (!existsSync(filePath)) continue;

    try {
      if (file.endsWith(".json") || file === ".inspectrc") {
        const content = readFileSync(filePath, "utf-8");
        return JSON.parse(content) as InspectConfig;
      }

      if (file.endsWith(".ts") || file.endsWith(".js")) {
        // Use file:// URL for cross-platform ESM import
        const fileUrl = pathToFileURL(filePath).href;

        // Add cache-busting query to avoid stale module cache
        const mod = await import(`${fileUrl}?t=${Date.now()}`);

        // Support both `export default` and `module.exports`
        const config = mod.default ?? mod;

        // If it's a function (defineConfig pattern), call it
        if (typeof config === "function") {
          return config() as InspectConfig;
        }

        return config as InspectConfig;
      }
    } catch {
      // Config file exists but failed to load — return null
      return null;
    }
  }

  return null;
}

/**
 * Get the config file path if it exists.
 */
export function getConfigPath(cwd?: string): string | null {
  const dir = cwd ?? getProjectRoot();
  for (const file of CONFIG_FILES) {
    const filePath = resolve(dir, file);
    if (existsSync(filePath)) return filePath;
  }
  return null;
}

/**
 * Merge CLI options with config file values (CLI takes precedence).
 */
export function mergeWithConfig<T extends Record<string, unknown>>(
  cliOptions: T,
  config: InspectConfig | null,
): T {
  if (!config) return cliOptions;

  const merged = { ...cliOptions };
  // Only fill in values from config that aren't set via CLI
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined && (merged as Record<string, unknown>)[key] === undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}
