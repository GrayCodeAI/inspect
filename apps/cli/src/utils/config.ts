import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
}

const CONFIG_FILES = [
  "inspect.config.ts",
  "inspect.config.js",
  "inspect.config.json",
  ".inspectrc.json",
  ".inspectrc",
];

/**
 * Load the inspect config file from the project root.
 * Searches for known config file names and returns parsed config.
 */
export function loadConfig(cwd?: string): InspectConfig | null {
  const dir = cwd ?? process.cwd();

  for (const file of CONFIG_FILES) {
    const filePath = resolve(dir, file);
    if (!existsSync(filePath)) continue;

    try {
      if (file.endsWith(".json") || file === ".inspectrc") {
        const content = readFileSync(filePath, "utf-8");
        return JSON.parse(content) as InspectConfig;
      }
      // For .ts/.js files, we can't easily import them at runtime
      // without a bundler. Return a marker that config exists.
      return {} as InspectConfig;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Get the config file path if it exists.
 */
export function getConfigPath(cwd?: string): string | null {
  const dir = cwd ?? process.cwd();
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
