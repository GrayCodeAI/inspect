/**
 * Checkpoint Manager
 *
 * Saves and restores agent state for recovery and pause/resume functionality.
 */

import { EventEmitter } from "events";

export interface CheckpointConfig {
  /** Auto-save interval (ms) */
  autoSaveInterval: number;
  /** Max checkpoints to keep per session */
  maxCheckpoints: number;
  /** Include DOM snapshot */
  includeDOM: boolean;
  /** Include screenshot */
  includeScreenshot: boolean;
  /** Compression level */
  compression: "none" | "low" | "high";
  /** Storage adapter */
  storage: CheckpointStorage;
  /** On checkpoint created */
  onCheckpoint?: (checkpoint: Checkpoint) => void;
  /** On checkpoint restored */
  onRestore?: (checkpoint: Checkpoint) => void;
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  timestamp: number;
  sequence: number;
  agentState: AgentState;
  browserState?: BrowserState;
  taskContext: TaskContext;
  metadata: CheckpointMetadata;
}

export interface AgentState {
  /** Current goal/task */
  currentGoal?: string;
  /** Action history */
  actionHistory: ActionRecord[];
  /** Memory context */
  memory: MemoryEntry[];
  /** Current plan */
  currentPlan?: PlanStep[];
  /** Learned patterns */
  learnedPatterns: string[];
  /** Statistics */
  stats: AgentStats;
}

export interface ActionRecord {
  id: string;
  type: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  timestamp: number;
  duration: number;
}

export interface MemoryEntry {
  id: string;
  content: string;
  type: "observation" | "action" | "fact" | "error";
  importance: number;
  timestamp: number;
}

export interface PlanStep {
  id: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "failed";
  dependencies: string[];
}

export interface AgentStats {
  actionsTaken: number;
  errorsEncountered: number;
  tokensUsed: number;
  costIncurred: number;
  startTime: number;
}

export interface BrowserState {
  /** Current URL */
  url: string;
  /** Page title */
  title: string;
  /** Cookies */
  cookies: Cookie[];
  /** Local storage */
  localStorage: Record<string, string>;
  /** Session storage */
  sessionStorage: Record<string, string>;
  /** DOM snapshot (if enabled) */
  domSnapshot?: string;
  /** Screenshot (if enabled) */
  screenshot?: string;
  /** Scroll position */
  scrollPosition: { x: number; y: number };
  /** Viewport size */
  viewport: { width: number; height: number };
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface TaskContext {
  taskId: string;
  taskType: string;
  originalPrompt: string;
  parameters: Record<string, unknown>;
  progress: number;
  expectedOutput?: string;
}

export interface CheckpointMetadata {
  name?: string;
  description?: string;
  tags: string[];
  createdBy: "auto" | "manual" | "recovery";
  parentCheckpoint?: string;
  sizeBytes: number;
}

export interface CheckpointStorage {
  save(checkpoint: Checkpoint): Promise<void>;
  load(checkpointId: string): Promise<Checkpoint | null>;
  list(sessionId?: string): Promise<CheckpointSummary[]>;
  delete(checkpointId: string): Promise<boolean>;
}

export interface CheckpointSummary {
  id: string;
  sessionId: string;
  timestamp: number;
  sequence: number;
  name?: string;
  tags: string[];
  sizeBytes: number;
}

/**
 * In-memory checkpoint storage
 */
export class InMemoryCheckpointStorage implements CheckpointStorage {
  private checkpoints = new Map<string, Checkpoint>();

  async save(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.id, JSON.parse(JSON.stringify(checkpoint)));
  }

  async load(checkpointId: string): Promise<Checkpoint | null> {
    const cp = this.checkpoints.get(checkpointId);
    return cp ? JSON.parse(JSON.stringify(cp)) : null;
  }

  async list(sessionId?: string): Promise<CheckpointSummary[]> {
    const all = Array.from(this.checkpoints.values());
    const filtered = sessionId ? all.filter((cp) => cp.sessionId === sessionId) : all;

    return filtered.map((cp) => ({
      id: cp.id,
      sessionId: cp.sessionId,
      timestamp: cp.timestamp,
      sequence: cp.sequence,
      name: cp.metadata.name,
      tags: cp.metadata.tags,
      sizeBytes: cp.metadata.sizeBytes,
    }));
  }

  async delete(checkpointId: string): Promise<boolean> {
    return this.checkpoints.delete(checkpointId);
  }
}

export const DEFAULT_CHECKPOINT_CONFIG: CheckpointConfig = {
  autoSaveInterval: 60000, // 1 minute
  maxCheckpoints: 10,
  includeDOM: false,
  includeScreenshot: false,
  compression: "low",
  storage: new InMemoryCheckpointStorage(),
};

/**
 * Checkpoint Manager
 *
 * Manages agent state checkpoints for recovery and debugging.
 */
export class CheckpointManager extends EventEmitter {
  private config: CheckpointConfig;
  private checkpoints = new Map<string, Checkpoint>();
  private sessionCheckpoints = new Map<string, string[]>();
  private autoSaveTimers = new Map<string, NodeJS.Timeout>();
  private sequenceCounter = new Map<string, number>();

  constructor(config: Partial<CheckpointConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CHECKPOINT_CONFIG, ...config };
  }

  /**
   * Initialize checkpointing for a session
   */
  initializeSession(sessionId: string): void {
    this.sessionCheckpoints.set(sessionId, []);
    this.sequenceCounter.set(sessionId, 0);

    // Start auto-save
    if (this.config.autoSaveInterval > 0) {
      const timer = setInterval(() => {
        this.createCheckpoint(sessionId, {
          createdBy: "auto",
          agentState: {
            actionHistory: [],
            memory: [],
            learnedPatterns: [],
            stats: {
              actionsTaken: 0,
              errorsEncountered: 0,
              tokensUsed: 0,
              costIncurred: 0,
              startTime: Date.now(),
            },
          },
          taskContext: {
            taskId: "",
            taskType: "auto-save",
            originalPrompt: "",
            parameters: {},
            progress: 0,
          },
        }).catch(() => undefined);
      }, this.config.autoSaveInterval);
      this.autoSaveTimers.set(sessionId, timer);
    }

    this.emit("session:initialized", { sessionId });
  }

  /**
   * Create a checkpoint
   */
  async createCheckpoint(
    sessionId: string,
    options: {
      name?: string;
      description?: string;
      tags?: string[];
      createdBy?: "auto" | "manual" | "recovery";
      agentState: AgentState;
      browserState?: BrowserState;
      taskContext: TaskContext;
    },
  ): Promise<Checkpoint> {
    const sequence = (this.sequenceCounter.get(sessionId) || 0) + 1;
    this.sequenceCounter.set(sessionId, sequence);

    const checkpointId = `cp-${sessionId}-${sequence}-${Date.now()}`;

    const checkpoint: Checkpoint = {
      id: checkpointId,
      sessionId,
      timestamp: Date.now(),
      sequence,
      agentState: options.agentState,
      browserState: options.browserState,
      taskContext: options.taskContext,
      metadata: {
        name: options.name,
        description: options.description,
        tags: options.tags || [],
        createdBy: options.createdBy || "manual",
        sizeBytes: 0,
      },
    };

    // Calculate size
    checkpoint.metadata.sizeBytes = this.calculateSize(checkpoint);

    // Save to storage
    await this.config.storage.save(checkpoint);

    // Track in memory
    this.checkpoints.set(checkpointId, checkpoint);

    const sessionCps = this.sessionCheckpoints.get(sessionId) || [];
    sessionCps.push(checkpointId);
    this.sessionCheckpoints.set(sessionId, sessionCps);

    // Enforce max checkpoints
    await this.enforceMaxCheckpoints(sessionId);

    this.emit("checkpoint:created", checkpoint);
    this.config.onCheckpoint?.(checkpoint);

    return checkpoint;
  }

  /**
   * Restore from checkpoint
   */
  async restoreCheckpoint(
    checkpointId: string,
  ): Promise<{ checkpoint: Checkpoint; restored: boolean }> {
    let checkpoint: Checkpoint | undefined = this.checkpoints.get(checkpointId);

    if (!checkpoint) {
      // Try loading from storage
      const loaded = await this.config.storage.load(checkpointId);
      if (loaded) {
        checkpoint = loaded;
      }
    }

    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    this.emit("checkpoint:restoring", checkpoint);

    // In a real implementation, this would:
    // 1. Restore browser state (cookies, storage, URL)
    // 2. Restore agent memory and context
    // 3. Resume task execution

    this.emit("checkpoint:restored", checkpoint);
    this.config.onRestore?.(checkpoint);

    return { checkpoint, restored: true };
  }

  /**
   * Get latest checkpoint for session
   */
  async getLatestCheckpoint(sessionId: string): Promise<Checkpoint | null> {
    const sessionCps = this.sessionCheckpoints.get(sessionId) || [];
    if (sessionCps.length === 0) return null;

    const latestId = sessionCps[sessionCps.length - 1];
    return this.checkpoints.get(latestId) || (await this.config.storage.load(latestId));
  }

  /**
   * List checkpoints for session
   */
  async listCheckpoints(sessionId: string): Promise<CheckpointSummary[]> {
    return this.config.storage.list(sessionId);
  }

  /**
   * Delete checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    const checkpoint = this.checkpoints.get(checkpointId);

    if (checkpoint) {
      const sessionCps = this.sessionCheckpoints.get(checkpoint.sessionId) || [];
      const index = sessionCps.indexOf(checkpointId);
      if (index > -1) {
        sessionCps.splice(index, 1);
      }
    }

    this.checkpoints.delete(checkpointId);

    const deleted = await this.config.storage.delete(checkpointId);

    if (deleted) {
      this.emit("checkpoint:deleted", { checkpointId });
    }

    return deleted;
  }

  /**
   * Compare two checkpoints
   */
  compareCheckpoints(
    cp1: Checkpoint,
    cp2: Checkpoint,
  ): {
    actionCountDiff: number;
    memoryDiff: number;
    progressDiff: number;
    timeDiff: number;
    differences: string[];
  } {
    const differences: string[] = [];

    const actionCountDiff =
      cp2.agentState.actionHistory.length - cp1.agentState.actionHistory.length;
    const memoryDiff = cp2.agentState.memory.length - cp1.agentState.memory.length;
    const progressDiff = cp2.taskContext.progress - cp1.taskContext.progress;
    const timeDiff = cp2.timestamp - cp1.timestamp;

    if (actionCountDiff > 0) {
      differences.push(`${actionCountDiff} new actions`);
    }
    if (memoryDiff > 0) {
      differences.push(`${memoryDiff} new memory entries`);
    }
    if (progressDiff !== 0) {
      differences.push(`Progress changed by ${progressDiff}%`);
    }

    return {
      actionCountDiff,
      memoryDiff,
      progressDiff,
      timeDiff,
      differences,
    };
  }

  /**
   * Create diff between checkpoints
   */
  createDiff(fromCheckpoint: Checkpoint, toCheckpoint: Checkpoint): CheckpointDiff {
    const newActions = toCheckpoint.agentState.actionHistory.filter(
      (a) => !fromCheckpoint.agentState.actionHistory.some((fa) => fa.id === a.id),
    );

    const newMemory = toCheckpoint.agentState.memory.filter(
      (m) => !fromCheckpoint.agentState.memory.some((fm) => fm.id === m.id),
    );

    const completedSteps =
      toCheckpoint.agentState.currentPlan?.filter((s) => s.status === "completed").length || 0;

    const fromCompletedSteps =
      fromCheckpoint.agentState.currentPlan?.filter((s) => s.status === "completed").length || 0;

    return {
      fromCheckpointId: fromCheckpoint.id,
      toCheckpointId: toCheckpoint.id,
      newActions,
      newMemory,
      planProgress: completedSteps - fromCompletedSteps,
      timeDelta: toCheckpoint.timestamp - fromCheckpoint.timestamp,
      urlChanged: fromCheckpoint.browserState?.url !== toCheckpoint.browserState?.url,
    };
  }

  /**
   * End session and cleanup
   */
  async endSession(sessionId: string): Promise<void> {
    // Stop auto-save
    const timer = this.autoSaveTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(sessionId);
    }

    // Clean up memory
    const sessionCps = this.sessionCheckpoints.get(sessionId) || [];
    for (const cpId of sessionCps) {
      this.checkpoints.delete(cpId);
    }

    this.sessionCheckpoints.delete(sessionId);
    this.sequenceCounter.delete(sessionId);

    this.emit("session:ended", { sessionId });
  }

  /**
   * Enforce max checkpoints limit
   */
  private async enforceMaxCheckpoints(sessionId: string): Promise<void> {
    const sessionCps = this.sessionCheckpoints.get(sessionId) || [];

    if (sessionCps.length > this.config.maxCheckpoints) {
      // Remove oldest auto-saved checkpoints
      const toRemove = sessionCps.length - this.config.maxCheckpoints;
      const checkpoints = await Promise.all(sessionCps.map((id) => this.config.storage.load(id)));

      const autoSaved = checkpoints
        .filter((cp): cp is Checkpoint => cp !== null && cp.metadata.createdBy === "auto")
        .sort((a, b) => a.timestamp - b.timestamp);

      for (let i = 0; i < Math.min(toRemove, autoSaved.length); i++) {
        await this.deleteCheckpoint(autoSaved[i].id);
      }
    }
  }

  /**
   * Calculate checkpoint size
   */
  private calculateSize(checkpoint: Checkpoint): number {
    return new Blob([JSON.stringify(checkpoint)]).size;
  }

  /**
   * Get session stats
   */
  getSessionStats(sessionId: string): {
    checkpointCount: number;
    oldestCheckpoint?: number;
    newestCheckpoint?: number;
    totalSizeBytes: number;
  } {
    const sessionCps = this.sessionCheckpoints.get(sessionId) || [];
    const checkpoints = sessionCps
      .map((id) => this.checkpoints.get(id))
      .filter((cp): cp is Checkpoint => cp !== undefined);

    return {
      checkpointCount: checkpoints.length,
      oldestCheckpoint: checkpoints[0]?.timestamp,
      newestCheckpoint: checkpoints[checkpoints.length - 1]?.timestamp,
      totalSizeBytes: checkpoints.reduce((sum, cp) => sum + cp.metadata.sizeBytes, 0),
    };
  }
}

export interface CheckpointDiff {
  fromCheckpointId: string;
  toCheckpointId: string;
  newActions: ActionRecord[];
  newMemory: MemoryEntry[];
  planProgress: number;
  timeDelta: number;
  urlChanged: boolean;
}

/**
 * Convenience function
 */
export function createCheckpointManager(config?: Partial<CheckpointConfig>): CheckpointManager {
  return new CheckpointManager(config);
}
