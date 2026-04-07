import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Project Context - Single source of truth for project paths
// ─────────────────────────────────────────────────────────────────────────────

let projectRoot: string | null = null;

/**
 * Initialize the project context with the current working directory.
 * This should be called once at application startup.
 */
export function initializeProjectContext(cwd: string = process.cwd()): void {
  projectRoot = cwd;
}

/**
 * Get the project root directory.
 * Throws if the context has not been initialized.
 */
export function getProjectRoot(): string {
  if (projectRoot === null) {
    throw new Error("Project context not initialized. Call initializeProjectContext() at startup.");
  }
  return projectRoot;
}

/**
 * Get a path relative to the project root.
 */
export function getProjectPath(...segments: string[]): string {
  return join(getProjectRoot(), ...segments);
}

/**
 * Get the .inspect directory path.
 */
export function getInspectDir(): string {
  return getProjectPath(".inspect");
}

/**
 * Get a path relative to the .inspect directory.
 */
export function getInspectPath(...segments: string[]): string {
  return join(getInspectDir(), ...segments);
}

// ─────────────────────────────────────────────────────────────────────────────
// Common path helpers
// ─────────────────────────────────────────────────────────────────────────────

export const ProjectPaths = {
  preferences: () => getInspectPath("preferences.json"),
  keys: () => getInspectPath("keys.json"),
  history: () => getInspectPath("history.json"),
  config: () => getInspectPath("config.json"),
  reports: () => getInspectPath("reports"),
  traces: () => getInspectPath("traces"),
  screenshots: () => getInspectPath("screenshots"),
  cache: () => getInspectPath("cache"),
  workflows: () => getInspectPath("workflows"),
  flows: () => getInspectPath("flows"),
  visual: () => getInspectPath("visual"),
  baselines: () => getInspectPath("baselines"),
  monitorHistory: () => getInspectPath("monitor-history.json"),
  flakeHistory: () => getInspectPath("flake-history.json"),
  trend: () => getInspectPath("trend.json"),
  testTrend: () => getInspectPath("test-trend.json"),
} as const;
