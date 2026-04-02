/**
 * Loop Detection with Escalating Nudges
 *
 * Detects repetitive actions and injects escalating nudge messages
 * at 5, 8, 12 repetitions. Inspired by browser-use.
 */

export interface LoopDetectorConfig {
  /** Window size for action history */
  windowSize: number;
  /** Threshold for same action (similarity > this) */
  similarityThreshold: number;
  /** Nudge levels with repetition counts */
  nudgeLevels: Array<{ repetitions: number; message: string; severity?: Nudge["severity"] }>;
  /** Max repetitions before giving up */
  maxRepetitions: number;
  /** Callback when loop detected */
  onLoopDetected?: (loop: LoopInfo) => void;
  /** Callback when nudge injected */
  onNudgeInjected?: (nudge: Nudge) => void;
}

export interface LoopInfo {
  /** Action hash */
  actionHash: string;
  /** Number of repetitions */
  repetitions: number;
  /** Similarity score */
  similarity: number;
  /** Last action */
  lastAction: string;
  /** First seen timestamp */
  firstSeen: number;
  /** Last seen timestamp */
  lastSeen: number;
}

export interface Nudge {
  level: number;
  repetitions: number;
  message: string;
  severity: "gentle" | "suggestive" | "forceful";
}

export interface ActionRecord {
  action: string;
  params: Record<string, unknown>;
  url: string;
  domHash: string;
  timestamp: number;
}

export const DEFAULT_LOOP_CONFIG: LoopDetectorConfig = {
  windowSize: 20,
  similarityThreshold: 0.85,
  nudgeLevels: [
    {
      repetitions: 5,
      message: "You've performed this action {count} times. Consider if there's a better approach.",
      severity: "gentle",
    },
    {
      repetitions: 8,
      message: "You're repeating the same action ({count} times). Try a different strategy to make progress.",
      severity: "suggestive",
    },
    {
      repetitions: 12,
      message: "STUCK DETECTED: You've repeated this action {count} times. Consider breaking out of this loop by exploring a completely different part of the page or asking for help.",
      severity: "forceful",
    },
  ],
  maxRepetitions: 15,
};

/**
 * Loop Detector with Nudge System
 */
export class LoopDetector {
  private config: LoopDetectorConfig;
  private actionHistory: ActionRecord[] = [];
  private loopMap = new Map<string, LoopInfo>();

  constructor(config: Partial<LoopDetectorConfig> = {}) {
    this.config = { ...DEFAULT_LOOP_CONFIG, ...config };
  }

  /**
   * Record an action
   */
  recordAction(action: ActionRecord): LoopInfo | null {
    // Add to history
    this.actionHistory.push(action);

    // Trim history
    if (this.actionHistory.length > this.config.windowSize) {
      this.actionHistory.shift();
    }

    // Calculate action hash
    const hash = this.calculateHash(action);

    // Check for loop
    const loop = this.detectLoop(hash, action);

    if (loop) {
      this.config.onLoopDetected?.(loop);
    }

    return loop;
  }

  /**
   * Calculate hash for action
   */
  private calculateHash(action: ActionRecord): string {
    // Normalize action for hashing
    const normalized = {
      action: action.action,
      params: this.normalizeParams(action.params),
      url: action.url,
    };

    // Simple hash
    return JSON.stringify(normalized);
  }

  /**
   * Normalize parameters for consistent hashing
   */
  private normalizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      // Sort search tokens
      if (typeof value === "string" && key.includes("search")) {
        normalized[key] = value.split(" ").sort().join(" ");
      }
      // Strip click indices
      else if (key === "index" || key === "elementIndex") {
        continue; // Skip indices
      }
      else {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  /**
   * Detect loop from action hash
   */
  private detectLoop(hash: string, action: ActionRecord): LoopInfo | null {
    const existing = this.loopMap.get(hash);

    if (existing) {
      // Update loop info
      existing.repetitions++;
      existing.lastSeen = action.timestamp;
      existing.lastAction = action.action;

      // Check if we should give up
      if (existing.repetitions >= this.config.maxRepetitions) {
        console.error(`Action repeated ${existing.repetitions} times - giving up`);
      }

      return existing;
    }

    // Check for similar actions
    for (const [existingHash, loop] of this.loopMap.entries()) {
      const similarity = this.calculateSimilarity(hash, existingHash);

      if (similarity > this.config.similarityThreshold) {
        // Similar action found
        loop.repetitions++;
        loop.lastSeen = action.timestamp;
        loop.lastAction = action.action;
        loop.similarity = similarity;

        return loop;
      }
    }

    // New action - create entry
    const newLoop: LoopInfo = {
      actionHash: hash,
      repetitions: 1,
      similarity: 1.0,
      lastAction: action.action,
      firstSeen: action.timestamp,
      lastSeen: action.timestamp,
    };

    this.loopMap.set(hash, newLoop);
    return null;
  }

  /**
   * Calculate similarity between two hashes
   */
  private calculateSimilarity(hash1: string, hash2: string): number {
    try {
      const obj1 = JSON.parse(hash1);
      const obj2 = JSON.parse(hash2);

      // Compare URLs
      if (obj1.url !== obj2.url) return 0;

      // Compare actions
      if (obj1.action !== obj2.action) return 0;

      // Compare params
      const keys1 = Object.keys(obj1.params);
      const keys2 = Object.keys(obj2.params);

      if (keys1.length !== keys2.length) return 0.5;

      let matches = 0;
      for (const key of keys1) {
        if (obj1.params[key] === obj2.params[key]) {
          matches++;
        }
      }

      return matches / keys1.length;
    } catch {
      return hash1 === hash2 ? 1.0 : 0;
    }
  }

  /**
   * Get nudge for current loop state
   */
  getNudge(loop: LoopInfo): Nudge | null {
    // Sort nudge levels by repetitions descending
    const sortedLevels = [...this.config.nudgeLevels].sort(
      (a, b) => b.repetitions - a.repetitions
    );

    // Find applicable nudge
    for (let i = 0; i < sortedLevels.length; i++) {
      const level = sortedLevels[i];

      if (loop.repetitions === level.repetitions) {
        const severity = level.severity || (i === 0 ? "forceful" : i === 1 ? "suggestive" : "gentle");
        const nudge: Nudge = {
          level: sortedLevels.length - i,
          repetitions: level.repetitions,
          message: level.message.replace("{count}", String(loop.repetitions)),
          severity,
        };

        this.config.onNudgeInjected?.(nudge);
        return nudge;
      }
    }

    return null;
  }

  /**
   * Get all current loops
   */
  getLoops(): LoopInfo[] {
    return Array.from(this.loopMap.values()).filter((l) => l.repetitions > 1);
  }

  /**
   * Check if currently in a loop
   */
  isInLoop(threshold = 3): boolean {
    for (const loop of this.loopMap.values()) {
      if (loop.repetitions >= threshold) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get loop statistics
   */
  getStats(): {
    totalLoops: number;
    maxRepetitions: number;
    currentLoops: number;
  } {
    const loops = Array.from(this.loopMap.values());
    const activeLoops = loops.filter((l) => l.repetitions > 1);

    return {
      totalLoops: loops.length,
      maxRepetitions: Math.max(0, ...loops.map((l) => l.repetitions)),
      currentLoops: activeLoops.length,
    };
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.actionHistory = [];
    this.loopMap.clear();
  }

  /**
   * Get action history
   */
  getHistory(): ActionRecord[] {
    return [...this.actionHistory];
  }
}

/**
 * Nudge injector for agent prompts
 */
export class NudgeInjector {
  private nudges: Nudge[] = [];

  /**
   * Add a nudge
   */
  addNudge(nudge: Nudge): void {
    this.nudges.push(nudge);
  }

  /**
   * Get nudge text for prompt injection
   */
  getNudgeText(): string {
    if (this.nudges.length === 0) return "";

    const lines: string[] = [];
    lines.push("\n⚠️ IMPORTANT NOTICES:\n");

    for (const nudge of this.nudges) {
      lines.push(`[${nudge.severity.toUpperCase()}] ${nudge.message}`);
    }

    return lines.join("\n");
  }

  /**
   * Clear nudges
   */
  clear(): void {
    this.nudges = [];
  }

  /**
   * Get current nudges
   */
  getNudges(): Nudge[] {
    return [...this.nudges];
  }
}
