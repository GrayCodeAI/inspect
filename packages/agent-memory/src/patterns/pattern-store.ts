/**
 * Pattern Store
 *
 * Stores and retrieves learned patterns from agent executions.
 * Supports pattern matching, similarity search, and adaptation.
 */

import { EventEmitter } from "events";

export interface PatternStoreConfig {
  /** Max patterns to store */
  maxPatterns: number;
  /** Similarity threshold for matching (0-1) */
  similarityThreshold: number;
  /** Enable automatic indexing */
  autoIndex: boolean;
  /** Storage adapter */
  storage?: PatternStorage;
  /** On pattern learned */
  onPatternLearned?: (pattern: LearnedPattern) => void;
  /** On pattern matched */
  onPatternMatched?: (match: PatternMatch) => void;
}

export interface LearnedPattern {
  id: string;
  name: string;
  description: string;
  type: PatternType;
  context: PatternContext;
  sequence: PatternStep[];
  outcomes: PatternOutcome[];
  metadata: PatternMetadata;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  successRate: number;
  avgExecutionTime: number;
}

export type PatternType =
  | "navigation"
  | "form-filling"
  | "data-extraction"
  | "verification"
  | "error-recovery"
  | "custom";

export interface PatternContext {
  url?: string;
  domain?: string;
  pageType?: string;
  selectors?: string[];
  keywords?: string[];
  features?: Record<string, boolean>;
}

export interface PatternStep {
  id: string;
  action: string;
  params: Record<string, unknown>;
  selector?: string;
  description: string;
  optional: boolean;
  alternatives?: string[];
}

export interface PatternOutcome {
  result: "success" | "failure" | "partial";
  duration: number;
  timestamp: number;
  context?: Record<string, unknown>;
}

export interface PatternMetadata {
  author?: string;
  tags: string[];
  category?: string;
  priority: number;
  version: number;
  parentPattern?: string;
}

export interface PatternMatch {
  pattern: LearnedPattern;
  confidence: number;
  context: PatternContext;
  suggestedSteps: PatternStep[];
  estimatedSuccessRate: number;
  estimatedDuration: number;
}

export interface PatternStorage {
  save(pattern: LearnedPattern): Promise<void>;
  load(id: string): Promise<LearnedPattern | null>;
  findSimilar(context: PatternContext, threshold: number): Promise<LearnedPattern[]>;
  query(filter: PatternFilter): Promise<LearnedPattern[]>;
  delete(id: string): Promise<boolean>;
}

export interface PatternFilter {
  type?: PatternType;
  domain?: string;
  tags?: string[];
  minSuccessRate?: number;
  minUsageCount?: number;
}

export interface PatternTemplate {
  name: string;
  type: PatternType;
  description: string;
  contextRequirements: string[];
  stepTemplates: StepTemplate[];
}

export interface StepTemplate {
  action: string;
  paramTemplate: Record<string, string>;
  selectorTemplate?: string;
}

export const DEFAULT_PATTERN_STORE_CONFIG: PatternStoreConfig = {
  maxPatterns: 1000,
  similarityThreshold: 0.7,
  autoIndex: true,
};

/**
 * In-memory pattern storage
 */
export class InMemoryPatternStorage implements PatternStorage {
  private patterns = new Map<string, LearnedPattern>();
  private index = new Map<string, Set<string>>(); // keyword -> pattern ids

  async save(pattern: LearnedPattern): Promise<void> {
    this.patterns.set(pattern.id, { ...pattern });

    // Update index
    if (pattern.context.keywords) {
      for (const keyword of pattern.context.keywords) {
        if (!this.index.has(keyword)) {
          this.index.set(keyword, new Set());
        }
        this.index.get(keyword)!.add(pattern.id);
      }
    }
  }

  async load(id: string): Promise<LearnedPattern | null> {
    const pattern = this.patterns.get(id);
    return pattern ? { ...pattern } : null;
  }

  async findSimilar(context: PatternContext, threshold: number): Promise<LearnedPattern[]> {
    const scores = new Map<string, number>();

    // Score by keywords
    if (context.keywords) {
      for (const keyword of context.keywords) {
        const ids = this.index.get(keyword);
        if (ids) {
          for (const id of ids) {
            scores.set(id, (scores.get(id) || 0) + 1);
          }
        }
      }
    }

    // Score by domain
    if (context.domain) {
      for (const [id, pattern] of this.patterns) {
        if (pattern.context.domain === context.domain) {
          scores.set(id, (scores.get(id) || 0) + 2);
        }
      }
    }

    // Normalize and filter
    const results: LearnedPattern[] = [];
    const maxScore = Math.max(...scores.values(), 1);

    for (const [id, score] of scores) {
      const normalizedScore = score / maxScore;
      if (normalizedScore >= threshold) {
        const pattern = this.patterns.get(id);
        if (pattern) {
          results.push(pattern);
        }
      }
    }

    return results.sort((a, b) => b.successRate - a.successRate);
  }

  async query(filter: PatternFilter): Promise<LearnedPattern[]> {
    let results = Array.from(this.patterns.values());

    if (filter.type) {
      results = results.filter((p) => p.type === filter.type);
    }

    if (filter.domain) {
      results = results.filter((p) => p.context.domain === filter.domain);
    }

    if (filter.tags) {
      results = results.filter((p) =>
        filter.tags!.some((t) => p.metadata.tags.includes(t))
      );
    }

    if (filter.minSuccessRate !== undefined) {
      results = results.filter((p) => p.successRate >= filter.minSuccessRate!);
    }

    if (filter.minUsageCount !== undefined) {
      results = results.filter((p) => p.usageCount >= filter.minUsageCount!);
    }

    return results;
  }

  async delete(id: string): Promise<boolean> {
    const pattern = this.patterns.get(id);
    if (pattern) {
      // Remove from index
      if (pattern.context.keywords) {
        for (const keyword of pattern.context.keywords) {
          this.index.get(keyword)?.delete(id);
        }
      }
    }

    return this.patterns.delete(id);
  }
}

/**
 * Pattern Store
 *
 * Manages learned patterns with matching and adaptation capabilities.
 */
export class PatternStore extends EventEmitter {
  private config: PatternStoreConfig;
  private patterns = new Map<string, LearnedPattern>();
  private storage: PatternStorage;

  constructor(config: Partial<PatternStoreConfig> = {}) {
    super();
    this.config = { ...DEFAULT_PATTERN_STORE_CONFIG, ...config };
    this.storage = config.storage || new InMemoryPatternStorage();
  }

  /**
   * Learn a new pattern from execution
   */
  async learn(
    name: string,
    type: PatternType,
    context: PatternContext,
    sequence: PatternStep[],
    outcome: PatternOutcome,
    metadata?: Partial<PatternMetadata>
  ): Promise<LearnedPattern> {
    // Check for similar existing pattern
    const similar = await this.findSimilar(context);

    if (similar.length > 0 && similar[0].confidence > 0.9) {
      // Update existing pattern
      return this.updatePattern(similar[0].pattern, sequence, outcome);
    }

    // Create new pattern
    const pattern: LearnedPattern = {
      id: `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      description: `Pattern for ${type} on ${context.domain || "unknown domain"}`,
      type,
      context,
      sequence,
      outcomes: [outcome],
      metadata: {
        tags: metadata?.tags || [],
        priority: metadata?.priority || 1,
        version: 1,
        ...metadata,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 1,
      successRate: outcome.result === "success" ? 1 : 0,
      avgExecutionTime: outcome.duration,
    };

    this.patterns.set(pattern.id, pattern);
    await this.storage.save(pattern);

    // Enforce max patterns
    this.enforceMaxPatterns();

    this.emit("pattern:learned", pattern);
    this.config.onPatternLearned?.(pattern);

    return pattern;
  }

  /**
   * Update existing pattern
   */
  private async updatePattern(
    pattern: LearnedPattern,
    sequence: PatternStep[],
    outcome: PatternOutcome
  ): Promise<LearnedPattern> {
    pattern.outcomes.push(outcome);

    // Keep only last 100 outcomes
    if (pattern.outcomes.length > 100) {
      pattern.outcomes = pattern.outcomes.slice(-100);
    }

    // Update stats
    pattern.usageCount++;
    pattern.updatedAt = Date.now();

    const successes = pattern.outcomes.filter((o) => o.result === "success").length;
    pattern.successRate = successes / pattern.outcomes.length;

    pattern.avgExecutionTime =
      pattern.outcomes.reduce((sum, o) => sum + o.duration, 0) /
      pattern.outcomes.length;

    // Optionally update sequence if this one is shorter/more efficient
    if (sequence.length < pattern.sequence.length && outcome.result === "success") {
      pattern.sequence = sequence;
      pattern.metadata.version++;
    }

    await this.storage.save(pattern);

    return pattern;
  }

  /**
   * Find patterns matching context
   */
  async findSimilar(context: PatternContext): Promise<PatternMatch[]> {
    const candidates = await this.storage.findSimilar(
      context,
      this.config.similarityThreshold
    );

    const matches: PatternMatch[] = [];

    for (const pattern of candidates) {
      const confidence = this.calculateSimilarity(pattern.context, context);

      if (confidence >= this.config.similarityThreshold) {
        matches.push({
          pattern,
          confidence,
          context,
          suggestedSteps: this.adaptSteps(pattern.sequence, context),
          estimatedSuccessRate: pattern.successRate,
          estimatedDuration: pattern.avgExecutionTime,
        });
      }
    }

    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);

    if (matches.length > 0) {
      this.emit("pattern:matched", matches[0]);
      this.config.onPatternMatched?.(matches[0]);
    }

    return matches;
  }

  /**
   * Get pattern by ID
   */
  async get(id: string): Promise<LearnedPattern | null> {
    const mem = this.patterns.get(id);
    if (mem) return mem;

    return this.storage.load(id);
  }

  /**
   * Query patterns
   */
  async query(filter: PatternFilter): Promise<LearnedPattern[]> {
    return this.storage.query(filter);
  }

  /**
   * Get patterns by type
   */
  async getByType(type: PatternType): Promise<LearnedPattern[]> {
    return this.query({ type });
  }

  /**
   * Get most successful patterns
   */
  async getMostSuccessful(limit = 10): Promise<LearnedPattern[]> {
    const all = await this.query({});
    return all
      .filter((p) => p.usageCount >= 5)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, limit);
  }

  /**
   * Get patterns for domain
   */
  async getForDomain(domain: string): Promise<LearnedPattern[]> {
    return this.query({ domain });
  }

  /**
   * Delete pattern
   */
  async delete(id: string): Promise<boolean> {
    this.patterns.delete(id);
    return this.storage.delete(id);
  }

  /**
   * Calculate context similarity
   */
  private calculateSimilarity(a: PatternContext, b: PatternContext): number {
    let score = 0;
    let factors = 0;

    // Domain match (high weight)
    if (a.domain && b.domain) {
      factors += 3;
      if (a.domain === b.domain) {
        score += 3;
      } else if (a.domain.endsWith(b.domain) || b.domain.endsWith(a.domain)) {
        score += 1.5;
      }
    }

    // URL pattern match
    if (a.url && b.url) {
      factors += 2;
      if (this.urlSimilarity(a.url, b.url) > 0.8) {
        score += 2;
      }
    }

    // Page type match
    if (a.pageType && b.pageType) {
      factors += 2;
      if (a.pageType === b.pageType) {
        score += 2;
      }
    }

    // Keywords overlap
    if (a.keywords && b.keywords) {
      factors += 2;
      const overlap = a.keywords.filter((k) => b.keywords!.includes(k));
      score += (overlap.length / Math.max(a.keywords.length, b.keywords.length)) * 2;
    }

    // Selectors overlap
    if (a.selectors && b.selectors) {
      factors += 1;
      const overlap = a.selectors.filter((s) => b.selectors!.includes(s));
      if (overlap.length > 0) score += 1;
    }

    return factors > 0 ? score / factors : 0;
  }

  /**
   * Calculate URL similarity
   */
  private urlSimilarity(a: string, b: string): number {
    try {
      const urlA = new URL(a);
      const urlB = new URL(b);

      if (urlA.hostname !== urlB.hostname) return 0;

      const pathA = urlA.pathname.split("/").filter(Boolean);
      const pathB = urlB.pathname.split("/").filter(Boolean);

      let matches = 0;
      for (let i = 0; i < Math.min(pathA.length, pathB.length); i++) {
        if (pathA[i] === pathB[i]) {
          matches++;
        } else if (!isNaN(Number(pathA[i])) && !isNaN(Number(pathB[i]))) {
          // Both numeric (likely IDs), consider partial match
          matches += 0.5;
        }
      }

      return matches / Math.max(pathA.length, pathB.length);
    } catch {
      return 0;
    }
  }

  /**
   * Adapt pattern steps to new context
   */
  private adaptSteps(
    steps: PatternStep[],
    context: PatternContext
  ): PatternStep[] {
    // Simple adaptation: update selectors if we have context selectors
    if (!context.selectors) return steps;

    return steps.map((step) => {
      if (step.selector && context.selectors) {
        // Try to find matching selector
        const matchingSelector = context.selectors.find((s) =>
          this.selectorSimilarity(s, step.selector!) > 0.8
        );

        if (matchingSelector) {
          return { ...step, selector: matchingSelector };
        }
      }
      return step;
    });
  }

  /**
   * Calculate selector similarity
   */
  private selectorSimilarity(a: string, b: string): number {
    // Simple heuristic: common substring length
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;

    let maxMatch = 0;
    for (let i = 0; i < shorter.length; i++) {
      for (let j = i + 1; j <= shorter.length; j++) {
        const substr = shorter.slice(i, j);
        if (longer.includes(substr)) {
          maxMatch = Math.max(maxMatch, substr.length);
        }
      }
    }

    return maxMatch / longer.length;
  }

  /**
   * Enforce max patterns limit
   */
  private enforceMaxPatterns(): void {
    if (this.patterns.size <= this.config.maxPatterns) return;

    const sorted = Array.from(this.patterns.values()).sort((a, b) => {
      // Sort by priority, then success rate, then usage
      if (a.metadata.priority !== b.metadata.priority) {
        return a.metadata.priority - b.metadata.priority;
      }
      if (a.successRate !== b.successRate) {
        return a.successRate - b.successRate;
      }
      return a.usageCount - b.usageCount;
    });

    const toRemove = this.patterns.size - this.config.maxPatterns;
    for (let i = 0; i < toRemove; i++) {
      this.patterns.delete(sorted[i].id);
    }
  }

  /**
   * Export patterns
   */
  exportPatterns(filter?: PatternFilter): string {
    const patterns = filter ? this.query(filter) : Promise.resolve(Array.from(this.patterns.values()));
    return JSON.stringify(patterns, null, 2);
  }

  /**
   * Import patterns
   */
  async importPatterns(data: string): Promise<number> {
    try {
      const patterns: LearnedPattern[] = JSON.parse(data);
      for (const pattern of patterns) {
        pattern.id = `imported-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        pattern.createdAt = Date.now();
        pattern.usageCount = 0;
        this.patterns.set(pattern.id, pattern);
        await this.storage.save(pattern);
      }
      return patterns.length;
    } catch {
      return 0;
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPatterns: number;
    byType: Record<string, number>;
    averageSuccessRate: number;
    totalUsages: number;
  } {
    const byType: Record<string, number> = {};
    let totalSuccessRate = 0;
    let totalUsages = 0;

    for (const pattern of this.patterns.values()) {
      byType[pattern.type] = (byType[pattern.type] || 0) + 1;
      totalSuccessRate += pattern.successRate;
      totalUsages += pattern.usageCount;
    }

    return {
      totalPatterns: this.patterns.size,
      byType,
      averageSuccessRate:
        this.patterns.size > 0 ? totalSuccessRate / this.patterns.size : 0,
      totalUsages,
    };
  }
}

/**
 * Convenience function
 */
export function createPatternStore(
  config?: Partial<PatternStoreConfig>
): PatternStore {
  return new PatternStore(config);
}
