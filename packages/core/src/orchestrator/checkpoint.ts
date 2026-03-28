// ============================================================================
// @inspect/core - Session Checkpoint & Resume
//
// Saves agent state after each step for crash recovery.
// On restart, detects incomplete runs and resumes from last checkpoint.
// Inspired by Browser Use's injected_agent_state and session resume.
// ============================================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export interface CheckpointData {
  /** Unique run ID */
  runId: string;
  /** URL being tested */
  url: string;
  /** Test instruction */
  instruction: string;
  /** Current step index */
  stepIndex: number;
  /** Total planned steps */
  totalSteps: number;
  /** Completed steps with results */
  completedSteps: CheckpointStep[];
  /** Browser state */
  browserState: {
    currentUrl: string;
    title: string;
  };
  /** Token usage so far */
  tokenUsage: number;
  /** Agent config */
  config: Record<string, unknown>;
  /** Timestamp */
  savedAt: number;
  /** Status */
  status: "in-progress" | "completed" | "failed" | "abandoned";
}

export interface CheckpointStep {
  index: number;
  description: string;
  action: string;
  status: "pass" | "fail" | "skipped";
  duration: number;
}

/**
 * CheckpointManager saves and restores agent state for crash recovery.
 */
export class CheckpointManager {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? join(process.cwd(), ".inspect", "checkpoints");
  }

  /**
   * Save a checkpoint after a step completes.
   */
  save(data: CheckpointData): void {
    try {
      if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
      writeFileSync(
        join(this.dir, `${data.runId}.json`),
        JSON.stringify(data, null, 2),
      );
    } catch {}
  }

  /**
   * Load the most recent incomplete checkpoint.
   */
  getIncomplete(): CheckpointData | null {
    try {
      if (!existsSync(this.dir)) return null;
      const files = readdirSync(this.dir).filter((f) => f.endsWith(".json"));

      let latest: CheckpointData | null = null;
      for (const file of files) {
        try {
          const data = JSON.parse(readFileSync(join(this.dir, file), "utf-8")) as CheckpointData;
          if (data.status === "in-progress") {
            if (!latest || data.savedAt > latest.savedAt) {
              latest = data;
            }
          }
        } catch {}
      }
      return latest;
    } catch {
      return null;
    }
  }

  /**
   * Load a specific checkpoint by run ID.
   */
  get(runId: string): CheckpointData | null {
    const path = join(this.dir, `${runId}.json`);
    try {
      if (!existsSync(path)) return null;
      return JSON.parse(readFileSync(path, "utf-8")) as CheckpointData;
    } catch {
      return null;
    }
  }

  /**
   * Mark a checkpoint as completed.
   */
  markCompleted(runId: string): void {
    const data = this.get(runId);
    if (data) {
      data.status = "completed";
      this.save(data);
    }
  }

  /**
   * Mark a checkpoint as failed.
   */
  markFailed(runId: string): void {
    const data = this.get(runId);
    if (data) {
      data.status = "failed";
      this.save(data);
    }
  }

  /**
   * Mark as abandoned (user cancelled or timeout).
   */
  markAbandoned(runId: string): void {
    const data = this.get(runId);
    if (data) {
      data.status = "abandoned";
      this.save(data);
    }
  }

  /**
   * Clean up old checkpoints (keep last N).
   */
  cleanup(keep = 10): void {
    try {
      if (!existsSync(this.dir)) return;
      const files = readdirSync(this.dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          try {
            const data = JSON.parse(readFileSync(join(this.dir, f), "utf-8")) as CheckpointData;
            return { file: f, savedAt: data.savedAt, status: data.status };
          } catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => b!.savedAt - a!.savedAt) as Array<{ file: string; savedAt: number; status: string }>;

      // Keep `keep` most recent, delete the rest (but only completed/failed/abandoned)
      for (const item of files.slice(keep)) {
        if (item.status !== "in-progress") {
          try { unlinkSync(join(this.dir, item.file)); } catch {}
        }
      }
    } catch {}
  }

  /**
   * List all checkpoints.
   */
  list(): Array<{ runId: string; url: string; status: string; stepIndex: number; savedAt: number }> {
    try {
      if (!existsSync(this.dir)) return [];
      return readdirSync(this.dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          try {
            const data = JSON.parse(readFileSync(join(this.dir, f), "utf-8")) as CheckpointData;
            return { runId: data.runId, url: data.url, status: data.status, stepIndex: data.stepIndex, savedAt: data.savedAt };
          } catch { return null; }
        })
        .filter(Boolean) as any[];
    } catch { return []; }
  }
}
