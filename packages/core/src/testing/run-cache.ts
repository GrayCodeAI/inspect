// ============================================================================
// @inspect/core - Test Run Cache
//
// Saves entire successful test runs for near-zero-cost replay.
// On repeat, each step is replayed with UI validation — if the UI changed,
// falls back to fresh LLM execution for that step only.
// Inspired by Shortest's TestRunRepository.
// ============================================================================

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface CachedStep {
  index: number;
  description: string;
  action: string;
  target?: string;
  value?: string;
  selector?: string;
  /** Snapshot fingerprint for UI validation */
  snapshotFingerprint?: string;
  /** Status from original run */
  status: "pass" | "fail" | "skipped";
}

export interface CachedTestRun {
  /** Cache key */
  key: string;
  /** URL tested */
  url: string;
  /** Test instruction */
  instruction: string;
  /** Device used */
  device: string;
  /** Steps from the successful run */
  steps: CachedStep[];
  /** Overall status */
  status: "pass" | "fail";
  /** Duration of original run */
  durationMs: number;
  /** Token count of original run */
  tokenCount: number;
  /** When cached */
  cachedAt: number;
  /** Number of successful replays */
  replayCount: number;
}

export interface RunCacheConfig {
  /** Directory for cache files. Default: .inspect/cache/runs */
  cacheDir?: string;
  /** Max cached runs to keep. Default: 100 */
  maxRuns?: number;
  /** TTL in ms. Default: 30 days */
  ttlMs?: number;
  /** Enabled. Default: true */
  enabled?: boolean;
}

const DEFAULT_TTL = 30 * 24 * 60 * 60 * 1000;

/**
 * RunCache stores and replays entire test runs.
 *
 * Usage:
 * ```ts
 * const cache = new RunCache();
 *
 * // After a successful test run:
 * cache.save(url, instruction, device, steps, result);
 *
 * // Before starting a new run:
 * const cached = cache.get(url, instruction, device);
 * if (cached) {
 *   // Replay each step with UI validation
 *   for (const step of cached.steps) {
 *     if (await validateUI(step)) {
 *       await replayStep(step); // No LLM needed
 *     } else {
 *       await freshLLMStep(step); // UI changed, use LLM
 *     }
 *   }
 * }
 * ```
 */
export class RunCache {
  private config: Required<RunCacheConfig>;

  constructor(config: RunCacheConfig = {}) {
    this.config = {
      cacheDir: config.cacheDir ?? join(process.cwd(), ".inspect", "cache", "runs"),
      maxRuns: config.maxRuns ?? 100,
      ttlMs: config.ttlMs ?? DEFAULT_TTL,
      enabled: config.enabled ?? true,
    };
  }

  /**
   * Generate cache key.
   */
  static key(url: string, instruction: string, device: string): string {
    const normalized = `${new URL(url).pathname}|${instruction.trim().toLowerCase()}|${device}`;
    return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  }

  /**
   * Save a successful test run.
   */
  async save(
    url: string,
    instruction: string,
    device: string,
    steps: CachedStep[],
    durationMs: number,
    tokenCount: number,
  ): Promise<void> {
    if (!this.config.enabled) return;
    // Only cache passing runs
    const allPassed = steps.every((s) => s.status === "pass" || s.status === "skipped");
    if (!allPassed) return;

    const key = RunCache.key(url, instruction, device);
    const run: CachedTestRun = {
      key,
      url,
      instruction,
      device,
      steps,
      status: "pass",
      durationMs,
      tokenCount,
      cachedAt: Date.now(),
      replayCount: 0,
    };

    try {
      if (!existsSync(this.config.cacheDir)) await mkdir(this.config.cacheDir, { recursive: true });
      await writeFile(join(this.config.cacheDir, `${key}.json`), JSON.stringify(run, null, 2));
    } catch {}

    await this.enforceMaxRuns();
  }

  /**
   * Get a cached run if available.
   */
  async get(url: string, instruction: string, device: string): Promise<CachedTestRun | null> {
    if (!this.config.enabled) return null;

    const key = RunCache.key(url, instruction, device);
    const path = join(this.config.cacheDir, `${key}.json`);

    try {
      if (!existsSync(path)) return null;
      const data = JSON.parse(await readFile(path, "utf-8")) as CachedTestRun;

      // Check TTL
      if (Date.now() - data.cachedAt > this.config.ttlMs) {
        await unlink(path);
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  /**
   * Record a successful replay.
   */
  async recordReplay(key: string): Promise<void> {
    const path = join(this.config.cacheDir, `${key}.json`);
    try {
      if (!existsSync(path)) return;
      const data = JSON.parse(await readFile(path, "utf-8")) as CachedTestRun;
      data.replayCount++;
      await writeFile(path, JSON.stringify(data, null, 2));
    } catch {}
  }

  /**
   * List all cached runs.
   */
  async list(): Promise<Array<{ key: string; url: string; instruction: string; device: string; cachedAt: number; replayCount: number }>> {
    if (!existsSync(this.config.cacheDir)) return [];
    try {
      const files = (await readdir(this.config.cacheDir)).filter((f) => f.endsWith(".json"));
      const results = await Promise.all(
        files.map(async (f) => {
          try {
            const data = JSON.parse(await readFile(join(this.config.cacheDir, f), "utf-8")) as CachedTestRun;
            return { key: data.key, url: data.url, instruction: data.instruction, device: data.device, cachedAt: data.cachedAt, replayCount: data.replayCount };
          } catch { return null; }
        }),
      );
      return results.filter(Boolean) as Array<{ key: string; url: string; instruction: string; device: string; cachedAt: number; replayCount: number }>;
    } catch { return []; }
  }

  /**
   * Clear all cached runs.
   */
  async clear(): Promise<void> {
    try {
      if (!existsSync(this.config.cacheDir)) return;
      const files = await readdir(this.config.cacheDir);
      await Promise.all(files.map((f) => unlink(join(this.config.cacheDir, f))));
    } catch {}
  }

  private async enforceMaxRuns(): Promise<void> {
    try {
      if (!existsSync(this.config.cacheDir)) return;
      const files = (await readdir(this.config.cacheDir)).filter((f) => f.endsWith(".json"));
      if (files.length <= this.config.maxRuns) return;

      // Sort by modification time, delete oldest
      const withTime = (await Promise.all(
        files.map(async (f) => {
          try {
            const data = JSON.parse(await readFile(join(this.config.cacheDir, f), "utf-8")) as CachedTestRun;
            return { file: f, cachedAt: data.cachedAt };
          } catch { return { file: f, cachedAt: 0 }; }
        }),
      )).sort((a, b) => a.cachedAt - b.cachedAt);

      const toDelete = withTime.slice(0, files.length - this.config.maxRuns);
      await Promise.all(toDelete.map(({ file }) => unlink(join(this.config.cacheDir, file))));
    } catch {}
  }
}
