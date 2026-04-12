// ──────────────────────────────────────────────────────────────────────────────
// Self-Healing Service
// Orchestrates multiple healing strategies
// ──────────────────────────────────────────────────────────────────────────────

import type {
  ElementDescription,
  HealCandidate,
  PageSnapshot,
  HealingConfig,
  HealingResult,
  HealingStats,
  HealingEvent,
} from "./types.js";

import {
  findExactMatch,
  findExactTextMatch,
  findById,
  findByClass,
} from "./strategies/exact-match.js";

import {
  findSemanticMatches,
  findFuzzyMatches,
  findPartialMatches,
} from "./strategies/semantic-match.js";

import { findByAnchor, extractAnchors } from "./strategies/anchor-match.js";

import {
  getRecoveryStrategy,
  executeRecovery,
  defaultRecoveryPlaybook,
} from "./recovery-playbook.js";

const DEFAULT_CONFIG: HealingConfig = {
  minConfidence: 0.6,
  maxTimeMs: 5000,
  enableVision: true,
  enableAnchors: true,
  maxCandidates: 5,
  autoAcceptThreshold: 0.85,
  useLLM: true,
};

/**
 * Self-Healing Service
 */
export class SelfHealingService {
  private config: HealingConfig;
  private stats: HealingStats;
  private eventListeners: Array<(event: HealingEvent) => void> = [];

  constructor(config: Partial<HealingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      totalAttempts: 0,
      successfulHeals: 0,
      failedHeals: 0,
      successRate: 0,
      avgHealingTime: 0,
      byStrategy: {},
    };
  }

  /**
   * Attempt to heal a broken selector
   */
  async heal(
    originalSelector: string,
    description: ElementDescription,
    snapshot: PageSnapshot,
    options?: {
      anchors?: ReturnType<typeof extractAnchors>;
      screenshotBase64?: string;
      llmProvider?: {
        complete: (prompt: string) => Promise<string>;
      };
    },
  ): Promise<HealingResult> {
    const startTime = Date.now();
    this.stats.totalAttempts++;

    this.emitEvent({
      type: "healing_started",
      originalSelector,
      elapsed: 0,
      timestamp: Date.now(),
    });

    const allCandidates: HealCandidate[] = [];

    // Strategy 1: Exact match (fastest, highest confidence)
    const exactMatch = findExactMatch(description, snapshot);
    if (exactMatch && exactMatch.confidence >= this.config.minConfidence) {
      return this.handleSuccess(originalSelector, exactMatch, allCandidates, startTime);
    }
    if (exactMatch) allCandidates.push(exactMatch);

    // Strategy 2: Exact text match
    if (description.name) {
      const textMatch = findExactTextMatch(description.name, snapshot);
      if (textMatch && textMatch.confidence >= this.config.minConfidence) {
        return this.handleSuccess(originalSelector, textMatch, allCandidates, startTime);
      }
      if (textMatch) allCandidates.push(textMatch);
    }

    // Strategy 3: ID match
    if (description.attributes?.id) {
      const idMatch = findById(description.attributes.id, snapshot);
      if (idMatch && idMatch.confidence >= this.config.minConfidence) {
        return this.handleSuccess(originalSelector, idMatch, allCandidates, startTime);
      }
      if (idMatch) allCandidates.push(idMatch);
    }

    // Strategy 4: Class match
    if (description.attributes?.class) {
      const classNames = description.attributes.class.split(" ");
      for (const className of classNames) {
        const classMatch = findByClass(className, snapshot);
        if (classMatch && classMatch.confidence >= this.config.minConfidence) {
          return this.handleSuccess(originalSelector, classMatch, allCandidates, startTime);
        }
        if (classMatch) allCandidates.push(classMatch);
      }
    }

    // Strategy 5: Semantic matches
    const semanticMatches = findSemanticMatches(description, snapshot, this.config.maxCandidates);
    allCandidates.push(...semanticMatches);

    const bestSemantic = semanticMatches[0];
    if (bestSemantic && bestSemantic.confidence >= this.config.minConfidence) {
      return this.handleSuccess(originalSelector, bestSemantic, allCandidates, startTime);
    }

    // Strategy 6: Fuzzy matches
    if (description.name) {
      const fuzzyMatches = findFuzzyMatches(description.name, snapshot, this.config.minConfidence);
      allCandidates.push(...fuzzyMatches);

      const bestFuzzy = fuzzyMatches[0];
      if (bestFuzzy && bestFuzzy.confidence >= this.config.minConfidence) {
        return this.handleSuccess(originalSelector, bestFuzzy, allCandidates, startTime);
      }
    }

    // Strategy 7: Partial text matches
    if (description.name) {
      const partialMatches = findPartialMatches(description.name, snapshot);
      allCandidates.push(...partialMatches);

      const bestPartial = partialMatches[0];
      if (bestPartial && bestPartial.confidence >= this.config.minConfidence) {
        return this.handleSuccess(originalSelector, bestPartial, allCandidates, startTime);
      }
    }

    // Strategy 8: Anchor-based matching
    if (this.config.enableAnchors && options?.anchors && options.anchors.length > 0) {
      const anchorMatch = findByAnchor(description, options.anchors, snapshot);
      if (anchorMatch && anchorMatch.confidence >= this.config.minConfidence) {
        return this.handleSuccess(originalSelector, anchorMatch, allCandidates, startTime);
      }
      if (anchorMatch) allCandidates.push(anchorMatch);
    }

    // Strategy 9: LLM-based semantic matching (if enabled)
    if (this.config.useLLM && options?.llmProvider && description.name) {
      const llmMatch = await this.tryLLMHealing(description, snapshot, options.llmProvider);
      if (llmMatch && llmMatch.confidence >= this.config.minConfidence) {
        return this.handleSuccess(originalSelector, llmMatch, allCandidates, startTime);
      }
      if (llmMatch) allCandidates.push(llmMatch);
    }

    // No successful healing
    const elapsed = Date.now() - startTime;
    this.stats.failedHeals++;
    this.updateStats(elapsed);

    // Deduplicate candidates
    const uniqueCandidates = this.deduplicateCandidates(allCandidates);

    this.emitEvent({
      type: "healing_failed",
      originalSelector,
      elapsed,
      timestamp: Date.now(),
      error: "No matching element found with sufficient confidence",
    });

    return {
      success: false,
      allCandidates: uniqueCandidates.slice(0, this.config.maxCandidates),
      elapsed,
    };
  }

  /**
   * Handle successful healing
   */
  private handleSuccess(
    originalSelector: string,
    candidate: HealCandidate,
    allCandidates: HealCandidate[],
    startTime: number,
  ): HealingResult {
    const elapsed = Date.now() - startTime;
    this.stats.successfulHeals++;
    this.updateStrategyStats(candidate.strategy);
    this.updateStats(elapsed);

    this.emitEvent({
      type: "healing_succeeded",
      originalSelector,
      healedSelector: candidate.ref,
      strategy: candidate.strategy,
      confidence: candidate.confidence,
      elapsed,
      timestamp: Date.now(),
    });

    return {
      success: true,
      candidate,
      allCandidates: this.deduplicateCandidates(allCandidates).slice(0, this.config.maxCandidates),
      elapsed,
      method: candidate.strategy,
    };
  }

  /**
   * Try LLM-based healing
   */
  private async tryLLMHealing(
    description: ElementDescription,
    snapshot: PageSnapshot,
    llmProvider: { complete: (prompt: string) => Promise<string> },
  ): Promise<HealCandidate | undefined> {
    try {
      // Build prompt for LLM
      const elementList = snapshot.elements
        .slice(0, 50) // Limit to first 50 elements
        .map((e, i) => `${i}. [${e.role}] "${e.name}" (text: "${e.textContent?.slice(0, 50)}")`)
        .join("\n");

      const prompt = `Given this target element description:
Role: ${description.role}
Name: ${description.name}
Text: ${description.nearbyText ?? "N/A"}

And this list of available elements:
${elementList}

Which element index best matches the target? Reply with ONLY the index number, or -1 if none match.`;

      const response = await llmProvider.complete(prompt);
      const match = response.match(/(\d+)/);

      if (match) {
        const index = parseInt(match[1], 10);
        if (index >= 0 && index < snapshot.elements.length) {
          const element = snapshot.elements[index];
          return {
            ref: element.ref,
            role: element.role,
            name: element.name,
            tagName: element.tagName,
            confidence: 0.75, // LLM confidence
            strategy: "ai-semantic",
            attributes: element.attributes,
            textContent: element.textContent,
          };
        }
      }
    } catch {
      // LLM healing failed
    }

    return undefined;
  }

  /**
   * Execute recovery playbook
   */
  async executeRecovery(
    error: string | Error,
    context: Parameters<typeof executeRecovery>[1],
  ): Promise<{ success: boolean; actionTaken: string; recovered: boolean }> {
    const strategy = getRecoveryStrategy(error, defaultRecoveryPlaybook);

    if (!strategy) {
      return { success: false, actionTaken: "No recovery strategy found", recovered: false };
    }

    const result = await executeRecovery(strategy, context);

    return {
      ...result,
      recovered: result.success,
    };
  }

  /**
   * Deduplicate candidates by ref
   */
  private deduplicateCandidates(candidates: HealCandidate[]): HealCandidate[] {
    const seen = new Set<string>();
    return candidates.filter((c) => {
      if (seen.has(c.ref)) return false;
      seen.add(c.ref);
      return true;
    });
  }

  /**
   * Update strategy statistics
   */
  private updateStrategyStats(strategy: string): void {
    if (!this.stats.byStrategy[strategy]) {
      this.stats.byStrategy[strategy] = { attempts: 0, successes: 0 };
    }
    this.stats.byStrategy[strategy].attempts++;
    this.stats.byStrategy[strategy].successes++;
  }

  /**
   * Update overall statistics
   */
  private updateStats(elapsed: number): void {
    this.stats.successRate = this.stats.successfulHeals / this.stats.totalAttempts;

    // Update average healing time
    const totalTime = this.stats.avgHealingTime * (this.stats.totalAttempts - 1) + elapsed;
    this.stats.avgHealingTime = totalTime / this.stats.totalAttempts;
  }

  /**
   * Get healing statistics
   */
  getStats(): HealingStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalAttempts: 0,
      successfulHeals: 0,
      failedHeals: 0,
      successRate: 0,
      avgHealingTime: 0,
      byStrategy: {},
    };
  }

  /**
   * Add event listener
   */
  onEvent(listener: (event: HealingEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const index = this.eventListeners.indexOf(listener);
      if (index > -1) {
        this.eventListeners.splice(index, 1);
      }
    };
  }

  /**
   * Emit healing event
   */
  private emitEvent(event: HealingEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Extract anchors for an element
   */
  extractAnchors(targetRef: string, snapshot: PageSnapshot): ReturnType<typeof extractAnchors> {
    return extractAnchors(targetRef, snapshot);
  }
}

/** Create healing service instance */
export function createSelfHealingService(config?: Partial<HealingConfig>): SelfHealingService {
  return new SelfHealingService(config);
}

// Re-export types and strategies
export { findExactMatch, findSemanticMatches, findByAnchor, getRecoveryStrategy, executeRecovery };
