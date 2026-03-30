// ──────────────────────────────────────────────────────────────────────────────
// @inspect/core - DOM Differ
//
// Detects DOM changes between snapshots for self-healing selector resolution.
// ──────────────────────────────────────────────────────────────────────────────

export interface DOMChange {
  type: "added" | "removed" | "moved" | "modified";
  selector: string;
  element?: string;
  details?: string;
}

export interface DOMDiffResult {
  changes: DOMChange[];
  hasBreakingChanges: boolean;
  brokenSelectors: string[];
}

/**
 * Differ compares two DOM snapshots and identifies changes that may
 * break existing selectors.
 */
export class DOMDiffer {
  /**
   * Compare two simplified DOM representations.
   * Returns changes that could break selectors.
   */
  diff(previous: string, current: string): DOMDiffResult {
    const changes: DOMChange[] = [];
    const brokenSelectors: string[] = [];

    // Parse element references from snapshot format [ref] role "name"
    const prevElements = this.parseSnapshot(previous);
    const currElements = this.parseSnapshot(current);

    const prevMap = new Map(prevElements.map((e) => [e.ref, e]));
    const currMap = new Map(currElements.map((e) => [e.ref, e]));

    // Find removed elements
    for (const [ref, el] of prevMap) {
      if (!currMap.has(ref)) {
        changes.push({
          type: "removed",
          selector: `[ref="${ref}"]`,
          element: `${el.role} "${el.name}"`,
          details: "Element no longer present in DOM",
        });
        brokenSelectors.push(`[ref="${ref}"]`);
      }
    }

    // Find added elements
    for (const [ref, el] of currMap) {
      if (!prevMap.has(ref)) {
        changes.push({
          type: "added",
          selector: `[ref="${ref}"]`,
          element: `${el.role} "${el.name}"`,
          details: "New element in DOM",
        });
      }
    }

    // Find modified elements (same ref, different attributes)
    for (const [ref, prevEl] of prevMap) {
      const currEl = currMap.get(ref);
      if (currEl && (prevEl.name !== currEl.name || prevEl.role !== currEl.role)) {
        changes.push({
          type: "modified",
          selector: `[ref="${ref}"]`,
          element: `${prevEl.role} "${prevEl.name}" -> ${currEl.role} "${currEl.name}"`,
          details: "Element attributes changed",
        });
        brokenSelectors.push(`[ref="${ref}"]`);
      }
    }

    return {
      changes,
      hasBreakingChanges: brokenSelectors.length > 0,
      brokenSelectors,
    };
  }

  private parseSnapshot(snapshot: string): Array<{ ref: string; role: string; name: string }> {
    const elements: Array<{ ref: string; role: string; name: string }> = [];
    const pattern = /\[([eE]\d+)\]\s+(\w+)\s+"([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(snapshot)) !== null) {
      elements.push({ ref: match[1], role: match[2], name: match[3] });
    }
    return elements;
  }
}
