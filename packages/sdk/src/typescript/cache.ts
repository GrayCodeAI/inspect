// ──────────────────────────────────────────────────────────────────────────────
// @inspect/sdk - Action Cache Implementation
// ──────────────────────────────────────────────────────────────────────────────

import type { AgentAction } from "@inspect/core";
import type { ActionCacheInterface } from "./act.js";

/** Cache entry stored for each action */
interface CacheEntry {
  action: AgentAction;
  elementDescription?: {
    role: string;
    name: string;
    tagName?: string;
    nearbyText?: string;
  };
}

/**
 * Simple in-memory LRU action cache.
 * Stores up to 1000 actions with automatic eviction.
 */
export class SimpleActionCache implements ActionCacheInterface {
  private store = new Map<string, CacheEntry>();
  private maxEntries = 1000;

  get(key: string): CacheEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, value: CacheEntry): void {
    // Evict oldest if at capacity (simple LRU)
    if (this.store.size >= this.maxEntries) {
      const firstKey = this.store.keys().next().value as string;
      this.store.delete(firstKey);
    }
    this.store.set(key, value);
  }

  /** Clear all cached actions */
  clear(): void {
    this.store.clear();
  }

  /** Get current cache size */
  get size(): number {
    return this.store.size;
  }
}
