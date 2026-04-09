// ──────────────────────────────────────────────────────────────────────────────
// Strategy: Exact Match
// Tries to find exact role + name match
// ──────────────────────────────────────────────────────────────────────────────

import type { ElementDescription, HealCandidate, PageSnapshot } from "../types.js";

/**
 * Find exact match by role and name
 */
export function findExactMatch(
  description: ElementDescription,
  snapshot: PageSnapshot,
): HealCandidate | undefined {
  // Normalize for comparison
  const normalizedRole = description.role.toLowerCase().trim();
  const normalizedName = description.name.toLowerCase().trim();

  for (const element of snapshot.elements) {
    const elementRole = element.role.toLowerCase().trim();
    const elementName = element.name.toLowerCase().trim();

    // Exact match
    if (elementRole === normalizedRole && elementName === normalizedName) {
      return {
        ref: element.ref,
        role: element.role,
        name: element.name,
        tagName: element.tagName,
        confidence: 1.0,
        strategy: "text-content",
        attributes: element.attributes,
        textContent: element.textContent,
      };
    }
  }

  return undefined;
}

/**
 * Find match by exact text content
 */
export function findExactTextMatch(
  text: string,
  snapshot: PageSnapshot,
): HealCandidate | undefined {
  const normalizedText = text.toLowerCase().trim();

  for (const element of snapshot.elements) {
    const elementText = (element.textContent ?? "").toLowerCase().trim();

    if (elementText === normalizedText) {
      return {
        ref: element.ref,
        role: element.role,
        name: element.name,
        tagName: element.tagName,
        confidence: 0.95,
        strategy: "text-content",
        textContent: element.textContent,
      };
    }
  }

  return undefined;
}

/**
 * Find match by ID
 */
export function findById(id: string, snapshot: PageSnapshot): HealCandidate | undefined {
  for (const element of snapshot.elements) {
    if (element.attributes?.id === id) {
      return {
        ref: element.ref,
        role: element.role,
        name: element.name,
        tagName: element.tagName,
        confidence: 0.98,
        strategy: "attributes",
        attributes: element.attributes,
      };
    }
  }
  return undefined;
}

/**
 * Find match by CSS class
 */
export function findByClass(className: string, snapshot: PageSnapshot): HealCandidate | undefined {
  for (const element of snapshot.elements) {
    const classAttr = element.attributes?.class ?? "";
    if (classAttr.split(" ").includes(className)) {
      return {
        ref: element.ref,
        role: element.role,
        name: element.name,
        tagName: element.tagName,
        confidence: 0.85,
        strategy: "attributes",
        attributes: element.attributes,
      };
    }
  }
  return undefined;
}
