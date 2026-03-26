// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Long-Term Memory
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
    this.ensureDir();
    this.loadPatterns();
  }

  /**
   * Store a value in long-term memory.
   */
  store(key: string, value: unknown): void {
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
    this.persistEntry(key, entry);
  }

  /**
   * Retrieve a value from long-term memory.
   */
  retrieve<T = unknown>(key: string): T | null {
    // Check in-memory cache first
    const cached = this.cache.get(key);
    if (cached) {
      cached.accessCount++;
      cached.updatedAt = Date.now();
      return cached.value as T;
    }

    // Try loading from disk
    const filePath = this.entryPath(key);
    if (existsSync(filePath)) {
      try {
        const data = JSON.parse(readFileSync(filePath, "utf-8")) as MemoryEntry<T>;
        data.accessCount++;
        data.updatedAt = Date.now();
        this.cache.set(key, data);
        return data.value;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Learn from an action result. Over time, patterns emerge about
   * what works and what doesn't on specific pages/elements.
   */
  learnPattern(action: string, result: "success" | "failure", context: string): void {
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

    this.savePatterns();
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
  clearPatterns(): void {
    this.patterns.clear();
    this.savePatterns();
  }

  /**
   * List all stored memory keys.
   */
  listKeys(): string[] {
    try {
      const files = readdirSync(this.memoryDir);
      return files
        .filter((f) => f.endsWith(".json") && f !== "patterns.json")
        .map((f) => f.replace(".json", ""));
    } catch {
      return [];
    }
  }

  /**
   * Delete a specific memory entry.
   */
  delete(key: string): boolean {
    this.cache.delete(key);
    const filePath = this.entryPath(key);
    try {
      const { unlinkSync } = require("node:fs");
      unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private ensureDir(): void {
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  private entryPath(key: string): string {
    // Sanitize key for use as filename
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.memoryDir, `${safeKey}.json`);
  }

  private persistEntry(key: string, entry: MemoryEntry): void {
    try {
      writeFileSync(this.entryPath(key), JSON.stringify(entry, null, 2));
    } catch {
      // Non-critical - memory is still in cache
    }
  }

  private loadPatterns(): void {
    if (existsSync(this.patternsFile)) {
      try {
        const data = JSON.parse(readFileSync(this.patternsFile, "utf-8")) as LearnedPattern[];
        for (const pattern of data) {
          const key = this.hashPattern(pattern.action, pattern.context);
          this.patterns.set(key, pattern);
        }
      } catch {
        // Start fresh if file is corrupted
      }
    }
  }

  private savePatterns(): void {
    try {
      const data = Array.from(this.patterns.values());
      writeFileSync(this.patternsFile, JSON.stringify(data, null, 2));
    } catch {
      // Non-critical
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
