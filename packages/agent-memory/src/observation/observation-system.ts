/**
 * Observation System with Retention
 *
 * Manages structured observations with configurable retention policies.
 * Supports filtering, summarization, and efficient storage.
 */

import { EventEmitter } from "events";

export interface ObservationConfig {
  /** Max observations to keep in memory */
  maxObservations: number;
  /** Retention period (ms) */
  retentionPeriod: number;
  /** Enable automatic summarization */
  autoSummarize: boolean;
  /** Summarization threshold */
  summarizeThreshold: number;
  /** Storage adapter */
  storage?: ObservationStorage;
  /** On observation added */
  onObservation?: (obs: Observation) => void;
  /** On observation expired */
  onExpire?: (obs: Observation) => void;
}

export interface Observation {
  id: string;
  sessionId: string;
  timestamp: number;
  type: ObservationType;
  category: string;
  content: string;
  structured?: StructuredData;
  metadata: ObservationMetadata;
  importance: number; // 0-1
  retention: RetentionPolicy;
  expiresAt?: number;
  summarized?: boolean;
  summaryOf?: string[]; // IDs of observations this summarizes
}

export type ObservationType =
  | "visual" // Screenshot, visual state
  | "dom" // DOM structure
  | "action" // Agent action
  | "error" // Error/failure
  | "state" // Application state
  | "network" // Network activity
  | "user" // User interaction
  | "system" // System event
  | "thought"; // Agent reasoning

export interface StructuredData {
  elements?: ElementObservation[];
  actions?: ActionObservation[];
  errors?: ErrorObservation[];
  metrics?: MetricObservation;
}

export interface ElementObservation {
  selector: string;
  text?: string;
  visible: boolean;
  interactive: boolean;
  attributes: Record<string, string>;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface ActionObservation {
  type: string;
  target?: string;
  params: Record<string, unknown>;
  result: "success" | "failure";
  duration: number;
}

export interface ErrorObservation {
  type: string;
  message: string;
  stack?: string;
  recoverable: boolean;
}

export interface MetricObservation {
  latency?: number;
  tokens?: number;
  cost?: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

export interface ObservationMetadata {
  url?: string;
  title?: string;
  viewport?: { width: number; height: number };
  userAgent?: string;
  tags: string[];
  source: string;
  correlationId?: string;
}

export interface RetentionPolicy {
  priority: "low" | "medium" | "high" | "critical";
  maxAge?: number; // ms
  maxCount?: number;
  persist: boolean;
}

export interface ObservationStorage {
  save(observation: Observation): Promise<void>;
  load(id: string): Promise<Observation | null>;
  query(filter: ObservationFilter): Promise<Observation[]>;
  delete(id: string): Promise<boolean>;
  cleanup(): Promise<number>;
}

export interface ObservationFilter {
  sessionId?: string;
  types?: ObservationType[];
  categories?: string[];
  since?: number;
  until?: number;
  minImportance?: number;
  tags?: string[];
  limit?: number;
}

export interface ObservationSummary {
  period: { start: number; end: number };
  totalObservations: number;
  byType: Record<ObservationType, number>;
  byCategory: Record<string, number>;
  keyEvents: Observation[];
  trends: Trend[];
}

export interface Trend {
  metric: string;
  direction: "up" | "down" | "stable";
  changePercent: number;
  significance: "low" | "medium" | "high";
}

export const DEFAULT_OBSERVATION_CONFIG: ObservationConfig = {
  maxObservations: 1000,
  retentionPeriod: 3600000, // 1 hour
  autoSummarize: true,
  summarizeThreshold: 100,
};

// Default retention policies by type
const DEFAULT_RETENTION: Record<ObservationType, RetentionPolicy> = {
  visual: { priority: "medium", maxAge: 300000, persist: true }, // 5 min
  dom: { priority: "low", maxAge: 60000, persist: false }, // 1 min
  action: { priority: "high", maxAge: 3600000, persist: true }, // 1 hour
  error: { priority: "critical", persist: true }, // Forever
  state: { priority: "medium", maxAge: 300000, persist: true }, // 5 min
  network: { priority: "low", maxAge: 60000, persist: false }, // 1 min
  user: { priority: "high", maxAge: 3600000, persist: true }, // 1 hour
  system: { priority: "medium", maxAge: 300000, persist: true }, // 5 min
  thought: { priority: "low", maxAge: 60000, persist: false }, // 1 min
};

/**
 * In-memory storage adapter
 */
export class InMemoryObservationStorage implements ObservationStorage {
  private observations = new Map<string, Observation>();

  async save(observation: Observation): Promise<void> {
    this.observations.set(observation.id, { ...observation });
  }

  async load(id: string): Promise<Observation | null> {
    const obs = this.observations.get(id);
    return obs ? { ...obs } : null;
  }

  async query(filter: ObservationFilter): Promise<Observation[]> {
    let results = Array.from(this.observations.values());

    if (filter.sessionId) {
      results = results.filter((o) => o.sessionId === filter.sessionId);
    }

    if (filter.types) {
      results = results.filter((o) => filter.types!.includes(o.type));
    }

    if (filter.categories) {
      results = results.filter((o) => filter.categories!.includes(o.category));
    }

    if (filter.since) {
      results = results.filter((o) => o.timestamp >= filter.since!);
    }

    if (filter.until) {
      results = results.filter((o) => o.timestamp <= filter.until!);
    }

    if (filter.minImportance) {
      results = results.filter((o) => o.importance >= filter.minImportance!);
    }

    if (filter.tags) {
      results = results.filter((o) => filter.tags!.some((t) => o.metadata.tags.includes(t)));
    }

    results.sort((a, b) => b.timestamp - a.timestamp);

    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async delete(id: string): Promise<boolean> {
    return this.observations.delete(id);
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let removed = 0;

    for (const [id, obs] of this.observations) {
      if (obs.expiresAt && obs.expiresAt < now) {
        this.observations.delete(id);
        removed++;
      }
    }

    return removed;
  }
}

/**
 * Observation System
 *
 * Manages observations with intelligent retention and summarization.
 */
export class ObservationSystem extends EventEmitter {
  private config: ObservationConfig;
  private observations = new Map<string, Observation>();
  private sessionObservations = new Map<string, string[]>();
  private storage: ObservationStorage;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: Partial<ObservationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_OBSERVATION_CONFIG, ...config };
    this.storage = config.storage || new InMemoryObservationStorage();
    this.startCleanupLoop();
  }

  /**
   * Initialize session
   */
  initializeSession(sessionId: string): void {
    this.sessionObservations.set(sessionId, []);
    this.emit("session:initialized", { sessionId });
  }

  /**
   * Add observation
   */
  async add(observation: Omit<Observation, "id" | "expiresAt">): Promise<Observation> {
    const id = `obs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Apply retention policy
    const retention = observation.retention || DEFAULT_RETENTION[observation.type];
    const expiresAt = retention.maxAge ? Date.now() + retention.maxAge : undefined;

    const fullObservation: Observation = {
      ...observation,
      id,
      expiresAt,
      retention,
    };

    // Store in memory
    this.observations.set(id, fullObservation);

    // Track per session
    const sessionObs = this.sessionObservations.get(observation.sessionId) || [];
    sessionObs.push(id);
    this.sessionObservations.set(observation.sessionId, sessionObs);

    // Persist if needed
    if (retention.persist) {
      await this.storage.save(fullObservation);
    }

    // Check if summarization needed
    if (this.config.autoSummarize && sessionObs.length > this.config.summarizeThreshold) {
      this.summarizeSession(observation.sessionId);
    }

    // Enforce max observations
    this.enforceMaxObservations();

    this.emit("observation:added", fullObservation);
    this.config.onObservation?.(fullObservation);

    return fullObservation;
  }

  /**
   * Get observation by ID
   */
  async get(id: string): Promise<Observation | null> {
    // Check memory first
    const mem = this.observations.get(id);
    if (mem) return mem;

    // Try storage
    return this.storage.load(id);
  }

  /**
   * Query observations
   */
  async query(filter: ObservationFilter): Promise<Observation[]> {
    // Try memory first
    let results = this.queryMemory(filter);

    // If not enough results, query storage
    if (results.length < (filter.limit || Infinity)) {
      const storageResults = await this.storage.query(filter);
      const memIds = new Set(results.map((o) => o.id));
      results.push(...storageResults.filter((o) => !memIds.has(o.id)));
    }

    // Sort and limit
    results.sort((a, b) => b.timestamp - a.timestamp);
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * Query memory store
   */
  private queryMemory(filter: ObservationFilter): Observation[] {
    let results = Array.from(this.observations.values());

    if (filter.sessionId) {
      results = results.filter((o) => o.sessionId === filter.sessionId);
    }

    if (filter.types) {
      results = results.filter((o) => filter.types!.includes(o.type));
    }

    if (filter.since) {
      results = results.filter((o) => o.timestamp >= filter.since!);
    }

    if (filter.minImportance) {
      results = results.filter((o) => o.importance >= filter.minImportance!);
    }

    return results;
  }

  /**
   * Get observations for session
   */
  async getSessionObservations(
    sessionId: string,
    options?: { type?: ObservationType; limit?: number },
  ): Promise<Observation[]> {
    const filter: ObservationFilter = { sessionId };

    if (options?.type) {
      filter.types = [options.type];
    }

    if (options?.limit) {
      filter.limit = options.limit;
    }

    return this.query(filter);
  }

  /**
   * Create summary of observations
   */
  async summarizeSession(sessionId: string): Promise<Observation | null> {
    const observations = await this.getSessionObservations(sessionId);

    if (observations.length < 10) return null;

    // Group by type
    const byType: Record<string, Observation[]> = {};
    for (const obs of observations) {
      if (!byType[obs.type]) byType[obs.type] = [];
      byType[obs.type].push(obs);
    }

    // Create summary content
    const summaryParts: string[] = [`Summary of ${observations.length} observations`];

    for (const [type, typeObs] of Object.entries(byType)) {
      summaryParts.push(`  ${type}: ${typeObs.length}`);
    }

    // Mark old observations as summarized
    const summarizedIds = observations.slice(0, -20).map((o) => o.id);
    for (const id of summarizedIds) {
      const obs = this.observations.get(id);
      if (obs) {
        obs.summarized = true;
      }
    }

    // Create summary observation
    const summary = await this.add({
      sessionId,
      timestamp: Date.now(),
      type: "system",
      category: "summary",
      content: summaryParts.join("\n"),
      metadata: { tags: ["auto-summary"], source: "observation-system" },
      importance: 0.5,
      retention: { priority: "medium", persist: true },
      summaryOf: summarizedIds,
    });

    this.emit("session:summarized", { sessionId, summary });

    return summary;
  }

  /**
   * Generate comprehensive summary
   */
  async generateSummary(sessionId: string, since?: number): Promise<ObservationSummary> {
    const filter: ObservationFilter = { sessionId };
    if (since) filter.since = since;

    const observations = await this.query(filter);

    if (observations.length === 0) {
      return {
        period: { start: Date.now(), end: Date.now() },
        totalObservations: 0,
        byType: {} as Record<ObservationType, number>,
        byCategory: {},
        keyEvents: [],
        trends: [],
      };
    }

    // Calculate stats
    const byType: Partial<Record<ObservationType, number>> = {};
    const byCategory: Record<string, number> = {};

    for (const obs of observations) {
      byType[obs.type] = (byType[obs.type] || 0) + 1;
      byCategory[obs.category] = (byCategory[obs.category] || 0) + 1;
    }

    // Find key events (high importance)
    const keyEvents = observations
      .filter((o) => o.importance >= 0.8 || o.type === "error")
      .slice(0, 10);

    // Calculate trends
    const trends = this.calculateTrends(observations);

    return {
      period: {
        start: observations[observations.length - 1].timestamp,
        end: observations[0].timestamp,
      },
      totalObservations: observations.length,
      byType: byType as Record<ObservationType, number>,
      byCategory,
      keyEvents,
      trends,
    };
  }

  /**
   * Calculate trends from observations
   */
  private calculateTrends(observations: Observation[]): Trend[] {
    const trends: Trend[] = [];

    // Group by time buckets
    const bucketSize = 60000; // 1 minute
    const buckets = new Map<number, { latency: number[]; errors: number }>();

    for (const obs of observations) {
      const bucket = Math.floor(obs.timestamp / bucketSize) * bucketSize;
      if (!buckets.has(bucket)) {
        buckets.set(bucket, { latency: [], errors: 0 });
      }

      const b = buckets.get(bucket)!;
      if (obs.structured?.metrics?.latency) {
        b.latency.push(obs.structured.metrics.latency);
      }
      if (obs.type === "error") {
        b.errors++;
      }
    }

    // Calculate trend for latency
    const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
    if (sortedBuckets.length >= 2) {
      const firstHalf = sortedBuckets.slice(0, Math.floor(sortedBuckets.length / 2));
      const secondHalf = sortedBuckets.slice(Math.floor(sortedBuckets.length / 2));

      const firstLatency = this.avg(firstHalf.flatMap(([, b]) => b.latency));
      const secondLatency = this.avg(secondHalf.flatMap(([, b]) => b.latency));

      if (firstLatency > 0) {
        const change = ((secondLatency - firstLatency) / firstLatency) * 100;
        trends.push({
          metric: "latency",
          direction: change > 5 ? "up" : change < -5 ? "down" : "stable",
          changePercent: Math.abs(change),
          significance: Math.abs(change) > 20 ? "high" : Math.abs(change) > 10 ? "medium" : "low",
        });
      }
    }

    return trends;
  }

  /**
   * Delete observation
   */
  async delete(id: string): Promise<boolean> {
    const obs = this.observations.get(id);
    if (obs) {
      this.observations.delete(id);

      const sessionObs = this.sessionObservations.get(obs.sessionId);
      if (sessionObs) {
        const idx = sessionObs.indexOf(id);
        if (idx > -1) sessionObs.splice(idx, 1);
      }

      this.emit("observation:deleted", { id });
    }

    return this.storage.delete(id);
  }

  /**
   * End session
   */
  async endSession(sessionId: string): Promise<void> {
    const sessionObs = this.sessionObservations.get(sessionId);

    if (sessionObs) {
      // Persist all observations
      for (const id of sessionObs) {
        const obs = this.observations.get(id);
        if (obs && obs.retention.persist) {
          await this.storage.save(obs);
        }
        this.observations.delete(id);
      }

      this.sessionObservations.delete(sessionId);
    }

    this.emit("session:ended", { sessionId });
  }

  /**
   * Start cleanup loop
   */
  private startCleanupLoop(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute
  }

  /**
   * Cleanup expired observations
   */
  private async cleanup(): Promise<void> {
    const now = Date.now();
    let removed = 0;

    for (const [id, obs] of this.observations) {
      if (obs.expiresAt && obs.expiresAt < now) {
        this.observations.delete(id);
        this.config.onExpire?.(obs);
        removed++;
      }
    }

    // Also cleanup storage
    removed += await this.storage.cleanup();

    if (removed > 0) {
      this.emit("cleanup", { removed });
    }
  }

  /**
   * Enforce max observations limit
   */
  private enforceMaxObservations(): void {
    if (this.observations.size <= this.config.maxObservations) return;

    // Sort by importance and timestamp
    const sorted = Array.from(this.observations.values()).sort((a, b) => {
      if (a.importance !== b.importance) return a.importance - b.importance;
      return a.timestamp - b.timestamp;
    });

    const toRemove = this.observations.size - this.config.maxObservations;
    for (let i = 0; i < toRemove; i++) {
      const obs = sorted[i];
      if (obs.retention.priority !== "critical") {
        this.observations.delete(obs.id);
      }
    }
  }

  /**
   * Helper: calculate average
   */
  private avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Get stats
   */
  getStats(): {
    totalObservations: number;
    activeSessions: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};

    for (const obs of this.observations.values()) {
      byType[obs.type] = (byType[obs.type] || 0) + 1;
    }

    return {
      totalObservations: this.observations.size,
      activeSessions: this.sessionObservations.size,
      byType,
    };
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Persist all critical observations
    for (const [_id, obs] of this.observations) {
      if (obs.retention.priority === "critical" || obs.retention.persist) {
        await this.storage.save(obs);
      }
    }
  }
}

/**
 * Convenience function
 */
export function createObservationSystem(config?: Partial<ObservationConfig>): ObservationSystem {
  return new ObservationSystem(config);
}
