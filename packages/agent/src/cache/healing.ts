// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Self-Healing Selector Recovery
// ──────────────────────────────────────────────────────────────────────────────

import type { LLMProvider, LLMMessage } from "../providers/base.js";
import type { ActionCache, CachedAction } from "./action-cache.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/cache-healing");

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
  method: "exact" | "semantic" | "fuzzy" | "vision" | "css-similar" | "neighbor-anchor";
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

    // Strategy 5: CSS selector similarity (match by attribute patterns)
    const cssMatches = this.findByCssSimilarity(description, snapshot);
    allCandidates.push(...cssMatches);
    if (cssMatches.length > 0 && cssMatches[0].confidence > 0.6) {
      return {
        success: true,
        candidate: cssMatches[0],
        allCandidates,
        elapsed: Date.now() - start,
        method: "css-similar",
      };
    }

    // Strategy 6: Neighbor anchor (locate via nearby stable element)
    const neighborMatch = this.findByNeighborAnchor(description, snapshot);
    if (neighborMatch) {
      allCandidates.push(neighborMatch);
      return {
        success: true,
        candidate: neighborMatch,
        allCandidates,
        elapsed: Date.now() - start,
        method: "neighbor-anchor",
      };
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
  async updateCache(cacheKey: string, newRef: string, newSelector?: string): Promise<boolean> {
    return this.cache.heal(cacheKey, newSelector ?? newRef, newRef);
  }

  // ── Matching strategies ────────────────────────────────────────────────

  private findExactMatch(
    description: ElementDescription,
    snapshot: SnapshotElement[],
  ): HealCandidate | null {
    for (const element of snapshot) {
      if (element.role === description.role && element.name === description.name) {
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
    } catch (error) {
      logger.warn("Vision-based healing failed", {
        err: error instanceof Error ? error.message : String(error),
      });
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

    // Use two rolling arrays instead of full matrix: O(min(m,n)) space
    const shorter = m <= n ? a : b;
    const longer = m <= n ? b : a;
    const sLen = shorter.length;
    const lLen = longer.length;

    let prev = Array.from({ length: sLen + 1 }, (_, i) => i);
    let curr = new Array<number>(sLen + 1);

    for (let j = 1; j <= lLen; j++) {
      curr[0] = j;
      for (let i = 1; i <= sLen; i++) {
        const cost = shorter[i - 1] === longer[j - 1] ? 0 : 1;
        curr[i] = Math.min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + cost);
      }
      [prev, curr] = [curr, prev];
    }

    return prev[sLen];
  }

  /** Static role relationship map for O(1) lookups */
  private static readonly RELATED_ROLES = (() => {
    const map = new Map<string, Set<string>>();
    const groups = [
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
    for (const group of groups) {
      const set = new Set(group);
      for (const role of group) {
        map.set(role, set);
      }
    }
    return map;
  })();

  private areRolesRelated(roleA: string, roleB: string): boolean {
    const group = SelfHealer.RELATED_ROLES.get(roleA);
    return group ? group.has(roleB) : false;
  }

  /**
   * Strategy 5: CSS selector similarity — match by attribute patterns.
   * Looks for elements with similar id, name, class, or data-* attributes.
   */
  private findByCssSimilarity(
    description: ElementDescription,
    snapshot: SnapshotElement[],
  ): HealCandidate[] {
    const candidates: HealCandidate[] = [];
    const descAttrs = description.attributes ?? {};

    for (const element of snapshot) {
      if (!element.interactive) continue;

      const elemAttrs = element.attributes ?? {};
      let confidence = 0;

      // Check id similarity
      if (descAttrs.id && elemAttrs.id) {
        if (descAttrs.id === elemAttrs.id) {
          confidence += 0.6;
        } else if (this.stringSimilarity(descAttrs.id, elemAttrs.id) > 0.7) {
          confidence += 0.4;
        }
      }

      // Check name attribute
      if (descAttrs.name && elemAttrs.name) {
        if (descAttrs.name === elemAttrs.name) {
          confidence += 0.5;
        } else if (this.stringSimilarity(descAttrs.name, elemAttrs.name) > 0.7) {
          confidence += 0.3;
        }
      }

      // Check class overlap
      if (descAttrs.class && elemAttrs.class) {
        const descClasses = new Set(descAttrs.class.split(/\s+/));
        const elemClasses = new Set(elemAttrs.class.split(/\s+/));
        const overlap = [...descClasses].filter((c) => elemClasses.has(c)).length;
        const total = new Set([...descClasses, ...elemClasses]).size;
        confidence += (total > 0 ? overlap / total : 0) * 0.3;
      }

      // Check data-* attributes
      for (const [key, val] of Object.entries(descAttrs)) {
        if (key.startsWith("data-") && elemAttrs[key] === val) {
          confidence += 0.2;
        }
      }

      // Role match bonus
      if (element.role === description.role) {
        confidence += 0.2;
      }

      if (confidence > 0.3) {
        candidates.push({
          ref: element.ref,
          role: element.role,
          name: element.name,
          tagName: element.tagName,
          confidence: Math.min(confidence, 1.0),
          method: "css-similar",
        });
      }
    }

    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Strategy 6: Neighbor anchor — locate via nearby stable element.
   * If the target element is near a well-known anchor (heading, landmark),
   * use that anchor's position to find the target.
   */
  private findByNeighborAnchor(
    description: ElementDescription,
    snapshot: SnapshotElement[],
  ): HealCandidate | null {
    // Look for elements near headings or landmarks that match the description
    const anchors = snapshot.filter(
      (el) => el.role === "heading" || el.role === "banner" || el.role === "navigation",
    );

    for (const element of snapshot) {
      if (element.role !== description.role) continue;

      // Check if this element is near any anchor
      for (const anchor of anchors) {
        if (
          anchor.textContent &&
          description.nearbyText &&
          this.stringSimilarity(anchor.textContent, description.nearbyText) > 0.6
        ) {
          return {
            ref: element.ref,
            role: element.role,
            name: element.name,
            tagName: element.tagName,
            confidence: 0.65,
            method: "neighbor-anchor",
          };
        }
      }
    }

    return null;
  }
}
