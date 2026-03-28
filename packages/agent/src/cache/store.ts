// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Action Cache Store
// ──────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir, unlink, access } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/cache-store");

/** A cached action result */
export interface CachedAction {
  /** The original instruction that produced this action */
  instruction: string;
  /** URL where the action was performed */
  url: string;
  /** Variables/context at the time */
  variables: Record<string, string>;
  /** The action taken */
  action: {
    type: string;
    ref?: string;
    value?: string;
    selector?: string;
    description?: string;
  };
  /** Element description for self-healing */
  elementDescription?: {
    role: string;
    name: string;
    tagName?: string;
    nearbyText?: string;
  };
  /** Whether the action succeeded */
  success: boolean;
  /** Timestamp of caching */
  cachedAt: number;
  /** Number of times this cache entry was used */
  hitCount: number;
  /** Number of times self-healing was applied */
  healCount: number;
  /** Last time this entry was accessed */
  lastAccessed: number;
}

/** Cache configuration */
export interface ActionCacheConfig {
  /** Root project directory */
  projectRoot: string;
  /** Maximum cache entries (default: 10000) */
  maxEntries?: number;
  /** TTL in milliseconds (default: 7 days) */
  ttl?: number;
  /** Whether caching is enabled */
  enabled?: boolean;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 10_000;

/**
 * Caches agent actions keyed by instruction + URL + variables.
 * Enables instant replay of known actions and provides the foundation
 * for self-healing selectors.
 */
export class ActionCache {
  private readonly cacheDir: string;
  private readonly maxEntries: number;
  private readonly ttl: number;
  private readonly enabled: boolean;
  private inMemory: Map<string, CachedAction> = new Map();

  constructor(config: ActionCacheConfig) {
    this.cacheDir = join(config.projectRoot, ".inspect", "cache");
    this.maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.ttl = config.ttl ?? DEFAULT_TTL_MS;
    this.enabled = config.enabled ?? true;
  }

  /**
   * Initialize the cache directory. Call after construction.
   */
  async init(): Promise<void> {
    if (this.enabled) {
      await this.ensureDir();
    }
  }

  /**
   * Generate a deterministic cache key from instruction, URL, and variables.
   * Uses SHA256 for consistent, collision-resistant hashing.
   */
  getKey(instruction: string, url: string, vars?: Record<string, string>): string {
    const normalized = {
      instruction: instruction.trim().toLowerCase(),
      url: this.normalizeUrl(url),
      vars: vars ? this.sortObject(vars) : {},
    };

    return createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex")
      .slice(0, 24); // Truncate for shorter filenames
  }

  /**
   * Look up a cached action by key.
   * Returns null if not found or expired.
   */
  async get(key: string): Promise<CachedAction | null> {
    if (!this.enabled) return null;

    // Check in-memory cache first
    const cached = this.inMemory.get(key);
    if (cached) {
      if (this.isExpired(cached)) {
        this.inMemory.delete(key);
        return null;
      }
      cached.hitCount++;
      cached.lastAccessed = Date.now();
      return cached;
    }

    // Try loading from disk
    const filePath = this.entryPath(key);
    try {
      await access(filePath);
    } catch (error) {
      logger.debug("Cache entry not found on disk", { err: error instanceof Error ? error.message : String(error) });
      return null;
    }

    try {
      const raw = await readFile(filePath, "utf-8");
      const data = JSON.parse(raw) as CachedAction;

      if (this.isExpired(data)) {
        return null;
      }

      data.hitCount++;
      data.lastAccessed = Date.now();
      this.inMemory.set(key, data);
      await this.persistEntry(key, data);
      return data;
    } catch (error) {
      logger.debug("Failed to read cache entry from disk", { err: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Store an action in the cache.
   */
  async set(key: string, action: CachedAction["action"], meta: {
    instruction: string;
    url: string;
    variables?: Record<string, string>;
    selector?: string;
    elementDescription?: CachedAction["elementDescription"];
    success?: boolean;
  }): Promise<void> {
    if (!this.enabled) return;

    const entry: CachedAction = {
      instruction: meta.instruction,
      url: meta.url,
      variables: meta.variables ?? {},
      action: {
        ...action,
        selector: meta.selector ?? action.selector,
      },
      elementDescription: meta.elementDescription,
      success: meta.success ?? true,
      cachedAt: Date.now(),
      hitCount: 0,
      healCount: 0,
      lastAccessed: Date.now(),
    };

    this.inMemory.set(key, entry);
    await this.persistEntry(key, entry);

    // Evict old entries if over limit
    if (this.inMemory.size > this.maxEntries) {
      this.evict();
    }
  }

  /**
   * Update a cache entry after self-healing found a new selector.
   */
  async heal(key: string, newSelector: string, newRef?: string): Promise<boolean> {
    const entry = await this.get(key);
    if (!entry) return false;

    entry.action.selector = newSelector;
    if (newRef) {
      entry.action.ref = newRef;
    }
    entry.healCount++;
    entry.lastAccessed = Date.now();

    this.inMemory.set(key, entry);
    await this.persistEntry(key, entry);
    return true;
  }

  /**
   * Get cache statistics.
   */
  async stats(): Promise<{ totalEntries: number; diskEntries: number; memoryEntries: number }> {
    let diskEntries = 0;
    try {
      const files = await readdir(this.cacheDir);
      diskEntries = files.filter((f) => f.endsWith(".json")).length;
    } catch (error) {
      logger.debug("Failed to read cache directory for stats", { err: error instanceof Error ? error.message : String(error) });
    }

    return {
      totalEntries: Math.max(diskEntries, this.inMemory.size),
      diskEntries,
      memoryEntries: this.inMemory.size,
    };
  }

  /**
   * Clear the entire cache.
   */
  async clear(): Promise<void> {
    this.inMemory.clear();

    try {
      const files = await readdir(this.cacheDir);
      await Promise.all(
        files
          .filter((f) => f.endsWith(".json"))
          .map((f) => unlink(join(this.cacheDir, f)).catch(() => {})),
      );
    } catch (error) {
      logger.debug("Failed to clear cache directory", { err: error instanceof Error ? error.message : String(error) });
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async ensureDir(): Promise<void> {
    try {
      await access(this.cacheDir);
    } catch (error) {
      logger.debug("Cache directory not found, creating it", { err: error instanceof Error ? error.message : String(error) });
      await mkdir(this.cacheDir, { recursive: true });
    }
  }

  private entryPath(key: string): string {
    return join(this.cacheDir, `${key}.json`);
  }

  private async persistEntry(key: string, entry: CachedAction): Promise<void> {
    try {
      await writeFile(this.entryPath(key), JSON.stringify(entry, null, 2));
    } catch (error) {
      logger.warn("Failed to persist cache entry", { err: error instanceof Error ? error.message : String(error) });
    }
  }

  private isExpired(entry: CachedAction): boolean {
    return Date.now() - entry.cachedAt > this.ttl;
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove common volatile query params
      parsed.searchParams.delete("_t");
      parsed.searchParams.delete("timestamp");
      parsed.searchParams.delete("nocache");
      parsed.searchParams.sort();
      // Normalize to pathname + sorted query
      return `${parsed.origin}${parsed.pathname}${parsed.search}`;
    } catch (error) {
      logger.debug("Failed to normalize URL, using raw value", { err: error instanceof Error ? error.message : String(error) });
      return url;
    }
  }

  private sortObject(obj: Record<string, string>): Record<string, string> {
    const sorted: Record<string, string> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = obj[key];
    }
    return sorted;
  }

  private evict(): void {
    // LRU eviction: remove least recently accessed entries
    const entries = Array.from(this.inMemory.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    const toRemove = entries.slice(0, Math.floor(this.maxEntries * 0.2));
    for (const [key] of toRemove) {
      this.inMemory.delete(key);
    }
  }
}
