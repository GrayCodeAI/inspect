// ──────────────────────────────────────────────────────────────────────────────
// Strategy: Semantic Match
// Matches by role and semantic similarity of names
// ──────────────────────────────────────────────────────────────────────────────

import type { ElementDescription, HealCandidate, PageSnapshot } from "../types.js";

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
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
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1), // insertion, deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate string similarity (0-1)
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);

  return 1 - distance / maxLength;
}

/**
 * Calculate token-based Jaccard similarity
 */
function calculateTokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/));
  const tokensB = new Set(b.toLowerCase().split(/\s+/));

  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

/**
 * Find semantic matches by role and name similarity
 */
export function findSemanticMatches(
  description: ElementDescription,
  snapshot: PageSnapshot,
  maxResults = 3,
): HealCandidate[] {
  const candidates: HealCandidate[] = [];
  const normalizedRole = description.role.toLowerCase().trim();

  for (const element of snapshot.elements) {
    const elementRole = element.role.toLowerCase().trim();

    // Same role required
    if (elementRole !== normalizedRole) continue;

    // Calculate name similarity
    const nameSimilarity = calculateSimilarity(description.name, element.name);
    const tokenSimilarity = calculateTokenSimilarity(description.name, element.name);

    // Combined similarity (weighted)
    const combinedScore = nameSimilarity * 0.6 + tokenSimilarity * 0.4;

    if (combinedScore >= 0.5) {
      candidates.push({
        ref: element.ref,
        role: element.role,
        name: element.name,
        tagName: element.tagName,
        confidence: combinedScore,
        strategy: "ai-semantic",
        attributes: element.attributes,
        textContent: element.textContent,
      });
    }
  }

  // Sort by confidence
  candidates.sort((a, b) => b.confidence - a.confidence);

  return candidates.slice(0, maxResults);
}

/**
 * Find fuzzy text matches
 */
export function findFuzzyMatches(
  text: string,
  snapshot: PageSnapshot,
  threshold = 0.6,
): HealCandidate[] {
  const candidates: HealCandidate[] = [];

  for (const element of snapshot.elements) {
    const elementText = element.textContent ?? "";

    const similarity = calculateSimilarity(text, elementText);

    if (similarity >= threshold) {
      candidates.push({
        ref: element.ref,
        role: element.role,
        name: element.name,
        tagName: element.tagName,
        confidence: similarity,
        strategy: "text-content",
        textContent: element.textContent,
      });
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}

/**
 * Find matches by partial text
 */
export function findPartialMatches(text: string, snapshot: PageSnapshot): HealCandidate[] {
  const candidates: HealCandidate[] = [];
  const normalizedText = text.toLowerCase();

  for (const element of snapshot.elements) {
    const elementText = (element.textContent ?? "").toLowerCase();
    const elementName = element.name.toLowerCase();

    // Check if element contains the text
    if (elementText.includes(normalizedText) || elementName.includes(normalizedText)) {
      // Calculate how much of the text is matched
      const matchRatio =
        normalizedText.length / Math.max(elementText.length, normalizedText.length);
      const confidence = 0.5 + matchRatio * 0.3;

      candidates.push({
        ref: element.ref,
        role: element.role,
        name: element.name,
        tagName: element.tagName,
        confidence: Math.min(confidence, 0.8),
        strategy: "text-content",
        textContent: element.textContent,
      });
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}
