// ──────────────────────────────────────────────────────────────────────────────
// Prompt Cache - LLM prompt-response caching to reduce token costs
// ──────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getInspectDir } from "@inspect/shared";

/** Cache entry for a prompt-response pair */
export interface CacheEntry {
  /** Hash of the prompt messages */
  key: string;
  /** Prompt messages */
  messages: Array<{ role: string; content: string }>;
  /** Cached response */
  response: string;
  /** When this was cached */
  timestamp: number;
  /** Number of times this entry was reused */
  reuseCount: number;
  /** Model used (cache is model-specific) */
  model: string;
}

/** Configuration for the prompt cache */
export interface PromptCacheConfig {
  /** Cache directory (default: .inspect/prompt-cache) */
  cacheDir?: string;
  /** Max entries before pruning (default: 1000) */
  maxEntries: number;
  /** TTL in milliseconds (default: 24 hours) */
  ttl: number;
  /** Whether to cache (default: true) */
  enabled: boolean;
}

const DEFAULT_CONFIG: PromptCacheConfig = {
  maxEntries: 1000,
  ttl: 24 * 60 * 60 * 1000,
  enabled: true,
};

/**
 * Hash prompt messages into a cache key.
 */
function hashMessages(messages: Array<{ role: string; content: string }>, model: string): string {
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(messages));
  hasher.update(model);
  return hasher.digest("hex").slice(0, 16);
}

/**
 * Prompt cache for LLM responses. Reduces token costs by caching
 * identical prompt-response pairs.
 */
export class PromptCache {
  private config: PromptCacheConfig;
  private store: Map<string, CacheEntry>;

  constructor(config?: Partial<PromptCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = new Map();
    if (this.config.enabled) {
      this.load();
    }
  }

  /**
   * Look up a cached response for the given messages.
   * Returns the cached response if found and not expired, or undefined.
   */
  get(messages: Array<{ role: string; content: string }>, model: string): string | undefined {
    if (!this.config.enabled) return undefined;

    const key = hashMessages(messages, model);
    const entry = this.store.get(key);

    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttl) {
      this.store.delete(key);
      this.save();
      return undefined;
    }

    entry.reuseCount += 1;
    this.save();
    return entry.response;
  }

  /**
   * Store a response in the cache.
   */
  set(messages: Array<{ role: string; content: string }>, response: string, model: string): void {
    if (!this.config.enabled) return;

    const key = hashMessages(messages, model);
    const entry: CacheEntry = {
      key,
      messages,
      response,
      timestamp: Date.now(),
      reuseCount: 0,
      model,
    };

    this.store.set(key, entry);

    // Prune if over capacity
    if (this.store.size > this.config.maxEntries) {
      this.prune();
    }

    this.save();
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.store.clear();
    this.save();
  }

  /**
   * Get cache statistics.
   */
  getStats(): { totalEntries: number; totalReuses: number; oldestEntry: number | null } {
    const entries = [...this.store.values()];
    const totalReuses = entries.reduce((sum, e) => sum + e.reuseCount, 0);
    const oldest = entries.length > 0 ? Math.min(...entries.map((e) => e.timestamp)) : null;
    return { totalEntries: entries.length, totalReuses, oldestEntry: oldest };
  }

  /** Remove expired entries and oldest entries if over capacity */
  private prune(): void {
    const now = Date.now();

    // Remove expired entries first
    for (const [key, entry] of this.store) {
      if (now - entry.timestamp > this.config.ttl) {
        this.store.delete(key);
      }
    }

    // Remove least recently reused if still over capacity
    while (this.store.size > this.config.maxEntries) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      let lowestReuse = Infinity;

      for (const [key, entry] of this.store) {
        if (
          entry.reuseCount < lowestReuse ||
          (entry.reuseCount === lowestReuse && entry.timestamp < oldestTime)
        ) {
          oldestKey = key;
          oldestTime = entry.timestamp;
          lowestReuse = entry.reuseCount;
        }
      }

      if (oldestKey) {
        this.store.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  /** Load cache from disk */
  private load(): void {
    const cacheDir = this.config.cacheDir ?? getInspectDir("prompt-cache");
    const cacheFile = join(cacheDir, "cache.json");

    if (!existsSync(cacheFile)) return;

    try {
      const raw = readFileSync(cacheFile, "utf-8");
      const entries: CacheEntry[] = JSON.parse(raw);
      for (const entry of entries) {
        this.store.set(entry.key, entry);
      }
    } catch {
      // Corrupt cache — start fresh
      this.store.clear();
    }
  }

  /** Save cache to disk */
  private save(): void {
    const cacheDir = this.config.cacheDir ?? getInspectDir("prompt-cache");
    const cacheFile = join(cacheDir, "cache.json");

    try {
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }

      const entries = [...this.store.values()];
      writeFileSync(cacheFile, JSON.stringify(entries, null, 0), "utf-8");
    } catch {
      // Disk write failed — cache lost, not critical
    }
  }

  /** Delete cache directory on cleanup */
  destroy(): void {
    const cacheDir = this.config.cacheDir ?? getInspectDir("prompt-cache");
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  }
}
