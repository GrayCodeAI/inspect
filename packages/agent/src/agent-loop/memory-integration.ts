/**
 * Memory Integration for Agent Loop
 *
 * Manages short-term and long-term memory, pattern recognition, and recall
 */

export interface MemoryItem {
  content: string;
  importance: number; // 0-1
  timestamp: number;
  category?: "action" | "observation" | "error" | "discovery" | "pattern";
  relatedSteps?: number[];
}

export interface PatternMemory {
  pattern: string;
  frequency: number;
  lastSeen: number;
  examples: string[];
  confidence: number;
}

/**
 * Short-term memory - Recent observations and actions
 */
export class ShortTermMemory {
  private items: MemoryItem[] = [];
  private maxItems = 50;

  /**
   * Add item to short-term memory
   */
  add(item: Omit<MemoryItem, "timestamp">): void {
    this.items.push({
      ...item,
      timestamp: Date.now(),
    });

    // Remove oldest items if over limit
    if (this.items.length > this.maxItems) {
      this.items = this.items.slice(-this.maxItems);
    }
  }

  /**
   * Get recent items
   */
  getRecent(count = 10): MemoryItem[] {
    return this.items.slice(-count);
  }

  /**
   * Get items by category
   */
  getByCategory(category: string): MemoryItem[] {
    return this.items.filter((item) => item.category === category);
  }

  /**
   * Clear memory
   */
  clear(): void {
    this.items = [];
  }

  /**
   * Get all items
   */
  getAll(): MemoryItem[] {
    return [...this.items];
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    totalItems: number;
    byCategory: Record<string, number>;
    averageImportance: number;
  } {
    const byCategory: Record<string, number> = {};
    let totalImportance = 0;

    for (const item of this.items) {
      const cat = item.category || "uncategorized";
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      totalImportance += item.importance;
    }

    return {
      totalItems: this.items.length,
      byCategory,
      averageImportance: this.items.length > 0 ? totalImportance / this.items.length : 0,
    };
  }
}

/**
 * Long-term memory - Patterns and important discoveries
 */
export class LongTermMemory {
  private memories: MemoryItem[] = [];
  private patterns: PatternMemory[] = [];
  private maxMemories = 200;

  /**
   * Store important discovery
   */
  storeDiscovery(content: string, importance: number): void {
    this.memories.push({
      content,
      importance,
      timestamp: Date.now(),
      category: "discovery",
    });

    // Keep highest importance items
    this.memories = this.memories
      .sort((a, b) => b.importance - a.importance)
      .slice(0, this.maxMemories);
  }

  /**
   * Store error for learning
   */
  storeError(error: string, context: string): void {
    this.memories.push({
      content: `Error: ${error}. Context: ${context}`,
      importance: 0.7,
      timestamp: Date.now(),
      category: "error",
    });
  }

  /**
   * Record pattern observation
   */
  recordPattern(pattern: string, example: string): void {
    const existing = this.patterns.find((p) => p.pattern === pattern);

    if (existing) {
      existing.frequency++;
      existing.lastSeen = Date.now();
      if (!existing.examples.includes(example)) {
        existing.examples.push(example);
      }
      // Increase confidence with more examples
      existing.confidence = Math.min(1, 0.5 + (existing.frequency * 0.1));
    } else {
      this.patterns.push({
        pattern,
        frequency: 1,
        lastSeen: Date.now(),
        examples: [example],
        confidence: 0.5,
      });
    }
  }

  /**
   * Get most important memories
   */
  getImportant(count = 5): MemoryItem[] {
    return [...this.memories]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, count);
  }

  /**
   * Get high-confidence patterns
   */
  getPatterns(minConfidence = 0.7): PatternMemory[] {
    return this.patterns.filter((p) => p.confidence >= minConfidence);
  }

  /**
   * Get discovery memories
   */
  getDiscoveries(): MemoryItem[] {
    return this.memories.filter((m) => m.category === "discovery");
  }

  /**
   * Query memory by relevance
   */
  queryByRelevance(query: string): MemoryItem[] {
    const queryLower = query.toLowerCase();
    return this.memories
      .filter((m) => m.content.toLowerCase().includes(queryLower))
      .sort((a, b) => b.importance - a.importance);
  }

  /**
   * Clear old memories (older than hours)
   */
  pruneOld(hours = 24): void {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    this.memories = this.memories.filter((m) => m.timestamp > cutoff);
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    totalMemories: number;
    totalPatterns: number;
    averageImportance: number;
    highConfidencePatterns: number;
  } {
    const avgImportance = this.memories.length > 0
      ? this.memories.reduce((sum, m) => sum + m.importance, 0) / this.memories.length
      : 0;

    return {
      totalMemories: this.memories.length,
      totalPatterns: this.patterns.length,
      averageImportance: avgImportance,
      highConfidencePatterns: this.patterns.filter((p) => p.confidence >= 0.7).length,
    };
  }
}

/**
 * Memory context for agent loop
 */
export class MemoryContext {
  private shortTerm: ShortTermMemory;
  private longTerm: LongTermMemory;
  private stepHistory: Array<{
    stepNumber: number;
    success: boolean;
    timestamp: number;
  }> = [];

  constructor() {
    this.shortTerm = new ShortTermMemory();
    this.longTerm = new LongTermMemory();
  }

  /**
   * Record step execution
   */
  recordStep(stepNumber: number, success: boolean): void {
    this.stepHistory.push({
      stepNumber,
      success,
      timestamp: Date.now(),
    });

    // Add to short-term memory
    this.shortTerm.add({
      content: `Step ${stepNumber}: ${success ? "Success" : "Failed"}`,
      importance: success ? 0.6 : 0.8,
      category: "action",
      relatedSteps: [stepNumber],
    });
  }

  /**
   * Record important observation
   */
  recordObservation(observation: string, importance = 0.7): void {
    this.shortTerm.add({
      content: observation,
      importance,
      category: "observation",
    });

    // Also store in long-term if important
    if (importance >= 0.8) {
      this.longTerm.storeDiscovery(observation, importance);
    }
  }

  /**
   * Record error for learning
   */
  recordError(error: string, context: string): void {
    this.shortTerm.add({
      content: `Error: ${error}`,
      importance: 0.9,
      category: "error",
    });

    this.longTerm.storeError(error, context);
  }

  /**
   * Get relevant memories for next step
   */
  getRelevantMemories(query?: string): {
    recent: MemoryItem[];
    important: MemoryItem[];
    patterns: PatternMemory[];
  } {
    let important = this.longTerm.getImportant(3);

    if (query) {
      important = this.longTerm.queryByRelevance(query).slice(0, 3);
    }

    return {
      recent: this.shortTerm.getRecent(5),
      important,
      patterns: this.longTerm.getPatterns(0.7),
    };
  }

  /**
   * Get step success rate
   */
  getSuccessRate(): number {
    if (this.stepHistory.length === 0) return 0;
    const successes = this.stepHistory.filter((s) => s.success).length;
    return successes / this.stepHistory.length;
  }

  /**
   * Get consecutive successes
   */
  getConsecutiveSuccesses(): number {
    let count = 0;
    for (let i = this.stepHistory.length - 1; i >= 0; i--) {
      if (this.stepHistory[i].success) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * Get memory summary for context
   */
  getSummary(): {
    shortTermStats: ReturnType<ShortTermMemory["getStats"]>;
    longTermStats: ReturnType<LongTermMemory["getStats"]>;
    stepStats: {
      totalSteps: number;
      successRate: number;
      consecutiveSuccesses: number;
    };
  } {
    return {
      shortTermStats: this.shortTerm.getStats(),
      longTermStats: this.longTerm.getStats(),
      stepStats: {
        totalSteps: this.stepHistory.length,
        successRate: this.getSuccessRate(),
        consecutiveSuccesses: this.getConsecutiveSuccesses(),
      },
    };
  }

  /**
   * Clear all memory
   */
  clear(): void {
    this.shortTerm.clear();
    this.stepHistory = [];
  }
}

/**
 * Memory recall with relevance scoring
 */
export class MemoryRecall {
  constructor(private context: MemoryContext) {}

  /**
   * Score relevance of memory to current situation
   */
  scoreRelevance(memory: MemoryItem, currentGoal: string): number {
    let score = memory.importance;

    // Boost recent memories
    const ageSeconds = (Date.now() - memory.timestamp) / 1000;
    if (ageSeconds < 300) {
      // Less than 5 minutes
      score *= 1.2;
    } else if (ageSeconds > 3600) {
      // More than 1 hour
      score *= 0.8;
    }

    // Boost if matches goal
    if (memory.content.toLowerCase().includes(currentGoal.toLowerCase())) {
      score *= 1.5;
    }

    // Boost successful memories
    if (memory.category === "action") {
      score *= 1.1;
    }

    return Math.min(1, score);
  }

  /**
   * Recall best memories for task
   */
  recallForTask(task: string, count = 5): MemoryItem[] {
    const memories = this.context.getRelevantMemories(task);
    const allMemories = [...memories.recent, ...memories.important];

    return allMemories
      .map((m) => ({
        memory: m,
        score: this.scoreRelevance(m, task),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map((x) => x.memory);
  }

  /**
   * Get context summary for LLM
   */
  getContextForLLM(goal: string): string {
    const memories = this.recallForTask(goal, 5);
    const summary = this.context.getSummary();

    let context = "## Relevant Memories:\n";

    for (const mem of memories) {
      context += `- [${mem.importance.toFixed(1)}] ${mem.content}\n`;
    }

    context += `\n## Progress:\n`;
    context += `- Success Rate: ${(summary.stepStats.successRate * 100).toFixed(1)}%\n`;
    context += `- Consecutive Successes: ${summary.stepStats.consecutiveSuccesses}\n`;
    context += `- Total Steps: ${summary.stepStats.totalSteps}\n`;

    return context;
  }
}
