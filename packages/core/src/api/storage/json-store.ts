// ============================================================================
// @inspect/api - JSON File-Based Persistent Store
// ============================================================================

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  renameSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { createLogger } from "@inspect/core";

const logger = createLogger("api/json-store");

/**
 * Generic JSON file-based persistent store.
 *
 * Data is kept in a Map for fast lookups and synced to a JSON file on every
 * write. On startup, existing data is loaded from disk.
 *
 * Suitable for moderate scale (hundreds to low thousands of records).
 * For high-volume production use, replace with SQLite or PostgreSQL.
 */
export class JsonStore<T extends { id: string }> {
  private filePath: string;
  private data: Map<string, T> = new Map();
  private writeQueued = false;

  constructor(dataDir: string, collection: string) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, `${collection}.json`);
    this.load();
  }

  get(id: string): T | undefined {
    return this.data.get(id);
  }

  set(id: string, item: T): void {
    this.data.set(id, item);
    this.scheduleSave();
  }

  delete(id: string): boolean {
    const existed = this.data.delete(id);
    if (existed) this.scheduleSave();
    return existed;
  }

  has(id: string): boolean {
    return this.data.has(id);
  }

  list(): T[] {
    return Array.from(this.data.values());
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.list().filter(predicate);
  }

  get size(): number {
    return this.data.size;
  }

  /** Force an immediate save to disk */
  flush(): void {
    this.save();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private load(): void {
    if (!existsSync(this.filePath)) return;

    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const items: T[] = JSON.parse(raw);
      for (const item of items) {
        this.data.set(item.id, item);
      }
    } catch (_err) {
      // If the file is corrupted, start fresh but preserve the bad file
      const backupPath = this.filePath + ".corrupt." + Date.now();
      try {
        copyFileSync(this.filePath, backupPath);
      } catch (backupError) {
        logger.debug("Failed to backup corrupt store file", { backupError });
      }
      logger.warn("Failed to load store, starting fresh", {
        filePath: this.filePath,
        backupPath,
      });
    }
  }

  /**
   * Batch writes within the same tick to avoid excessive I/O
   * when multiple set() calls happen in quick succession.
   */
  private scheduleSave(): void {
    if (this.writeQueued) return;
    this.writeQueued = true;
    queueMicrotask(() => {
      this.save();
      this.writeQueued = false;
    });
  }

  private save(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const json = JSON.stringify(Array.from(this.data.values()), null, 2);

      // Atomic write: write to tmp file then rename
      const tmpPath = this.filePath + ".tmp";
      writeFileSync(tmpPath, json, "utf-8");
      renameSync(tmpPath, this.filePath);
    } catch (err) {
      logger.error("Failed to save store", { filePath: this.filePath, error: err });
    }
  }
}
