/**
 * Action Caching System - Enhanced Version
 *
 * Caches successful actions by hash(instruction + DOM state) for replay without LLM calls.
 * Inspired by browser-use and Stagehand action caching.
 *
 * NEW: Deterministic keys, validation on replay, smart invalidation
 */

import { createHash } from "node:crypto";

export interface CachedAction {
  /** Unique cache key */
  key: string;
  /** Original instruction */
  instruction: string;
  /** Normalized/canonicalized instruction */
  canonicalInstruction: string;
  /** Action to execute */
  action: Action;
  /** DOM state hash when cached */
  domHash: string;
  /** Structural DOM hash (tags only, no text) */
  structuralDomHash: string;
  /** URL when cached (canonicalized) */
  url: string;
  /** URL pattern for matching */
  urlPattern: string;
  /** Success rate tracking */
  stats: {
    timesUsed: number;
    timesSucceeded: number;
    timesFailed: number;
    lastUsed: number;
    firstCached: number;
    lastValidated: number;
  };
  /** TTL in milliseconds */
  ttl: number;
  /** Validation config */
  validation: ValidationConfig;
  /** Expected outcome for validation */
  expectedOutcome: ExpectedOutcome;
}

export interface Action {
  /** Action type */
  type: string;
  /** Action parameters */
  params: Record<string, unknown>;
  /** Expected outcome description */
  expectedOutcome?: string;
  /** Selector used (for validation) */
  selector?: string;
}

export interface ValidationConfig {
  /** Validate on replay */
  enabled: boolean;
  /** Validation strategy */
  strategy: "selector" | "screenshot" | "outcome" | "none";
  /** Screenshot comparison threshold (0-1) */
  screenshotThreshold?: number;
  /** Retry count on validation failure */
  retryCount: number;
}

export interface ExpectedOutcome {
  /** Expected URL after action */
  url?: string;
  /** Expected element to be present */
  elementPresent?: string;
  /** Expected text to be present */
  textPresent?: string;
  /** Screenshot hash for comparison */
  screenshotHash?: string;
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
  /** Auto-validate on replay */
  autoValidate: boolean;
  /** Invalidate on DOM change detection */
  invalidateOnDomChange: boolean;
  /** DOM change sensitivity (0-1) */
  domChangeThreshold: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 1000,
  defaultTtl: 24 * 60 * 60 * 1000, // 24 hours
  minSuccessRate: 0.7,
  hashAlgorithm: "sha256",
  similarityMatching: true,
  similarityThreshold: 0.85,
  autoValidate: true,
  invalidateOnDomChange: true,
  domChangeThreshold: 0.3,
};

export interface CacheHit {
  /** Cached action */
  action: Action;
  /** Confidence in match (0-1) */
  confidence: number;
  /** Whether this is exact match or similar */
  matchType: "exact" | "similar" | "structural";
  /** Similarity score if similar match */
  similarityScore?: number;
  /** Validation status */
  validationStatus?: "pending" | "passed" | "failed";
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
  /** Validation stats */
  validation: {
    passed: number;
    failed: number;
    skipped: number;
  };
  /** Entries by success rate */
  bySuccessRate: {
    high: number; // > 0.8
    medium: number; // 0.5 - 0.8
    low: number; // < 0.5
  };
  /** Average cache entry age (ms) */
  avgAge: number;
  /** DOM change invalidations */
  domInvalidations: number;
}

export interface ValidationResult {
  /** Whether validation passed */
  passed: boolean;
  /** Confidence in validation (0-1) */
  confidence: number;
  /** Validation details */
  details: {
    urlMatch?: boolean;
    elementPresent?: boolean;
    textPresent?: boolean;
    screenshotMatch?: boolean;
  };
  /** Suggested action if validation failed */
  suggestion?: string;
}

/**
 * Action Cache for replay without LLM calls
 */
export class ActionCache {
  private cache: Map<string, CachedAction> = new Map();
  private config: CacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    validationPassed: 0,
    validationFailed: 0,
    domInvalidations: 0,
  };
  private domHistory: Map<string, string> = new Map(); // URL -> DOM hash history

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Generate deterministic cache key from instruction and DOM state
   * Stagehand-style: hash(instruction) + canonicalized URL + DOM hash
   */
  generateKey(instruction: string, domState: string, url: string): string {
    const canonicalInstruction = this.canonicalizeInstruction(instruction);
    const normalizedUrl = this.normalizeUrl(url);
    const domHash = this.hashDomState(domState);

    // Deterministic key: instruction hash + URL + DOM hash
    const keyComponents = `${canonicalInstruction}:${normalizedUrl}:${domHash}`;

    switch (this.config.hashAlgorithm) {
      case "sha256":
        return createHash("sha256").update(keyComponents).digest("hex").slice(0, 32);
      case "murmur":
        // Simple murmur-like hash
        return this.murmurHash(keyComponents).toString(16);
      case "simple":
      default:
        return this.simpleHash(keyComponents);
    }
  }

  /**
   * Canonicalize instruction for consistent keys
   * "Click the login button" -> "click login button"
   */
  private canonicalizeInstruction(instruction: string): string {
    return instruction
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s]/g, "") // Remove punctuation
      .replace(/\b(the|a|an)\b/g, "") // Remove articles
      .trim();
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Murmur-like hash function
   */
  private murmurHash(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i);
    }
    return h >>> 0;
  }

  /**
   * Normalize URL for key generation
   * Removes query params, hashes, normalizes trailing slashes
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove query params and hash, normalize path
      let pathname = urlObj.pathname.replace(/\/+/g, "/");
      if (pathname !== "/" && pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
      }
      return `${urlObj.origin}${pathname}`.toLowerCase();
    } catch {
      return url.toLowerCase().trim();
    }
  }

  /**
   * Generate URL pattern for flexible matching
   */
  private generateUrlPattern(url: string): string {
    const normalized = this.normalizeUrl(url);
    // Create pattern that ignores specific IDs in URLs
    return normalized.replace(/\/\d+/g, "/:id");
  }

  /**
   * Hash DOM state for cache keys
   */
  private hashDomState(domState: string): string {
    if (this.config.hashAlgorithm === "sha256") {
      return createHash("sha256").update(domState).digest("hex").slice(0, 16);
    }
    return this.simpleHash(domState);
  }

  /**
   * Generate structural DOM hash (tags only, no text)
   * Used for matching when content changes but structure stays same
   */
  generateStructuralDomHash(elements: ElementSignature[]): string {
    const structural = elements
      .map((e) => `${e.tag}:${e.role || ""}:${e.id || ""}`)
      .sort()
      .join("|");

    return this.config.hashAlgorithm === "sha256"
      ? createHash("sha256").update(structural).digest("hex").slice(0, 16)
      : this.simpleHash(structural);
  }

  /**
   * Generate full DOM hash from elements
   */
  generateDomHash(elements: ElementSignature[]): string {
    const signature = elements
      .map((e) => `${e.tag}:${e.id || ""}:${e.role || ""}:${e.text?.slice(0, 50) || ""}`)
      .sort()
      .join("|");

    return this.config.hashAlgorithm === "sha256"
      ? createHash("sha256").update(signature).digest("hex").slice(0, 16)
      : this.simpleHash(signature);
  }

  /**
   * Cache a successful action with validation config
   */
  set(
    instruction: string,
    domState: string,
    url: string,
    action: Action,
    elements: ElementSignature[],
    outcome?: Partial<ExpectedOutcome>,
    ttl?: number,
  ): CachedAction {
    const key = this.generateKey(instruction, domState, url);
    const domHash = this.generateDomHash(elements);
    const structuralDomHash = this.generateStructuralDomHash(elements);
    const canonicalInstruction = this.canonicalizeInstruction(instruction);

    const cached: CachedAction = {
      key,
      instruction: instruction.trim(),
      canonicalInstruction,
      action,
      domHash,
      structuralDomHash,
      url: this.normalizeUrl(url),
      urlPattern: this.generateUrlPattern(url),
      stats: {
        timesUsed: 0,
        timesSucceeded: 0,
        timesFailed: 0,
        lastUsed: Date.now(),
        firstCached: Date.now(),
        lastValidated: Date.now(),
      },
      ttl: ttl ?? this.config.defaultTtl,
      validation: {
        enabled: this.config.autoValidate,
        strategy: action.selector ? "selector" : "outcome",
        retryCount: 1,
      },
      expectedOutcome: {
        url: outcome?.url || this.normalizeUrl(url),
        elementPresent: outcome?.elementPresent,
        textPresent: outcome?.textPresent,
        screenshotHash: outcome?.screenshotHash,
      },
    };

    // Track DOM state for change detection
    this.trackDomState(url, domHash);

    this.cache.set(key, cached);
    this.evictIfNeeded();

    return cached;
  }

  /**
   * Track DOM state for change detection
   */
  private trackDomState(url: string, domHash: string): void {
    const normalizedUrl = this.normalizeUrl(url);
    const history = this.domHistory.get(normalizedUrl);
    if (history && history !== domHash) {
      // DOM changed - could invalidate related entries
      if (this.config.invalidateOnDomChange) {
        this.invalidateByUrl(normalizedUrl);
      }
    }
    this.domHistory.set(normalizedUrl, domHash);
  }

  /**
   * Invalidate cache entries for a URL
   */
  private invalidateByUrl(url: string): number {
    let count = 0;
    const normalizedUrl = this.normalizeUrl(url);

    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (entry.url === normalizedUrl) {
        this.cache.delete(key);
        count++;
      }
    }

    this.stats.domInvalidations += count;
    return count;
  }

  /**
   * Get cached action with smart matching
   */
  get(
    instruction: string,
    domState: string,
    url: string,
    currentElements?: ElementSignature[],
  ): CacheHit | undefined {
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
        validationStatus: this.config.autoValidate ? "pending" : undefined,
      };
    }

    // Check for DOM changes that might invalidate
    if (this.config.invalidateOnDomChange && currentElements) {
      const _currentDomHash = this.generateDomHash(currentElements);
      const currentStructuralHash = this.generateStructuralDomHash(currentElements);

      // Try structural match (same layout, different content)
      const structuralMatch = this.findStructuralMatch(instruction, url, currentStructuralHash);
      if (structuralMatch) {
        this.stats.hits++;
        return structuralMatch;
      }
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
   * Find match by structural similarity (same layout, different content)
   */
  private findStructuralMatch(
    instruction: string,
    url: string,
    structuralHash: string,
  ): CacheHit | undefined {
    const canonicalInstruction = this.canonicalizeInstruction(instruction);
    const normalizedUrl = this.normalizeUrl(url);

    for (const cached of Array.from(this.cache.values())) {
      if (this.isExpired(cached)) continue;

      // Match by URL pattern and structural hash
      const urlMatches =
        cached.url === normalizedUrl || this.urlMatchesPattern(normalizedUrl, cached.urlPattern);
      const structureMatches = cached.structuralDomHash === structuralHash;
      const instructionMatches = cached.canonicalInstruction === canonicalInstruction;

      if (urlMatches && structureMatches && instructionMatches) {
        cached.stats.timesUsed++;
        cached.stats.lastUsed = Date.now();

        return {
          action: cached.action,
          confidence: 0.85,
          matchType: "structural",
          validationStatus: "pending",
        };
      }
    }

    return undefined;
  }

  /**
   * Check if URL matches pattern
   */
  private urlMatchesPattern(url: string, pattern: string): boolean {
    // Simple pattern matching: /users/123 matches /users/:id
    const patternRegex = new RegExp("^" + pattern.replace(/:id/g, "\\d+") + "$");
    return patternRegex.test(url);
  }

  /**
   * Find similar cached action
   */
  private findSimilar(instruction: string, domState: string, url: string): CacheHit | undefined {
    const normalizedUrl = this.normalizeUrl(url);
    const domHash = this.hashDomState(domState);
    const canonicalInstruction = this.canonicalizeInstruction(instruction);

    let bestMatch: CachedAction | undefined;
    let bestScore = 0;

    for (const cached of Array.from(this.cache.values())) {
      if (this.isExpired(cached)) continue;

      // URL must match or have same pattern
      if (
        cached.url !== normalizedUrl &&
        !this.urlMatchesPattern(normalizedUrl, cached.urlPattern)
      ) {
        continue;
      }

      // Calculate instruction similarity
      const instructionScore = this.calculateSimilarity(
        canonicalInstruction,
        cached.canonicalInstruction,
      );

      // Calculate DOM similarity
      const domScore =
        domHash === cached.domHash ? 1.0 : this.calculateDomSimilarity(domHash, cached.domHash);

      // Combined score weighted by success rate
      const successRate =
        cached.stats.timesUsed > 0 ? cached.stats.timesSucceeded / cached.stats.timesUsed : 0.5;
      const score = instructionScore * 0.5 + domScore * 0.3 + successRate * 0.2;

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
        validationStatus: "pending",
      };
    }

    return undefined;
  }

  /**
   * Calculate DOM similarity between two hashes
   */
  private calculateDomSimilarity(hashA: string, hashB: string): number {
    // Simple char-by-char comparison for similar hashes
    let matches = 0;
    const minLen = Math.min(hashA.length, hashB.length);
    for (let i = 0; i < minLen; i++) {
      if (hashA[i] === hashB[i]) matches++;
    }
    return matches / Math.max(hashA.length, hashB.length);
  }

  /**
   * Calculate string similarity (0-1) using Jaccard
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;

    const tokensA = new Set(a.split(/\s+/));
    const tokensB = new Set(b.split(/\s+/));

    const intersection = new Set(Array.from(tokensA).filter((x) => tokensB.has(x)));
    const union = new Set(Array.from(tokensA).concat(Array.from(tokensB)));

    return intersection.size / union.size;
  }

  /**
   * Validate a cached action on replay
   */
  async validate(
    cached: CachedAction,
    currentState: {
      url: string;
      elementPresent?: boolean;
      textPresent?: boolean;
      screenshotHash?: string;
    },
  ): Promise<ValidationResult> {
    if (!cached.validation.enabled) {
      return { passed: true, confidence: 1, details: {} };
    }

    const details: ValidationResult["details"] = {};

    // URL validation
    details.urlMatch = this.normalizeUrl(currentState.url) === cached.expectedOutcome.url;

    // Element presence validation
    if (cached.expectedOutcome.elementPresent !== undefined) {
      details.elementPresent = currentState.elementPresent;
    }

    // Text presence validation
    if (cached.expectedOutcome.textPresent !== undefined) {
      details.textPresent = currentState.textPresent;
    }

    // Screenshot validation
    if (cached.expectedOutcome.screenshotHash && currentState.screenshotHash) {
      details.screenshotMatch =
        cached.expectedOutcome.screenshotHash === currentState.screenshotHash;
    }

    // Determine overall pass
    const checks = Object.values(details).filter((v) => v !== undefined);
    const passedChecks = checks.filter(Boolean).length;
    const confidence = checks.length > 0 ? passedChecks / checks.length : 1;
    const passed = confidence >= 0.7; // At least 70% of checks pass

    cached.stats.lastValidated = Date.now();

    if (passed) {
      this.stats.validationPassed++;
      cached.stats.timesSucceeded++;
    } else {
      this.stats.validationFailed++;
      cached.stats.timesFailed++;
    }

    return {
      passed,
      confidence,
      details,
      suggestion: passed ? undefined : "DOM changed significantly - consider re-caching",
    };
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
      } else {
        cached.stats.timesFailed++;
      }

      // Remove if success rate too low
      const totalAttempts = cached.stats.timesSucceeded + cached.stats.timesFailed;
      if (totalAttempts >= 3) {
        const successRate = cached.stats.timesSucceeded / totalAttempts;
        if (successRate < this.config.minSuccessRate) {
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * Evict entries if cache is too large
   */
  private evictIfNeeded(): void {
    if (this.cache.size <= this.config.maxSize) return;

    const entries = Array.from(this.cache.entries()).sort((a, b) => {
      const scoreA = this.calculatePriorityScore(a[1]);
      const scoreB = this.calculatePriorityScore(b[1]);
      return scoreA - scoreB;
    });

    const toRemove = entries.slice(0, entries.length - this.config.maxSize);
    for (const [key] of toRemove) {
      this.cache.delete(key);
    }
  }

  /**
   * Calculate priority score for eviction (higher = keep)
   */
  private calculatePriorityScore(cached: CachedAction): number {
    const totalAttempts = cached.stats.timesSucceeded + cached.stats.timesFailed;
    const successRate = totalAttempts > 0 ? cached.stats.timesSucceeded / totalAttempts : 0;

    const recency = Date.now() - cached.stats.lastUsed;
    const recencyScore = Math.max(0, 1 - recency / (24 * 60 * 60 * 1000));

    const usageScore = Math.min(cached.stats.timesUsed / 10, 1);

    const validationScore = cached.stats.lastValidated > 0 ? 0.1 : 0;

    return successRate * 0.4 + recencyScore * 0.25 + usageScore * 0.25 + validationScore * 0.1;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.domHistory.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      validationPassed: 0,
      validationFailed: 0,
      domInvalidations: 0,
    };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const total = this.stats.hits + this.stats.misses;

    const bySuccessRate = { high: 0, medium: 0, low: 0 };
    let totalAge = 0;

    for (const entry of entries) {
      const totalAttempts = entry.stats.timesSucceeded + entry.stats.timesFailed;
      const successRate = totalAttempts > 0 ? entry.stats.timesSucceeded / totalAttempts : 0;

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
      validation: {
        passed: this.stats.validationPassed,
        failed: this.stats.validationFailed,
        skipped: total - this.stats.validationPassed - this.stats.validationFailed,
      },
      bySuccessRate,
      avgAge: entries.length > 0 ? totalAge / entries.length : 0,
      domInvalidations: this.stats.domInvalidations,
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

  /**
   * Get cache entries for a specific URL
   */
  getByUrl(url: string): CachedAction[] {
    const normalizedUrl = this.normalizeUrl(url);
    return Array.from(this.cache.values()).filter((entry) => entry.url === normalizedUrl);
  }

  /**
   * Invalidate entries matching a predicate
   */
  invalidate(predicate: (entry: CachedAction) => boolean): number {
    let count = 0;
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (predicate(entry)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
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
