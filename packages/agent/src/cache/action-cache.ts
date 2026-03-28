// ============================================================================
// @inspect/agent - Action Cache
//
// Caches successful browser actions by hash(instruction + url).
// On repeat, replays cached action without LLM call — saves ~90% tokens.
// Inspired by Stagehand's ActCache and Shortest's TestRunRepository.
// ============================================================================

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/action-cache");

export interface CachedAction {
  /** Hash key for this cache entry */
  key: string;
  /** Original instruction */
  instruction: string;
  /** URL where action was performed */
  url: string;
  /** The action that was executed */
  action: {
    type: string;
    target?: string;
    value?: string;
    selector?: string;
    description?: string;
  };
  /** ARIA snapshot fingerprint at time of caching */
  snapshotFingerprint?: string;
  /** When this was cached */
  cachedAt: number;
  /** Number of times this was replayed successfully */
  replayCount: number;
  /** Last successful replay */
  lastReplayedAt?: number;
  /** TTL in ms (default: 7 days) */
  ttlMs: number;
}

export interface ActionCacheConfig {
  /** Directory to store cache files. Default: .inspect/cache/actions */
  cacheDir?: string;
  /** Time-to-live in ms. Default: 7 days */
  ttlMs?: number;
  /** Max cache entries. Default: 1000 */
  maxEntries?: number;
  /** Enable/disable caching. Default: true */
  enabled?: boolean;
}

const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_MAX = 1000;

/**
 * ActionCache stores and retrieves successful browser actions.
 *
 * Cache key: SHA-256 of (instruction + url + optional context).
 * Cache hit: Return the stored action, skip LLM call entirely.
 * Cache miss: After successful execution, store the action for future replay.
 *
 * Usage:
 * ```ts
 * const cache = new ActionCache();
 * await cache.ready;
 * const cached = await cache.get("Click the login button", "https://example.com/login");
 * if (cached) {
 *   // Replay without LLM
 *   await executeAction(cached.action);
 * } else {
 *   // LLM decides action
 *   const action = await llm.decide(...);
 *   await executeAction(action);
 *   await cache.set("Click the login button", "https://example.com/login", action);
 * }
 * ```
 */
export class ActionCache {
  private config: Required<ActionCacheConfig>;
  private memoryCache = new Map<string, CachedAction>();
  readonly ready: Promise<void>;

  constructor(config: ActionCacheConfig = {}) {
    this.config = {
      cacheDir: config.cacheDir ?? join(process.cwd(), ".inspect", "cache", "actions"),
      ttlMs: config.ttlMs ?? DEFAULT_TTL,
      maxEntries: config.maxEntries ?? DEFAULT_MAX,
      enabled: config.enabled ?? true,
    };

    if (this.config.enabled) {
      this.ready = this.loadFromDisk();
    } else {
      this.ready = Promise.resolve();
    }
  }

  /**
   * Generate cache key from instruction + URL.
   */
  static key(instruction: string, url: string, context?: string): string {
    const normalized = `${instruction.trim().toLowerCase()}|${new URL(url).pathname}|${context ?? ""}`;
    return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  }

  /**
   * Look up a cached action.
   * Returns null if not found or expired.
   */
  async get(instruction: string, url: string, context?: string): Promise<CachedAction | null> {
    if (!this.config.enabled) return null;

    await this.ready;

    const key = ActionCache.key(instruction, url, context);
    const entry = this.memoryCache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.memoryCache.delete(key);
      await this.deleteFromDisk(key);
      return null;
    }

    return entry;
  }

  /**
   * Store a successful action in cache.
   */
  async set(
    instruction: string,
    url: string,
    action: CachedAction["action"],
    snapshotFingerprint?: string,
    context?: string,
  ): Promise<void> {
    if (!this.config.enabled) return;

    await this.ready;

    const key = ActionCache.key(instruction, url, context);

    const entry: CachedAction = {
      key,
      instruction,
      url,
      action,
      snapshotFingerprint,
      cachedAt: Date.now(),
      replayCount: 0,
      ttlMs: this.config.ttlMs,
    };

    this.memoryCache.set(key, entry);
    await this.saveToDisk(entry);

    // Enforce max entries
    if (this.memoryCache.size > this.config.maxEntries) {
      await this.evictOldest();
    }
  }

  /**
   * Record a successful replay (increments counter).
   */
  async recordReplay(key: string): Promise<void> {
    const entry = this.memoryCache.get(key);
    if (entry) {
      entry.replayCount++;
      entry.lastReplayedAt = Date.now();
      await this.saveToDisk(entry);
    }
  }

  /**
   * Invalidate a cache entry.
   */
  async invalidate(instruction: string, url: string, context?: string): Promise<void> {
    const key = ActionCache.key(instruction, url, context);
    this.memoryCache.delete(key);
    await this.deleteFromDisk(key);
  }

  /**
   * Invalidate all entries for a URL.
   */
  async invalidateUrl(url: string): Promise<void> {
    const pathname = new URL(url).pathname;
    const deletes: Promise<void>[] = [];
    for (const [key, entry] of this.memoryCache) {
      if (new URL(entry.url).pathname === pathname) {
        this.memoryCache.delete(key);
        deletes.push(this.deleteFromDisk(key));
      }
    }
    await Promise.all(deletes);
  }

  /**
   * Clear entire cache.
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      if (existsSync(this.config.cacheDir)) {
        const files = await readdir(this.config.cacheDir);
        await Promise.all(files.map((f) => unlink(join(this.config.cacheDir, f))));
      }
    } catch (error) {
      logger.warn("Failed to clear action cache", { err: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Get cache stats.
   */
  getStats(): { size: number; hits: number; totalReplays: number } {
    let totalReplays = 0;
    for (const entry of this.memoryCache.values()) {
      totalReplays += entry.replayCount;
    }
    return {
      size: this.memoryCache.size,
      hits: totalReplays,
      totalReplays,
    };
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private async loadFromDisk(): Promise<void> {
    try {
      if (!existsSync(this.config.cacheDir)) return;
      const files = (await readdir(this.config.cacheDir)).filter((f) => f.endsWith(".json"));

      for (const file of files) {
        try {
          const data = JSON.parse(await readFile(join(this.config.cacheDir, file), "utf-8")) as CachedAction;
          // Skip expired
          if (Date.now() - data.cachedAt > data.ttlMs) continue;
          this.memoryCache.set(data.key, data);
        } catch (error) {
          logger.debug("Failed to parse action cache entry", { err: error instanceof Error ? error.message : String(error) });
        }
      }
    } catch (error) {
      logger.debug("Failed to load action cache from disk", { err: error instanceof Error ? error.message : String(error) });
    }
  }

  private async saveToDisk(entry: CachedAction): Promise<void> {
    try {
      if (!existsSync(this.config.cacheDir)) {
        await mkdir(this.config.cacheDir, { recursive: true });
      }
      await writeFile(
        join(this.config.cacheDir, `${entry.key}.json`),
        JSON.stringify(entry, null, 2),
      );
    } catch (error) {
      logger.warn("Failed to save action cache entry", { err: error instanceof Error ? error.message : String(error) });
    }
  }

  private async deleteFromDisk(key: string): Promise<void> {
    try {
      const path = join(this.config.cacheDir, `${key}.json`);
      if (existsSync(path)) await unlink(path);
    } catch (error) {
      logger.debug("Failed to delete action cache entry", { err: error instanceof Error ? error.message : String(error) });
    }
  }

  private async evictOldest(): Promise<void> {
    let oldest: { key: string; cachedAt: number } | null = null;
    for (const [key, entry] of this.memoryCache) {
      if (!oldest || entry.cachedAt < oldest.cachedAt) {
        oldest = { key, cachedAt: entry.cachedAt };
      }
    }
    if (oldest) {
      this.memoryCache.delete(oldest.key);
      await this.deleteFromDisk(oldest.key);
    }
  }
}
