// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Long-Term Memory
// ──────────────────────────────────────────────────────────────────────────────

import { mkdir, readFile, writeFile, readdir, access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/long-term-memory");

/** A learned pattern from past agent actions */
export interface LearnedPattern {
  /** What action was attempted */
  action: string;
  /** What the result was */
  result: "success" | "failure";
  /** Context when this happened (URL, page state, etc.) */
  context: string;
  /** Number of times this pattern has been observed */
  occurrences: number;
  /** When first observed */
  firstSeen: number;
  /** When last observed */
  lastSeen: number;
  /** Confidence score (0-1) based on consistency */
  confidence: number;
}

/** A stored memory entry */
export interface MemoryEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
}

/**
 * Long-term memory that persists between test runs.
 * Stores learned patterns, selector mappings, and other
 * knowledge in .inspect/memory/.
 */
export class LongTermMemory {
  private readonly memoryDir: string;
  private readonly patternsFile: string;
  private patterns: Map<string, LearnedPattern> = new Map();
  private cache: Map<string, MemoryEntry> = new Map();

  constructor(projectRoot: string) {
    this.memoryDir = join(projectRoot, ".inspect", "memory");
    this.patternsFile = join(this.memoryDir, "patterns.json");
  }

  /**
   * Initialize the memory directory and load persisted patterns.
   */
  async init(): Promise<void> {
    await this.ensureDir();
    await this.loadPatterns();
  }

  /**
   * Store a value in long-term memory.
   */
  async store(key: string, value: unknown): Promise<void> {
    const existing = this.cache.get(key);
    const now = Date.now();

    const entry: MemoryEntry = {
      key,
      value,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      accessCount: (existing?.accessCount ?? 0) + 1,
    };

    this.cache.set(key, entry);
    await this.persistEntry(key, entry);
  }

  /**
   * Retrieve a value from long-term memory.
   */
  async retrieve<T = unknown>(key: string): Promise<T | null> {
    // Check in-memory cache first
    const cached = this.cache.get(key);
    if (cached) {
      cached.accessCount++;
      cached.updatedAt = Date.now();
      return cached.value as T;
    }

    // Try loading from disk
    const filePath = this.entryPath(key);
    try {
      await access(filePath);
    } catch (error) {
      logger.debug("Memory entry not found on disk", { err: error instanceof Error ? error.message : String(error) });
      return null;
    }

    try {
      const raw = await readFile(filePath, "utf-8");
      const data = JSON.parse(raw) as MemoryEntry<T>;
      data.accessCount++;
      data.updatedAt = Date.now();
      this.cache.set(key, data);
      return data.value;
    } catch (error) {
      logger.debug("Failed to read memory entry", { err: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Learn from an action result. Over time, patterns emerge about
   * what works and what doesn't on specific pages/elements.
   */
  async learnPattern(action: string, result: "success" | "failure", context: string): Promise<void> {
    const patternKey = this.hashPattern(action, context);
    const existing = this.patterns.get(patternKey);
    const now = Date.now();

    if (existing) {
      existing.occurrences++;
      existing.lastSeen = now;

      // Update confidence based on consistency
      if (existing.result === result) {
        existing.confidence = Math.min(1, existing.confidence + 0.1);
      } else {
        existing.confidence = Math.max(0, existing.confidence - 0.2);
        // If confidence drops, flip the result to match majority
        if (existing.confidence < 0.3) {
          existing.result = result;
          existing.confidence = 0.5;
        }
      }
    } else {
      this.patterns.set(patternKey, {
        action,
        result,
        context,
        occurrences: 1,
        firstSeen: now,
        lastSeen: now,
        confidence: 0.5,
      });
    }

    await this.savePatterns();
  }

  /**
   * Get learned patterns, optionally filtered by context.
   */
  getPatterns(contextFilter?: string): LearnedPattern[] {
    const all = Array.from(this.patterns.values());

    if (!contextFilter) {
      return all.sort((a, b) => b.confidence - a.confidence);
    }

    return all
      .filter((p) => p.context.includes(contextFilter))
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get patterns relevant to a specific action type.
   */
  getPatternsForAction(action: string): LearnedPattern[] {
    return Array.from(this.patterns.values())
      .filter((p) => p.action.includes(action))
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Clear all stored patterns.
   */
  async clearPatterns(): Promise<void> {
    this.patterns.clear();
    await this.savePatterns();
  }

  /**
   * List all stored memory keys.
   */
  async listKeys(): Promise<string[]> {
    try {
      const files = await readdir(this.memoryDir);
      return files
        .filter((f) => f.endsWith(".json") && f !== "patterns.json")
        .map((f) => f.replace(".json", ""));
    } catch (error) {
      logger.debug("Failed to list memory keys", { err: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  /**
   * Delete a specific memory entry.
   */
  async delete(key: string): Promise<boolean> {
    this.cache.delete(key);
    const filePath = this.entryPath(key);
    try {
      await unlink(filePath);
      return true;
    } catch (error) {
      logger.debug("Failed to delete memory entry", { err: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async ensureDir(): Promise<void> {
    try {
      await access(this.memoryDir);
    } catch (error) {
      logger.debug("Memory directory not found, creating it", { err: error instanceof Error ? error.message : String(error) });
      await mkdir(this.memoryDir, { recursive: true });
    }
  }

  private entryPath(key: string): string {
    // Sanitize key for use as filename
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.memoryDir, `${safeKey}.json`);
  }

  private async persistEntry(key: string, entry: MemoryEntry): Promise<void> {
    try {
      await writeFile(this.entryPath(key), JSON.stringify(entry, null, 2));
    } catch (error) {
      logger.warn("Failed to persist memory entry", { err: error instanceof Error ? error.message : String(error) });
    }
  }

  private async loadPatterns(): Promise<void> {
    try {
      await access(this.patternsFile);
    } catch (error) {
      logger.debug("Patterns file not found, starting fresh", { err: error instanceof Error ? error.message : String(error) });
      return;
    }

    try {
      const raw = await readFile(this.patternsFile, "utf-8");
      const data = JSON.parse(raw) as LearnedPattern[];
      for (const pattern of data) {
        const key = this.hashPattern(pattern.action, pattern.context);
        this.patterns.set(key, pattern);
      }
    } catch (error) {
      logger.warn("Failed to load patterns, starting fresh", { err: error instanceof Error ? error.message : String(error) });
    }
  }

  private async savePatterns(): Promise<void> {
    try {
      const data = Array.from(this.patterns.values());
      await writeFile(this.patternsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.warn("Failed to save patterns", { err: error instanceof Error ? error.message : String(error) });
    }
  }

  private hashPattern(action: string, context: string): string {
    // Simple hash for pattern deduplication
    const str = `${action}::${context}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return `p_${Math.abs(hash).toString(36)}`;
  }
}
