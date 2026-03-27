import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CURRENT_VERSION = "0.1.0";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_FILE = join(homedir(), ".inspect", "update-check.json");

interface UpdateCache {
  lastCheck: number;
  latestVersion: string;
}

/**
 * Check for CLI updates (non-blocking, cached).
 * Returns a message string if an update is available, null otherwise.
 */
export async function checkForUpdate(): Promise<string | null> {
  try {
    // Check cache first
    const cached = readCache();
    if (cached && Date.now() - cached.lastCheck < CHECK_INTERVAL_MS) {
      return compareVersions(CURRENT_VERSION, cached.latestVersion);
    }

    // Fetch latest version from npm (with short timeout)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(
        "https://registry.npmjs.org/@inspect/cli/latest",
        { signal: controller.signal },
      );

      if (!response.ok) return null;

      const data = (await response.json()) as { version?: string };
      const latestVersion = data.version;

      if (!latestVersion) return null;

      // Cache the result
      writeCache({ lastCheck: Date.now(), latestVersion });

      return compareVersions(CURRENT_VERSION, latestVersion);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Never block on update check failures
    return null;
  }
}

function readCache(): UpdateCache | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function writeCache(data: UpdateCache): void {
  try {
    const dir = join(homedir(), ".inspect");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(data), "utf-8");
  } catch {
    // Ignore write errors
  }
}

function compareVersions(current: string, latest: string): string | null {
  const c = current.split(".").map(Number);
  const l = latest.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) {
      return `Update available: ${current} \u2192 ${latest} (run: npm i -g @inspect/cli)`;
    }
    if ((l[i] ?? 0) < (c[i] ?? 0)) {
      return null; // Current is newer (dev version)
    }
  }

  return null; // Same version
}

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}
