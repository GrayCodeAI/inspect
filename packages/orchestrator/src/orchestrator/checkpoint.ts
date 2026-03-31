// ============================================================================
// @inspect/core - Session Checkpoint & Resume
//
// Saves agent state after each step for crash recovery.
// On restart, detects incomplete runs and resumes from last checkpoint.
// Inspired by Browser Use's injected_agent_state and session resume.
// ============================================================================

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@inspect/observability";

const logger = createLogger("core/checkpoint");

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
  async save(data: CheckpointData): Promise<void> {
    try {
      if (!existsSync(this.dir)) await mkdir(this.dir, { recursive: true });
      await writeFile(
        join(this.dir, `${data.runId}.json`),
        JSON.stringify(data, null, 2),
      );
    } catch (error) {
      logger.warn("Failed to save checkpoint", { runId: data.runId, err: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Load the most recent incomplete checkpoint.
   */
  async getIncomplete(): Promise<CheckpointData | null> {
    try {
      if (!existsSync(this.dir)) return null;
      const files = (await readdir(this.dir)).filter((f) => f.endsWith(".json"));

      let latest: CheckpointData | null = null;
      for (const file of files) {
        try {
          const data = JSON.parse(await readFile(join(this.dir, file), "utf-8")) as CheckpointData;
          if (data.status === "in-progress") {
            if (!latest || data.savedAt > latest.savedAt) {
              latest = data;
            }
          }
        } catch (error) {
          logger.debug("Failed to read checkpoint file", { file, err: error instanceof Error ? error.message : String(error) });
        }
      }
      return latest;
    } catch (error) {
      logger.debug("Failed to scan checkpoints directory", { err: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Load a specific checkpoint by run ID.
   */
  async get(runId: string): Promise<CheckpointData | null> {
    const path = join(this.dir, `${runId}.json`);
    try {
      if (!existsSync(path)) return null;
      return JSON.parse(await readFile(path, "utf-8")) as CheckpointData;
    } catch (error) {
      logger.debug("Failed to read checkpoint", { runId, err: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Mark a checkpoint as completed.
   */
  async markCompleted(runId: string): Promise<void> {
    const data = await this.get(runId);
    if (data) {
      data.status = "completed";
      await this.save(data);
    }
  }

  /**
   * Mark a checkpoint as failed.
   */
  async markFailed(runId: string): Promise<void> {
    const data = await this.get(runId);
    if (data) {
      data.status = "failed";
      await this.save(data);
    }
  }

  /**
   * Mark as abandoned (user cancelled or timeout).
   */
  async markAbandoned(runId: string): Promise<void> {
    const data = await this.get(runId);
    if (data) {
      data.status = "abandoned";
      await this.save(data);
    }
  }

  /**
   * Clean up old checkpoints (keep last N).
   */
  async cleanup(keep = 10): Promise<void> {
    try {
      if (!existsSync(this.dir)) return;
      const fileNames = (await readdir(this.dir)).filter((f) => f.endsWith(".json"));

      const parsed = await Promise.all(
        fileNames.map(async (f) => {
          try {
            const data = JSON.parse(await readFile(join(this.dir, f), "utf-8")) as CheckpointData;
            return { file: f, savedAt: data.savedAt, status: data.status };
          } catch (error) {
            logger.debug("Failed to parse checkpoint for cleanup", { file: f, err: error instanceof Error ? error.message : String(error) });
            return null;
          }
        }),
      );

      const files = parsed
        .filter(Boolean)
        .sort((a, b) => b!.savedAt - a!.savedAt) as Array<{ file: string; savedAt: number; status: string }>;

      // Keep `keep` most recent, delete the rest (but only completed/failed/abandoned)
      for (const item of files.slice(keep)) {
        if (item.status !== "in-progress") {
          try { await unlink(join(this.dir, item.file)); } catch (error) {
            logger.debug("Failed to delete old checkpoint", { file: item.file, err: error instanceof Error ? error.message : String(error) });
          }
        }
      }
    } catch (error) {
      logger.warn("Checkpoint cleanup failed", { err: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * List all checkpoints.
   */
  async list(): Promise<Array<{ runId: string; url: string; status: string; stepIndex: number; savedAt: number }>> {
    try {
      if (!existsSync(this.dir)) return [];
      const fileNames = (await readdir(this.dir)).filter((f) => f.endsWith(".json"));

      const parsed = await Promise.all(
        fileNames.map(async (f) => {
          try {
            const data = JSON.parse(await readFile(join(this.dir, f), "utf-8")) as CheckpointData;
            return { runId: data.runId, url: data.url, status: data.status, stepIndex: data.stepIndex, savedAt: data.savedAt };
          } catch (error) {
            logger.debug("Failed to parse checkpoint for listing", { file: f, err: error instanceof Error ? error.message : String(error) });
            return null;
          }
        }),
      );

      return parsed.filter(Boolean) as Array<{ runId: string; url: string; status: string; stepIndex: number; savedAt: number }>;
    } catch (error) {
      logger.debug("Failed to list checkpoints", { err: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }
}
