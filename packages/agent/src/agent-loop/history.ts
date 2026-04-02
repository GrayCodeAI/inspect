/**
 * Agent History & Trajectory
 *
 * Simplified version for compilation. Full implementation in Phase 1.
 */

/**
 * Model output from LLM
 */
export interface ModelOutput {
  raw: string;
  actions: Record<string, unknown>[];
  brain?: Record<string, unknown>;
  tokens?: number;
  cost?: number;
}

/**
 * Browser state snapshot
 */
export interface BrowserState {
  url: string;
  title: string;
  screenshot?: string;
  domSnapshot?: string;
  timestamp: number;
}

/**
 * Step metadata
 */
export interface StepMetadata {
  stepNumber: number;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  tokensUsed?: number;
  cost?: number;
  model?: string;
}

/**
 * Single history entry (one step)
 */
export interface AgentHistoryEntry {
  id: string;
  modelOutput: ModelOutput;
  results: Record<string, unknown>[];
  browserState: BrowserState;
  metadata: StepMetadata;
}

/**
 * Full agent history list with query methods
 */
export class AgentHistoryList {
  entries: AgentHistoryEntry[];
  sessionId: string;

  constructor(data: { entries: AgentHistoryEntry[]; sessionId: string }) {
    this.entries = data.entries;
    this.sessionId = data.sessionId;
  }

  urls(): string[] {
    const urls = new Set<string>();
    for (const entry of this.entries) {
      urls.add(entry.browserState.url);
    }
    return Array.from(urls);
  }

  screenshots(): string[] {
    return this.entries
      .map((e) => e.browserState.screenshot)
      .filter((s): s is string => s !== undefined);
  }

  errors(): Array<{ step: number; error: string }> {
    const errors: Array<{ step: number; error: string }> = [];
    for (const entry of this.entries) {
      for (const result of entry.results) {
        if (result && typeof result === "object" && "error" in result) {
          errors.push({ step: entry.metadata.stepNumber, error: String(result.error) });
        }
      }
    }
    return errors;
  }

  totalDuration(): number {
    if (this.entries.length === 0) return 0;
    const start = Math.min(...this.entries.map((e) => e.metadata.startTime));
    const end = Math.max(...this.entries.map((e) => e.metadata.endTime ?? e.metadata.startTime));
    return end - start;
  }

  tokenUsage(): number {
    return this.entries.reduce(
      (sum, e) => sum + (e.metadata.tokensUsed ?? e.modelOutput.tokens ?? 0),
      0
    );
  }

  totalCost(): number {
    return this.entries.reduce(
      (sum, e) => sum + (e.metadata.cost ?? e.modelOutput.cost ?? 0),
      0
    );
  }

  successRate(): number {
    if (this.entries.length === 0) return 0;
    const successfulSteps = this.entries.filter((e) =>
      e.results.every((r) => {
        if (!r || typeof r !== "object") return true;
        return (r as any).success !== false;
      })
    ).length;
    return successfulSteps / this.entries.length;
  }

  toJSON(): string {
    return JSON.stringify(
      {
        sessionId: this.sessionId,
        entries: this.entries,
        stats: {
          totalSteps: this.entries.length,
          totalDuration: this.totalDuration(),
          tokenUsage: this.tokenUsage(),
          totalCost: this.totalCost(),
          successRate: this.successRate(),
          urlsVisited: this.urls().length,
          errors: this.errors().length,
        },
      },
      null,
      2
    );
  }
}
