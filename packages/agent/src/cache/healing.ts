// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Self-Healing Selector Recovery
// ──────────────────────────────────────────────────────────────────────────────

import type { LLMProvider, LLMMessage } from "../providers/base.js";
import type { ActionCache, CachedAction } from "./store.js";

/** Element description used for semantic matching */
export interface ElementDescription {
  role: string;
  name: string;
  tagName?: string;
  nearbyText?: string;
  attributes?: Record<string, string>;
}

/** A candidate match found during healing */
export interface HealCandidate {
  /** New element reference */
  ref: string;
  /** ARIA role */
  role: string;
  /** Accessible name */
  name: string;
  /** Tag name */
  tagName?: string;
  /** Match confidence (0-1) */
  confidence: number;
  /** How the match was found */
  method: "exact" | "semantic" | "fuzzy" | "vision";
}

/** Healing result */
export interface HealResult {
  /** Whether healing succeeded */
  success: boolean;
  /** The best candidate found */
  candidate?: HealCandidate;
  /** All candidates considered */
  allCandidates: HealCandidate[];
  /** Time taken in ms */
  elapsed: number;
  /** Method used to find the element */
  method?: string;
}

/** Snapshot element for matching */
export interface SnapshotElement {
  ref: string;
  role: string;
  name: string;
  tagName?: string;
  textContent?: string;
  attributes?: Record<string, string>;
  interactive?: boolean;
}

/**
 * Self-healer that recovers when cached selectors/refs break.
 *
 * Uses a cascade of matching strategies:
 * 1. Exact match (role + name)
 * 2. Semantic match (role + fuzzy name)
 * 3. Fuzzy text match (Levenshtein distance)
 * 4. Vision fallback (LLM-based element identification)
 */
export class SelfHealer {
  private cache: ActionCache;
  private llm?: LLMProvider;

  constructor(cache: ActionCache, llm?: LLMProvider) {
    this.cache = cache;
    this.llm = llm;
  }

  /**
   * Attempt to find the element described by `description` in the current
   * page snapshot. Uses progressively less strict matching strategies.
   */
  async healSelector(
    failedRef: string,
    description: ElementDescription,
    snapshot: SnapshotElement[],
    screenshotBase64?: string,
  ): Promise<HealResult> {
    const start = Date.now();
    const allCandidates: HealCandidate[] = [];

    // Strategy 1: Exact match (role + name)
    const exactMatch = this.findExactMatch(description, snapshot);
    if (exactMatch) {
      allCandidates.push(exactMatch);
      return {
        success: true,
        candidate: exactMatch,
        allCandidates,
        elapsed: Date.now() - start,
        method: "exact",
      };
    }

    // Strategy 2: Semantic match (same role, similar name)
    const semanticMatches = this.findSemanticMatches(description, snapshot);
    allCandidates.push(...semanticMatches);

    if (semanticMatches.length > 0 && semanticMatches[0].confidence > 0.8) {
      return {
        success: true,
        candidate: semanticMatches[0],
        allCandidates,
        elapsed: Date.now() - start,
        method: "semantic",
      };
    }

    // Strategy 3: Fuzzy text match
    const fuzzyMatches = this.findFuzzyMatches(description, snapshot);
    allCandidates.push(...fuzzyMatches);

    if (fuzzyMatches.length > 0 && fuzzyMatches[0].confidence > 0.7) {
      return {
        success: true,
        candidate: fuzzyMatches[0],
        allCandidates,
        elapsed: Date.now() - start,
        method: "fuzzy",
      };
    }

    // Strategy 4: Vision fallback (if LLM and screenshot available)
    if (this.llm && screenshotBase64) {
      const visionMatch = await this.findViaVision(description, screenshotBase64);
      if (visionMatch) {
        allCandidates.push(visionMatch);
        return {
          success: true,
          candidate: visionMatch,
          allCandidates,
          elapsed: Date.now() - start,
          method: "vision",
        };
      }
    }

    // Return best candidate even if confidence is low
    const bestCandidate = allCandidates.sort((a, b) => b.confidence - a.confidence)[0];

    return {
      success: bestCandidate ? bestCandidate.confidence > 0.5 : false,
      candidate: bestCandidate,
      allCandidates,
      elapsed: Date.now() - start,
      method: bestCandidate?.method,
    };
  }

  /**
   * Update the cache after a successful heal.
   */
  updateCache(cacheKey: string, newRef: string, newSelector?: string): boolean {
    return this.cache.heal(cacheKey, newSelector ?? newRef, newRef);
  }

  // ── Matching strategies ────────────────────────────────────────────────

  private findExactMatch(
    description: ElementDescription,
    snapshot: SnapshotElement[],
  ): HealCandidate | null {
    for (const element of snapshot) {
      if (
        element.role === description.role &&
        element.name === description.name
      ) {
        return {
          ref: element.ref,
          role: element.role,
          name: element.name,
          tagName: element.tagName,
          confidence: 1.0,
          method: "exact",
        };
      }
    }
    return null;
  }

  private findSemanticMatches(
    description: ElementDescription,
    snapshot: SnapshotElement[],
  ): HealCandidate[] {
    const candidates: HealCandidate[] = [];

    for (const element of snapshot) {
      let confidence = 0;

      // Role match
      if (element.role === description.role) {
        confidence += 0.4;
      } else if (this.areRolesRelated(element.role, description.role)) {
        confidence += 0.2;
      } else {
        continue; // Skip if roles don't match at all
      }

      // Name similarity
      const nameSim = this.stringSimilarity(
        element.name.toLowerCase(),
        description.name.toLowerCase(),
      );
      confidence += nameSim * 0.4;

      // Tag name match
      if (description.tagName && element.tagName === description.tagName) {
        confidence += 0.1;
      }

      // Nearby text match
      if (description.nearbyText && element.textContent) {
        const textSim = this.stringSimilarity(
          element.textContent.toLowerCase(),
          description.nearbyText.toLowerCase(),
        );
        confidence += textSim * 0.1;
      }

      if (confidence > 0.5) {
        candidates.push({
          ref: element.ref,
          role: element.role,
          name: element.name,
          tagName: element.tagName,
          confidence: Math.min(1, confidence),
          method: "semantic",
        });
      }
    }

    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  private findFuzzyMatches(
    description: ElementDescription,
    snapshot: SnapshotElement[],
  ): HealCandidate[] {
    const candidates: HealCandidate[] = [];
    const targetText = `${description.role} ${description.name}`.toLowerCase();

    for (const element of snapshot) {
      const elementText = `${element.role} ${element.name}`.toLowerCase();
      const distance = this.levenshteinDistance(targetText, elementText);
      const maxLen = Math.max(targetText.length, elementText.length);
      const similarity = maxLen > 0 ? 1 - distance / maxLen : 0;

      if (similarity > 0.6) {
        candidates.push({
          ref: element.ref,
          role: element.role,
          name: element.name,
          tagName: element.tagName,
          confidence: similarity * 0.9, // Slightly discount fuzzy matches
          method: "fuzzy",
        });
      }
    }

    return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  private async findViaVision(
    description: ElementDescription,
    screenshotBase64: string,
  ): Promise<HealCandidate | null> {
    if (!this.llm?.supportsVision()) return null;

    const messages: LLMMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `I'm looking for a UI element with the following description:
- Role: ${description.role}
- Name: ${description.name}
${description.tagName ? `- Tag: ${description.tagName}` : ""}
${description.nearbyText ? `- Nearby text: ${description.nearbyText}` : ""}

Look at the screenshot and identify this element. Return a JSON object with:
- "found": true/false
- "ref": the element's reference ID if visible (e.g., "e15")
- "confidence": 0-1 how sure you are
- "description": brief description of what you see

Return ONLY the JSON object, nothing else.`,
          },
          {
            type: "image_base64",
            media_type: "image/png",
            data: screenshotBase64,
          },
        ],
      },
    ];

    try {
      const response = await this.llm.chat(messages, undefined, {
        maxTokens: 200,
        temperature: 0,
        responseFormat: "json",
      });

      const result = JSON.parse(response.content) as {
        found: boolean;
        ref?: string;
        confidence?: number;
        description?: string;
      };

      if (result.found && result.ref) {
        return {
          ref: result.ref,
          role: description.role,
          name: description.name,
          confidence: result.confidence ?? 0.6,
          method: "vision",
        };
      }
    } catch {
      // Vision fallback failed
    }

    return null;
  }

  // ── String matching utilities ─────────────────────────────────────────

  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Check containment
    if (a.includes(b) || b.includes(a)) {
      return Math.min(a.length, b.length) / Math.max(a.length, b.length);
    }

    // Jaccard similarity on words
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }

    return dp[m][n];
  }

  private areRolesRelated(roleA: string, roleB: string): boolean {
    const relatedGroups = [
      ["button", "link", "menuitem"],
      ["textbox", "searchbox", "combobox", "spinbutton"],
      ["checkbox", "switch", "radio"],
      ["heading", "banner", "contentinfo"],
      ["list", "listbox", "menu", "tree"],
      ["listitem", "menuitem", "treeitem", "option"],
      ["tab", "tabpanel"],
      ["dialog", "alertdialog"],
      ["img", "figure"],
    ];

    for (const group of relatedGroups) {
      if (group.includes(roleA) && group.includes(roleB)) {
        return true;
      }
    }

    return false;
  }
}
