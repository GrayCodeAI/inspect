// ============================================================================
// @inspect/orchestrator - Agent State Store
// ============================================================================
// Persistent storage for agent runtime state with checkpoint/restore support

import * as fs from "node:fs";
import * as path from "node:path";
import { getCwd } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

// Agent state type (matches @inspect/agent definition)
export interface AgentState {
  agentId: string;
  step: number;
  stepIndex: number;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  messages: Array<{ role: string; content: string; timestamp?: number }>;
  actions: Array<Record<string, unknown>>;
  browserSnapshot?: string;
  cost: Record<string, unknown>;
  loopDetection: Record<string, unknown>;
  messageManager: Record<string, unknown>;
  lastActivityAt: number;
  createdAt: number;
  updatedAt: number;
  status: "active" | "paused" | "completed" | "failed" | "abandoned";
}

const logger = createLogger("orchestrator/agent-state-store");

/**
 * AgentStateStore manages disk persistence of agent runtime state.
 * Enables resume/recovery of interrupted multi-agent workflows.
 */
export class AgentStateStore {
  private basePath: string;
  private stateDir: string;
  private cache: Map<string, AgentState> = new Map();

  constructor(basePath: string = getCwd()) {
    this.basePath = basePath;
    this.stateDir = path.join(basePath, ".inspect", "agent-state");
    this.ensureDir();
  }

  /**
   * Save agent state to disk
   */
  save(state: AgentState): void {
    try {
      const filePath = this.getStatePath(state.agentId);
      const json = JSON.stringify(state, null, 2);
      fs.writeFileSync(filePath, json, "utf-8");
      this.cache.set(state.agentId, state);
      logger.debug(`Agent state saved: ${state.agentId}`, {
        step: state.step,
        totalSteps: state.totalSteps,
        completedSteps: state.completedSteps,
      });
    } catch (err) {
      logger.error(`Failed to save agent state ${state.agentId}: ${err}`);
    }
  }

  /**
   * Load agent state from disk
   */
  load(agentId: string): AgentState | undefined {
    // Check cache first
    if (this.cache.has(agentId)) {
      return this.cache.get(agentId);
    }

    try {
      const filePath = this.getStatePath(agentId);
      if (!fs.existsSync(filePath)) {
        return undefined;
      }

      const json = fs.readFileSync(filePath, "utf-8");
      const state = JSON.parse(json) as AgentState;
      this.cache.set(agentId, state);
      logger.debug(`Agent state loaded: ${agentId}`, {
        step: state.step,
        totalSteps: state.totalSteps,
      });
      return state;
    } catch (err) {
      logger.error(`Failed to load agent state ${agentId}: ${err}`);
      return undefined;
    }
  }

  /**
   * Delete agent state
   */
  delete(agentId: string): void {
    try {
      const filePath = this.getStatePath(agentId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.cache.delete(agentId);
        logger.debug(`Agent state deleted: ${agentId}`);
      }
    } catch (err) {
      logger.error(`Failed to delete agent state ${agentId}: ${err}`);
    }
  }

  /**
   * List all saved agent states
   */
  list(): string[] {
    try {
      if (!fs.existsSync(this.stateDir)) {
        return [];
      }

      const files = fs.readdirSync(this.stateDir);
      return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
    } catch (err) {
      logger.error(`Failed to list agent states: ${err}`);
      return [];
    }
  }

  /**
   * Clear all saved agent states
   */
  clear(): void {
    try {
      const states = this.list();
      for (const agentId of states) {
        this.delete(agentId);
      }
      this.cache.clear();
      logger.info(`Cleared ${states.length} agent states`);
    } catch (err) {
      logger.error(`Failed to clear agent states: ${err}`);
    }
  }

  /**
   * Get statistics about stored states
   */
  getStats(): {
    totalAgents: number;
    totalBytes: number;
    avgStateSize: number;
    recentlyModified: string[];
  } {
    try {
      const states = this.list();
      let totalBytes = 0;
      const recentlyModified: string[] = [];

      for (const agentId of states) {
        const filePath = this.getStatePath(agentId);
        const stat = fs.statSync(filePath);
        totalBytes += stat.size;

        // Get last 5 recently modified
        if (recentlyModified.length < 5) {
          recentlyModified.push(agentId);
        }
      }

      return {
        totalAgents: states.length,
        totalBytes,
        avgStateSize: states.length > 0 ? Math.round(totalBytes / states.length) : 0,
        recentlyModified,
      };
    } catch (err) {
      logger.error(`Failed to get stats: ${err}`);
      return { totalAgents: 0, totalBytes: 0, avgStateSize: 0, recentlyModified: [] };
    }
  }

  /**
   * Checkpoint a workflow step (for recovery)
   */
  checkpoint(agentId: string, step: number, state: AgentState): void {
    try {
      const checkpointPath = this.getCheckpointPath(agentId, step);
      const json = JSON.stringify(state, null, 2);
      fs.writeFileSync(checkpointPath, json, "utf-8");
      logger.debug(`Checkpoint created: ${agentId} step ${step}`);
    } catch (err) {
      logger.error(`Failed to create checkpoint ${agentId}:${step}: ${err}`);
    }
  }

  /**
   * Restore from checkpoint
   */
  restoreCheckpoint(agentId: string, step: number): AgentState | undefined {
    try {
      const checkpointPath = this.getCheckpointPath(agentId, step);
      if (!fs.existsSync(checkpointPath)) {
        return undefined;
      }

      const json = fs.readFileSync(checkpointPath, "utf-8");
      const state = JSON.parse(json) as AgentState;
      logger.info(`Restored from checkpoint: ${agentId} step ${step}`);
      return state;
    } catch (err) {
      logger.error(`Failed to restore checkpoint ${agentId}:${step}: ${err}`);
      return undefined;
    }
  }

  /**
   * Clean up old checkpoints (keep last N)
   */
  cleanupCheckpoints(agentId: string, keepCount: number = 5): void {
    try {
      const checkpointDir = path.join(this.stateDir, agentId, "checkpoints");
      if (!fs.existsSync(checkpointDir)) {
        return;
      }

      const files = fs.readdirSync(checkpointDir).sort((a, b) => {
        // Extract step numbers and sort descending
        const stepA = parseInt(a.replace("checkpoint-", "").replace(".json", ""));
        const stepB = parseInt(b.replace("checkpoint-", "").replace(".json", ""));
        return stepB - stepA;
      });

      // Delete old checkpoints
      for (let i = keepCount; i < files.length; i++) {
        const filePath = path.join(checkpointDir, files[i]);
        fs.unlinkSync(filePath);
      }

      if (files.length > keepCount) {
        logger.debug(`Cleaned up ${files.length - keepCount} old checkpoints for ${agentId}`);
      }
    } catch (err) {
      logger.error(`Failed to cleanup checkpoints ${agentId}: ${err}`);
    }
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private getStatePath(agentId: string): string {
    return path.join(this.stateDir, `${agentId}.json`);
  }

  private getCheckpointPath(agentId: string, step: number): string {
    const agentCheckpointDir = path.join(this.stateDir, agentId, "checkpoints");
    this.ensureDir(agentCheckpointDir);
    return path.join(agentCheckpointDir, `checkpoint-${step}.json`);
  }

  private ensureDir(dir: string = this.stateDir): void {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch (err) {
      if ((err as any).code !== "EEXIST") {
        throw err;
      }
    }
  }
}
