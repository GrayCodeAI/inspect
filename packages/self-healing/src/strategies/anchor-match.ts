// ──────────────────────────────────────────────────────────────────────────────
// Strategy: Anchor-Based Match
// Uses stable surrounding elements as anchors to find target
// ──────────────────────────────────────────────────────────────────────────────

import type { ElementDescription, HealCandidate, PageSnapshot } from "../types.js";

interface AnchorElement {
  ref: string;
  role: string;
  name: string;
  textContent?: string;
  distance: number; // Distance from target
  direction: "before" | "after" | "parent" | "child";
}

/**
 * Find element using anchor-based positioning
 */
export function findByAnchor(
  targetDescription: ElementDescription,
  anchors: AnchorElement[],
  snapshot: PageSnapshot,
): HealCandidate | undefined {
  // Get anchor elements from current snapshot
  const currentAnchors: Array<{ element: PageSnapshot["elements"][0]; anchor: AnchorElement }> = [];

  for (const anchor of anchors) {
    // Try to find matching anchor in current snapshot
    for (const element of snapshot.elements) {
      const isMatch =
        element.role === anchor.role &&
        (element.name === anchor.name || element.textContent?.includes(anchor.textContent ?? ""));

      if (isMatch) {
        currentAnchors.push({ element, anchor });
        break;
      }
    }
  }

  if (currentAnchors.length === 0) return undefined;

  // Use the most reliable anchor (highest confidence)
  const bestAnchor = currentAnchors[0];

  // Find element relative to anchor
  const targetElement = findRelativeToAnchor(
    bestAnchor.element,
    bestAnchor.anchor,
    targetDescription,
    snapshot,
  );

  if (targetElement) {
    return {
      ref: targetElement.ref,
      role: targetElement.role,
      name: targetElement.name,
      tagName: targetElement.tagName,
      confidence: 0.75 * (currentAnchors.length / anchors.length), // Confidence based on anchor match ratio
      strategy: "visual-position",
      distance: bestAnchor.anchor.distance,
      attributes: targetElement.attributes,
      textContent: targetElement.textContent,
    };
  }

  return undefined;
}

/**
 * Find element relative to an anchor
 */
function findRelativeToAnchor(
  anchorElement: PageSnapshot["elements"][0],
  originalAnchor: AnchorElement,
  targetDescription: ElementDescription,
  snapshot: PageSnapshot,
): PageSnapshot["elements"][0] | undefined {
  // Get anchor's position in element list
  const anchorIndex = snapshot.elements.findIndex((e) => e.ref === anchorElement.ref);
  if (anchorIndex === -1) return undefined;

  switch (originalAnchor.direction) {
    case "before": {
      // Target was before anchor, look in preceding elements
      const startIdx = Math.max(0, anchorIndex - originalAnchor.distance - 2);
      const candidates = snapshot.elements.slice(startIdx, anchorIndex);

      for (const element of candidates.reverse()) {
        if (matchesDescription(element, targetDescription)) {
          return element;
        }
      }
      break;
    }

    case "after": {
      // Target was after anchor, look in following elements
      const endIdx = Math.min(snapshot.elements.length, anchorIndex + originalAnchor.distance + 3);
      const candidates = snapshot.elements.slice(anchorIndex + 1, endIdx);

      for (const element of candidates) {
        if (matchesDescription(element, targetDescription)) {
          return element;
        }
      }
      break;
    }

    case "parent": {
      // Target was parent of anchor
      if (anchorElement.parentRef) {
        const parent = snapshot.elements.find((e) => e.ref === anchorElement.parentRef);
        if (parent && matchesDescription(parent, targetDescription)) {
          return parent;
        }
      }
      break;
    }

    case "child": {
      // Target was child of anchor
      // Find elements that have anchor as parent
      const children = snapshot.elements.filter((e) => e.parentRef === anchorElement.ref);

      // Get by index
      const childIdx = originalAnchor.distance;
      if (childIdx < children.length) {
        const child = children[childIdx];
        if (matchesDescription(child, targetDescription)) {
          return child;
        }
      }
      break;
    }
  }

  return undefined;
}

/**
 * Check if element matches description
 */
function matchesDescription(
  element: PageSnapshot["elements"][0],
  description: ElementDescription,
): boolean {
  // Match by role
  if (description.role && element.role !== description.role) {
    return false;
  }

  // Match by name (fuzzy)
  if (description.name) {
    const nameSimilarity = calculateNameSimilarity(description.name, element.name);
    if (nameSimilarity < 0.6) {
      return false;
    }
  }

  // Match by tag
  if (description.tagName && element.tagName !== description.tagName) {
    return false;
  }

  return true;
}

/**
 * Calculate name similarity
 */
function calculateNameSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;

  const normalizedA = a.toLowerCase().trim();
  const normalizedB = b.toLowerCase().trim();

  if (normalizedA === normalizedB) return 1.0;

  // Check if one contains the other
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return 0.8;
  }

  // Token-based similarity
  const tokensA = new Set(normalizedA.split(/\s+/));
  const tokensB = new Set(normalizedB.split(/\s+/));
  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

/**
 * Extract anchors from a snapshot around a target element
 */
export function extractAnchors(
  targetRef: string,
  snapshot: PageSnapshot,
  count = 3,
): AnchorElement[] {
  const targetIndex = snapshot.elements.findIndex((e) => e.ref === targetRef);
  if (targetIndex === -1) return [];

  const target = snapshot.elements[targetIndex];
  const anchors: AnchorElement[] = [];

  // Previous sibling
  for (let i = 1; i <= count && targetIndex - i >= 0; i++) {
    const element = snapshot.elements[targetIndex - i];
    if (element.role && element.name) {
      anchors.push({
        ref: element.ref,
        role: element.role,
        name: element.name,
        textContent: element.textContent,
        distance: i,
        direction: "before",
      });
    }
  }

  // Next sibling
  for (let i = 1; i <= count && targetIndex + i < snapshot.elements.length; i++) {
    const element = snapshot.elements[targetIndex + i];
    if (element.role && element.name) {
      anchors.push({
        ref: element.ref,
        role: element.role,
        name: element.name,
        textContent: element.textContent,
        distance: i,
        direction: "after",
      });
    }
  }

  // Parent
  if (target.parentRef) {
    const parent = snapshot.elements.find((e) => e.ref === target.parentRef);
    if (parent) {
      anchors.push({
        ref: parent.ref,
        role: parent.role,
        name: parent.name,
        textContent: parent.textContent,
        distance: 1,
        direction: "parent",
      });
    }
  }

  return anchors.slice(0, count);
}
