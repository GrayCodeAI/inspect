/**
 * Action Caching System
 *
 * Caches successful actions by hash(instruction + DOM state) for replay without LLM calls.
 * Inspired by browser-use and Stagehand action caching.
 */

export interface CachedAction {
  /** Unique cache key */
  key: string;
  /** Original instruction */
  instruction: string;
  /** Action to execute */
  action: Action;
  /** DOM state hash when cached */
  domHash: string;
  /** URL when cached */
  url: string;
  /** Success rate tracking */
  stats: {
    timesUsed: number;
    timesSucceeded: number;
    lastUsed: number;
    firstCached: number;
  };
  /** TTL in milliseconds */
  ttl: number;
}

export interface Action {
  /** Action type */
  type: string;
  /** Action parameters */
  params: Record<string, unknown>;
  /** Expected outcome description */
  expectedOutcome?: string;
}

export interface CacheConfig {
  /** Max number of cached actions */
  maxSize: number;
  /** Default TTL in milliseconds */
  defaultTtl: number;
  /** Min success rate to keep in cache (0-1) */
  minSuccessRate: number;
  /** Hash algorithm for keys */
  hashAlgorithm: "simple" | "murmur" | "sha256";
  /** Enable similarity matching for near-misses */
  similarityMatching: boolean;
  /** Similarity threshold (0-1) */
  similarityThreshold: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 1000,
  defaultTtl: 24 * 60 * 60 * 1000, // 24 hours
  minSuccessRate: 0.5,
  hashAlgorithm: "simple",
  similarityMatching: true,
  similarityThreshold: 0.85,
};

export interface CacheHit {
  /** Cached action */
  action: Action;
  /** Confidence in match (0-1) */
  confidence: number;
  /** Whether this is exact match or similar */
  matchType: "exact" | "similar";
  /** Similarity score if similar match */
  similarityScore?: number;
}

export interface CacheStats {
  /** Total entries in cache */
  size: number;
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Entries by success rate */
  bySuccessRate: {
    high: number; // > 0.8
    medium: number; // 0.5 - 0.8
    low: number; // < 0.5
  };
  /** Average cache entry age (ms) */
  avgAge: number;
}

/**
 * Action Cache for replay without LLM calls
 */
export class ActionCache {
  private cache: Map<string, CachedAction> = new Map();
  private config: CacheConfig;
  private stats = { hits: 0, misses: 0 };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Generate cache key from instruction and DOM state
   */
  generateKey(instruction: string, domState: string, url: string): string {
    const normalizedInstruction = instruction.toLowerCase().trim();
    const normalizedUrl = this.normalizeUrl(url);

    switch (this.config.hashAlgorithm) {
      case "sha256":
        // Would use crypto.createHash in production
        return `${normalizedInstruction}:${normalizedUrl}:${this.simpleHash(domState)}`;
      case "murmur":
        // Would use murmurhash in production
        return `${normalizedInstruction}:${normalizedUrl}:${this.simpleHash(domState)}`;
      case "simple":
      default:
        return `${normalizedInstruction}:${normalizedUrl}:${this.simpleHash(domState)}`;
    }
  }

  /**
   * Simple hash function for DOM state
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Normalize URL for key generation
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove query params and hash for matching
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * Generate DOM hash from key elements
   */
  generateDomHash(elements: ElementSignature[]): string {
    // Sort and join element signatures for consistent hashing
    const sorted = elements
      .map((e) => `${e.tag}:${e.id || ""}:${e.text?.slice(0, 30) || ""}`)
      .sort()
      .join("|");

    return this.simpleHash(sorted);
  }

  /**
   * Cache a successful action
   */
  set(
    instruction: string,
    domState: string,
    url: string,
    action: Action,
    ttl?: number,
  ): CachedAction {
    const key = this.generateKey(instruction, domState, url);
    const domHash = this.simpleHash(domState);

    const cached: CachedAction = {
      key,
      instruction: instruction.toLowerCase().trim(),
      action,
      domHash,
      url: this.normalizeUrl(url),
      stats: {
        timesUsed: 0,
        timesSucceeded: 0,
        lastUsed: Date.now(),
        firstCached: Date.now(),
      },
      ttl: ttl ?? this.config.defaultTtl,
    };

    this.cache.set(key, cached);
    this.evictIfNeeded();

    return cached;
  }

  /**
   * Get cached action
   */
  get(instruction: string, domState: string, url: string): CacheHit | undefined {
    const key = this.generateKey(instruction, domState, url);
    const cached = this.cache.get(key);

    // Exact match
    if (cached && !this.isExpired(cached)) {
      this.stats.hits++;
      cached.stats.timesUsed++;
      cached.stats.lastUsed = Date.now();

      return {
        action: cached.action,
        confidence: 1.0,
        matchType: "exact",
      };
    }

    // Try similarity matching
    if (this.config.similarityMatching) {
      const similar = this.findSimilar(instruction, domState, url);
      if (similar) {
        this.stats.hits++;
        return similar;
      }
    }

    this.stats.misses++;
    return undefined;
  }

  /**
   * Find similar cached action
   */
  private findSimilar(instruction: string, domState: string, url: string): CacheHit | undefined {
    const normalizedUrl = this.normalizeUrl(url);
    const domHash = this.simpleHash(domState);
    const normalizedInstruction = instruction.toLowerCase().trim();

    let bestMatch: CachedAction | undefined;
    let bestScore = 0;

    for (const cached of this.cache.values()) {
      if (this.isExpired(cached)) continue;
      if (cached.url !== normalizedUrl) continue;

      // Calculate instruction similarity
      const instructionScore = this.calculateSimilarity(normalizedInstruction, cached.instruction);

      // Calculate DOM similarity (exact or close)
      const domScore = domHash === cached.domHash ? 1.0 : 0.5;

      // Combined score
      const score = instructionScore * 0.7 + domScore * 0.3;

      if (score > bestScore && score >= this.config.similarityThreshold) {
        bestScore = score;
        bestMatch = cached;
      }
    }

    if (bestMatch) {
      bestMatch.stats.timesUsed++;
      bestMatch.stats.lastUsed = Date.now();

      return {
        action: bestMatch.action,
        confidence: bestScore,
        matchType: "similar",
        similarityScore: bestScore,
      };
    }

    return undefined;
  }

  /**
   * Calculate string similarity (0-1)
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;

    // Token-based Jaccard similarity
    const tokensA = new Set(a.split(/\s+/));
    const tokensB = new Set(b.split(/\s+/));

    const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);

    return intersection.size / union.size;
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(cached: CachedAction): boolean {
    return Date.now() - cached.stats.firstCached > cached.ttl;
  }

  /**
   * Report action result for success tracking
   */
  reportResult(instruction: string, domState: string, url: string, success: boolean): void {
    const key = this.generateKey(instruction, domState, url);
    const cached = this.cache.get(key);

    if (cached) {
      if (success) {
        cached.stats.timesSucceeded++;
      }

      // Remove if success rate too low
      const successRate = cached.stats.timesSucceeded / cached.stats.timesUsed;
      if (cached.stats.timesUsed >= 3 && successRate < this.config.minSuccessRate) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evict entries if cache is too large
   */
  private evictIfNeeded(): void {
    if (this.cache.size <= this.config.maxSize) return;

    // Sort by: success rate, recency, usage count
    const entries = Array.from(this.cache.entries()).sort((a, b) => {
      const scoreA = this.calculatePriorityScore(a[1]);
      const scoreB = this.calculatePriorityScore(b[1]);
      return scoreA - scoreB;
    });

    // Remove lowest scoring entries
    const toRemove = entries.slice(0, entries.length - this.config.maxSize);
    for (const [key] of toRemove) {
      this.cache.delete(key);
    }
  }

  /**
   * Calculate priority score for eviction (higher = keep)
   */
  private calculatePriorityScore(cached: CachedAction): number {
    const successRate =
      cached.stats.timesUsed > 0 ? cached.stats.timesSucceeded / cached.stats.timesUsed : 0;

    const recency = Date.now() - cached.stats.lastUsed;
    const recencyScore = Math.max(0, 1 - recency / (24 * 60 * 60 * 1000)); // 24h decay

    const usageScore = Math.min(cached.stats.timesUsed / 10, 1); // Cap at 10 uses

    return successRate * 0.5 + recencyScore * 0.3 + usageScore * 0.2;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const total = this.stats.hits + this.stats.misses;

    const bySuccessRate = {
      high: 0,
      medium: 0,
      low: 0,
    };

    let totalAge = 0;

    for (const entry of entries) {
      const successRate =
        entry.stats.timesUsed > 0 ? entry.stats.timesSucceeded / entry.stats.timesUsed : 0;

      if (successRate > 0.8) bySuccessRate.high++;
      else if (successRate >= 0.5) bySuccessRate.medium++;
      else bySuccessRate.low++;

      totalAge += Date.now() - entry.stats.firstCached;
    }

    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      bySuccessRate,
      avgAge: entries.length > 0 ? totalAge / entries.length : 0,
    };
  }

  /**
   * Export cache for persistence
   */
  export(): CachedAction[] {
    return Array.from(this.cache.values());
  }

  /**
   * Import cache from persistence
   */
  import(actions: CachedAction[]): void {
    for (const action of actions) {
      if (!this.isExpired(action)) {
        this.cache.set(action.key, action);
      }
    }
    this.evictIfNeeded();
  }
}

/**
 * Element signature for DOM hashing
 */
export interface ElementSignature {
  tag: string;
  id?: string;
  className?: string;
  text?: string;
  role?: string;
}

/**
 * Cached action with metadata for replay
 */
export interface ReplayableAction {
  /** Original cached action */
  cached: CachedAction;
  /** Replay function */
  replay: () => Promise<unknown>;
  /** Validation function */
  validate: () => Promise<boolean>;
}
