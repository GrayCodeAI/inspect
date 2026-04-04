import { Effect, Layer, ServiceMap, Option } from "effect";
import * as Error from "./errors.js";
import * as Types from "./types.js";

export interface SelectorHistoryEntry {
  readonly selector: string;
  readonly snapshots: Types.ElementSnapshot[];
  readonly healings: Types.HealedSelector[];
  lastUsed: number;
  successCount: number;
  failureCount: number;
}

export class SelfHealingService extends ServiceMap.Service<SelfHealingService>()(
  "@inspect/self-healing/SelfHealingService",
  {
    make: Effect.gen(function* () {
      const selectorHistory = new Map<string, SelectorHistoryEntry>();

      // Calculate similarity between two element snapshots (0-1)
      const calculateSimilarity = (
        original: Types.ElementSnapshot,
        candidate: Types.ElementSnapshot,
      ): number => {
        let score = 0;
        let factors = 0;

        // Tag name match (high weight)
        if (original.tagName === candidate.tagName) {
          score += 0.3;
        }
        factors += 0.3;

        // ID match (very high weight if both have IDs)
        if (original.id && candidate.id) {
          if (original.id === candidate.id) {
            score += 0.25;
          }
          factors += 0.25;
        }

        // Class names similarity (manual intersection/union)
        const originalClasses = new Set(original.classNames);
        const candidateClasses = new Set(candidate.classNames);
        let intersectionSize = 0;
        for (const cls of originalClasses) {
          if (candidateClasses.has(cls)) {
            intersectionSize++;
          }
        }
        const unionSize = originalClasses.size + candidateClasses.size - intersectionSize;
        if (unionSize > 0) {
          score += 0.2 * (intersectionSize / unionSize);
        }
        factors += 0.2;

        // Text content similarity
        if (original.textContent && candidate.textContent) {
          const textSim = textSimilarity(original.textContent, candidate.textContent);
          score += 0.15 * textSim;
        }
        factors += 0.15;

        // Attributes similarity
        const originalAttrs = Object.entries(original.attributes);
        const candidateAttrs = Object.entries(candidate.attributes);
        if (originalAttrs.length > 0 && candidateAttrs.length > 0) {
          let attrMatches = 0;
          for (const [key, value] of originalAttrs) {
            if (candidate.attributes[key] === value) {
              attrMatches++;
            }
          }
          score += 0.1 * (attrMatches / Math.max(originalAttrs.length, candidateAttrs.length));
        }
        factors += 0.1;

        // Normalize by factors present
        return factors > 0 ? score / factors : 0;
      };

      // Calculate text similarity using Levenshtein distance
      const textSimilarity = (a: string, b: string): number => {
        const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
        const maxLen = Math.max(a.length, b.length);
        return maxLen > 0 ? 1 - distance / maxLen : 1;
      };

      // Levenshtein distance algorithm
      const levenshteinDistance = (a: string, b: string): number => {
        const matrix: number[][] = [];
        for (let i = 0; i <= b.length; i++) {
          matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
          matrix[0][j] = j;
        }
        for (let i = 1; i <= b.length; i++) {
          for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
              matrix[i][j] = matrix[i - 1][j - 1];
            } else {
              matrix[i][j] = Math.min(
                matrix[i - 1][j - 1] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j] + 1,
              );
            }
          }
        }
        return matrix[b.length][a.length];
      };

      // Try to find element using healing strategies
      const tryFindElement = (
        originalSnapshot: Types.ElementSnapshot,
        pageElements: Types.ElementSnapshot[],
      ): Option.Option<{
        element: Types.ElementSnapshot;
        confidence: number;
        strategy: string;
      }> => {
        type Match = { element: Types.ElementSnapshot; confidence: number; strategy: string };
        let bestMatch: Match | null = null;

        for (const candidate of pageElements) {
          const confidence = calculateSimilarity(originalSnapshot, candidate);
          if (confidence >= 0.5 && (!bestMatch || confidence > bestMatch.confidence)) {
            bestMatch = { element: candidate, confidence, strategy: "similarity-score" };
          }
        }

        return bestMatch ? Option.some(bestMatch) : Option.none();
      };

      // Create snapshot from element data
      const createSnapshot = (elementData: {
        tagName: string;
        id?: string;
        classNames: string[];
        attributes: Record<string, string>;
        textContent?: string;
        xpath: string;
        cssSelector: string;
        boundingBox: { x: number; y: number; width: number; height: number };
      }): Types.ElementSnapshot => ({
        tagName: elementData.tagName,
        id: elementData.id,
        classNames: elementData.classNames,
        attributes: elementData.attributes,
        textContent: elementData.textContent,
        xpath: elementData.xpath,
        cssSelector: elementData.cssSelector,
        boundingBox: elementData.boundingBox,
      });

      // Register a selector with its snapshot
      const registerSelector = (selector: string, snapshot: Types.ElementSnapshot) =>
        Effect.gen(function* () {
          const history = selectorHistory.get(selector) ?? {
            selector,
            snapshots: [],
            healings: [],
            lastUsed: Date.now(),
            successCount: 0,
            failureCount: 0,
          };

          (history.snapshots as unknown[]).push(snapshot);
          if (history.snapshots.length > 10) {
            history.snapshots.shift();
          }
          history.lastUsed = Date.now();

          selectorHistory.set(selector, history);

          yield* Effect.logInfo("Selector registered for self-healing", { selector });

          return history;
        }).pipe(Effect.withSpan("SelfHealingService.registerSelector"));

      // Attempt to heal a broken selector
      const healSelector = (
        selector: string,
        currentPageElements: Types.ElementSnapshot[],
        options: Partial<Types.HealingOptions> = {},
      ) =>
        Effect.gen(function* () {
          const opts = { ...Types.defaultHealingOptions, ...options };

          yield* Effect.annotateCurrentSpan({ selector, strategies: opts.strategies });

          const history = selectorHistory.get(selector);
          if (!history || history.snapshots.length === 0) {
            return yield* new Error.SelectorNotFoundError({
              selector,
              url: "unknown",
            });
          }

          const lastSnapshot = history.snapshots[history.snapshots.length - 1];

          yield* Effect.logInfo("Attempting to heal selector", {
            selector,
            lastSnapshot: lastSnapshot.cssSelector,
          });

          // Try to find matching element
          const matchResult = tryFindElement(lastSnapshot, currentPageElements);

          if (Option.isNone(matchResult)) {
            history.failureCount++;
            return yield* new Error.HealingFailedError({
              originalSelector: selector,
              attempts: 1,
              cause: "No similar element found on page",
            });
          }

          const match = matchResult.value;

          if (match.confidence < opts.minConfidence) {
            history.failureCount++;
            return yield* new Error.HealingFailedError({
              originalSelector: selector,
              attempts: 1,
              cause: `Best match confidence (${match.confidence}) below threshold (${opts.minConfidence})`,
            });
          }

          // Create healed selector record
          const healedSelector: Types.HealedSelector = {
            originalSelector: selector,
            healedSelector: match.element.cssSelector,
            confidence: match.confidence,
            strategy: match.strategy,
            elementSnapshot: match.element,
            timestamp: Date.now(),
          };

          history.healings.push(healedSelector);
          history.successCount++;

          yield* Effect.logInfo("Selector healed successfully", {
            originalSelector: selector,
            healedSelector: healedSelector.healedSelector,
            confidence: healedSelector.confidence,
            strategy: healedSelector.strategy,
          });

          return healedSelector;
        }).pipe(Effect.withSpan("SelfHealingService.healSelector"));

      // Get healing history for a selector
      const getHistory = (selector: string) =>
        Effect.gen(function* () {
          const history = selectorHistory.get(selector);
          if (!history) {
            return yield* new Error.SelectorNotFoundError({ selector, url: "unknown" });
          }
          return history;
        }).pipe(Effect.withSpan("SelfHealingService.getHistory"));

      // Get all registered selectors
      const getAllSelectors = () => Effect.succeed(Array.from(selectorHistory.keys()));

      // Clear history for a selector
      const clearHistory = (selector: string) =>
        Effect.gen(function* () {
          selectorHistory.delete(selector);
          yield* Effect.logInfo("Selector history cleared", { selector });
        }).pipe(Effect.withSpan("SelfHealingService.clearHistory"));

      // Get healing statistics
      const getStatistics = () =>
        Effect.succeed({
          totalSelectors: selectorHistory.size,
          totalHealings: Array.from(selectorHistory.values()).reduce(
            (sum: number, h) => sum + h.healings.length,
            0,
          ),
          totalSuccesses: Array.from(selectorHistory.values()).reduce(
            (sum: number, h) => sum + h.successCount,
            0,
          ),
          totalFailures: Array.from(selectorHistory.values()).reduce(
            (sum: number, h) => sum + h.failureCount,
            0,
          ),
        });

      return {
        registerSelector,
        healSelector,
        getHistory,
        getAllSelectors,
        clearHistory,
        getStatistics,
        createSnapshot,
        calculateSimilarity,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
