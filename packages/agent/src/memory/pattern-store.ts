// ============================================================================
// @inspect/agent - Pattern Store (Cross-Session Learning)
//
// Remembers successful action patterns across test runs.
// When visiting a domain again, prioritizes previously successful selectors.
// Inspired by Stagehand's ActCache + Skyvern's element hash tracking.
// ============================================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface LearnedPattern {
  /** Domain this pattern applies to */
  domain: string;
  /** The instruction/action description */
  instruction: string;
  /** Selector that worked */
  selector: string;
  /** Number of times this worked */
  successCount: number;
  /** Last time it was used */
  lastUsedAt: number;
  /** First time it was learned */
  learnedAt: number;
}

/**
 * PatternStore persists successful action patterns across sessions.
 *
 * Usage:
 * ```ts
 * const store = new PatternStore();
 *
 * // After successful action:
 * store.learn("example.com", "Click login button", "#login-btn");
 *
 * // Before LLM call, check for known patterns:
 * const pattern = store.recall("example.com", "Click login button");
 * if (pattern) {
 *   // Try this selector first, skip LLM if it works
 * }
 * ```
 */
export class PatternStore {
  private patterns: LearnedPattern[] = [];
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(process.cwd(), ".inspect", "patterns.json");
    this.load();
  }

  /**
   * Record a successful action pattern.
   */
  learn(domain: string, instruction: string, selector: string): void {
    const existing = this.patterns.find(
      (p) => p.domain === domain && p.instruction.toLowerCase() === instruction.toLowerCase(),
    );

    if (existing) {
      existing.selector = selector;
      existing.successCount++;
      existing.lastUsedAt = Date.now();
    } else {
      this.patterns.push({
        domain,
        instruction,
        selector,
        successCount: 1,
        lastUsedAt: Date.now(),
        learnedAt: Date.now(),
      });
    }

    this.save();
  }

  /**
   * Recall a pattern for a domain + instruction.
   */
  recall(domain: string, instruction: string): LearnedPattern | null {
    const matches = this.patterns
      .filter((p) => p.domain === domain)
      .filter((p) => {
        const pLower = p.instruction.toLowerCase();
        const iLower = instruction.toLowerCase();
        // Exact or fuzzy match
        return pLower === iLower || pLower.includes(iLower) || iLower.includes(pLower);
      })
      .sort((a, b) => b.successCount - a.successCount);

    return matches[0] ?? null;
  }

  /**
   * Get all patterns for a domain.
   */
  getForDomain(domain: string): LearnedPattern[] {
    return this.patterns.filter((p) => p.domain === domain);
  }

  /**
   * Get total pattern count.
   */
  get size(): number {
    return this.patterns.length;
  }

  /**
   * Prune old patterns (keep most successful).
   */
  prune(maxPatterns = 500): void {
    if (this.patterns.length <= maxPatterns) return;
    this.patterns.sort((a, b) => b.successCount - a.successCount);
    this.patterns = this.patterns.slice(0, maxPatterns);
    this.save();
  }

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        this.patterns = JSON.parse(readFileSync(this.filePath, "utf-8"));
      }
    } catch {
      this.patterns = [];
    }
  }

  private save(): void {
    try {
      const dir = join(this.filePath, "..");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.patterns, null, 2));
    } catch {}
  }
}
