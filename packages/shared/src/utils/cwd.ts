import { join } from "node:path";

let _cwd: string | undefined;

/**
 * Get the working directory — cached after first read.
 * Override via `setCwd()` for testing.
 */
export function getCwd(): string {
  return _cwd ?? process.cwd();
}

/**
 * Override the working directory (for testing).
 */
export function setCwd(dir: string): void {
  _cwd = dir;
}

/**
 * Reset to live process.cwd().
 */
export function resetCwd(): void {
  _cwd = undefined;
}

/**
 * Get a path under the `.inspect/` working directory.
 */
export function getInspectDir(subdir?: string): string {
  const base = join(getCwd(), ".inspect");
  return subdir ? join(base, subdir) : base;
}
