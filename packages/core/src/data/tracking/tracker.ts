// ──────────────────────────────────────────────────────────────────────────────
// @inspect/data - Change Tracker
// ──────────────────────────────────────────────────────────────────────────────

import type { ChangeSnapshot, ChangeDiff, ChangeTrackingConfig } from "@inspect/core";
import { createLogger } from "@inspect/core";

const logger = createLogger("data/tracker");

/**
 * Creates content snapshots for change detection.
 */
export class Snapshotter {
  /**
   * Create a snapshot from page content.
   */
  static create(url: string, content: string, metadata?: Record<string, unknown>): ChangeSnapshot {
    const textContent = Snapshotter.extractText(content);
    const hash = Snapshotter.hash(textContent);

    return {
      id: generateId(),
      url,
      content,
      textContent,
      hash,
      timestamp: Date.now(),
      metadata,
    };
  }

  /**
   * Extract readable text from HTML.
   */
  static extractText(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Hash content for comparison.
   */
  static hash(content: string): string {
    let h = 0;
    for (let i = 0; i < content.length; i++) {
      h = ((h << 5) - h + content.charCodeAt(i)) | 0;
    }
    return h.toString(16);
  }
}

/**
 * Compares two snapshots and produces a diff.
 */
export class Differ {
  /**
   * Compare two snapshots and return the diff.
   */
  static diff(previous: ChangeSnapshot, current: ChangeSnapshot): ChangeDiff {
    const prevLines = previous.textContent.split("\n").filter((l) => l.trim());
    const currLines = current.textContent.split("\n").filter((l) => l.trim());

    const prevSet = new Set(prevLines);
    const currSet = new Set(currLines);

    const added = currLines.filter((l) => !prevSet.has(l));
    const removed = prevLines.filter((l) => !currSet.has(l));

    // Calculate similarity using Jaccard index
    const intersection = new Set([...prevSet].filter((l) => currSet.has(l)));
    const union = new Set([...prevSet, ...currSet]);
    const similarity = union.size > 0 ? intersection.size / union.size : 1;

    const modified = added.filter((line) =>
      removed.some((r) => Differ.stringSimilarity(r, line) > 0.5),
    );

    return {
      url: current.url,
      previousSnapshotId: previous.id,
      currentSnapshotId: current.id,
      added,
      removed,
      modified,
      similarity,
      timestamp: current.timestamp,
    };
  }

  /**
   * Compare JSON structures.
   */
  static diffJson(prev: unknown, curr: unknown, path: string = ""): string[] {
    const changes: string[] = [];

    if (typeof prev !== typeof curr) {
      changes.push(`${path}: type changed from ${typeof prev} to ${typeof curr}`);
      return changes;
    }

    if (prev === null || curr === null || typeof prev !== "object") {
      if (prev !== curr) {
        changes.push(`${path}: "${prev}" -> "${curr}"`);
      }
      return changes;
    }

    const prevObj = prev as Record<string, unknown>;
    const currObj = curr as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(prevObj), ...Object.keys(currObj)]);

    for (const key of allKeys) {
      const newPath = path ? `${path}.${key}` : key;
      if (!(key in prevObj)) {
        changes.push(`${newPath}: added`);
      } else if (!(key in currObj)) {
        changes.push(`${newPath}: removed`);
      } else {
        changes.push(...Differ.diffJson(prevObj[key], currObj[key], newPath));
      }
    }

    return changes;
  }

  private static stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

/**
 * Track changes across multiple pages over time.
 */
export class ChangeTracker {
  private config: ChangeTrackingConfig;
  private snapshots: Map<string, ChangeSnapshot[]> = new Map();
  private diffs: Map<string, ChangeDiff[]> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config: ChangeTrackingConfig) {
    this.config = config;
  }

  /**
   * Take a snapshot of a URL's current content.
   */
  async snapshot(url: string): Promise<ChangeSnapshot> {
    const response = await fetch(url, {
      headers: { "User-Agent": "InspectBot/1.0" },
    });
    const content = await response.text();
    const snap = Snapshotter.create(url, content);

    const history = this.snapshots.get(url) ?? [];
    history.push(snap);
    this.snapshots.set(url, history);

    // Compute diff if there's a previous snapshot
    if (history.length > 1) {
      const prev = history[history.length - 2];
      const diff = Differ.diff(prev, snap);

      const diffs = this.diffs.get(url) ?? [];
      diffs.push(diff);
      this.diffs.set(url, diffs);

      if (this.config.onDiff) {
        await this.config.onDiff(diff);
      }
    }

    return snap;
  }

  /**
   * Take snapshots of all configured URLs.
   */
  async snapshotAll(): Promise<Map<string, ChangeSnapshot>> {
    const results = new Map<string, ChangeSnapshot>();
    for (const url of this.config.urls) {
      try {
        const snap = await this.snapshot(url);
        results.set(url, snap);
      } catch (error) {
        logger.error("Failed to snapshot URL", { url, error });
      }
    }
    return results;
  }

  /**
   * Start scheduled change monitoring.
   */
  startMonitoring(): void {
    if (this.intervalId) return;
    const interval = this.config.interval ?? 60_000;

    this.intervalId = setInterval(async () => {
      await this.snapshotAll();
    }, interval);
  }

  /**
   * Stop scheduled monitoring.
   */
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get all diffs for a URL.
   */
  getDiffs(url: string): ChangeDiff[] {
    return this.diffs.get(url) ?? [];
  }

  /**
   * Get the latest snapshot for a URL.
   */
  getLatestSnapshot(url: string): ChangeSnapshot | undefined {
    const history = this.snapshots.get(url);
    return history ? history[history.length - 1] : undefined;
  }

  /**
   * Get snapshot history for a URL.
   */
  getHistory(url: string): ChangeSnapshot[] {
    return this.snapshots.get(url) ?? [];
  }

  /**
   * Export all data as JSON.
   */
  export(): string {
    return JSON.stringify(
      {
        snapshots: Object.fromEntries(this.snapshots),
        diffs: Object.fromEntries(this.diffs),
      },
      null,
      2,
    );
  }
}

function generateId(): string {
  return `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
