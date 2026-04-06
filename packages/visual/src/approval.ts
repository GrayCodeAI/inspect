// ============================================================================
// @inspect/visual - Approval Workflow
// ============================================================================

import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { createLogger } from "@inspect/observability";

const logger = createLogger("visual/approval");

/** Approval status for a visual diff */
export type ApprovalStatus = "pending" | "approved" | "rejected";

/** Approval entry */
export interface ApprovalEntry {
  /** Test identifier (e.g., "home-page-desktop") */
  testId: string;
  /** Approval status */
  status: ApprovalStatus;
  /** Mismatch percentage at time of capture */
  mismatchPercentage: number;
  /** Path to current (test) image */
  currentImagePath: string;
  /** Path to baseline image */
  baselineImagePath: string;
  /** Path to diff image (if generated) */
  diffImagePath?: string;
  /** Timestamp of the capture */
  capturedAt: number;
  /** Timestamp of the approval/rejection */
  reviewedAt?: number;
  /** Reviewer notes */
  notes?: string;
  /** URL of the tested page */
  url?: string;
  /** Viewport label */
  viewport?: string;
}

/** Approval workflow state */
interface ApprovalState {
  entries: Record<string, ApprovalEntry>;
  lastUpdated: number;
}

const DATA_DIR = ".inspect/visual";
const STATE_FILE = "approvals.json";

/**
 * ApprovalWorkflow manages the process of reviewing, approving,
 * and rejecting visual diffs before they become new baselines.
 */
export class ApprovalWorkflow {
  private readonly dataDir: string;
  private readonly statePath: string;

  constructor(baseDir?: string) {
    this.dataDir = baseDir ? join(baseDir, DATA_DIR) : DATA_DIR;
    this.statePath = join(this.dataDir, STATE_FILE);
  }

  /**
   * Add a new visual diff result for approval.
   */
  async addForReview(entry: Omit<ApprovalEntry, "status" | "reviewedAt">): Promise<void> {
    const state = await this.loadState();

    state.entries[entry.testId] = {
      ...entry,
      status: "pending",
    };
    state.lastUpdated = Date.now();

    await this.saveState(state);
  }

  /**
   * Approve a visual diff, copying the current image to become the new baseline.
   */
  async approve(testId: string, notes?: string): Promise<void> {
    const state = await this.loadState();
    const entry = state.entries[testId];

    if (!entry) {
      throw new Error(`No pending approval found for test: ${testId}`);
    }

    // Check if current image exists asynchronously
    try {
      await access(entry.currentImagePath);
    } catch {
      // Current image doesn't exist, skip copying
      return;
    }

    // Copy current image to baseline
    await mkdir(dirname(entry.baselineImagePath), { recursive: true });
    await copyFile(entry.currentImagePath, entry.baselineImagePath);

    // Update entry
    entry.status = "approved";
    entry.reviewedAt = Date.now();
    entry.notes = notes;
    state.lastUpdated = Date.now();

    await this.saveState(state);
  }

  /**
   * Approve all pending diffs at once.
   */
  async approveAll(notes?: string): Promise<number> {
    const state = await this.loadState();
    let count = 0;

    for (const [_testId, entry] of Object.entries(state.entries)) {
      if (entry.status === "pending") {
        // Check if current image exists asynchronously
        try {
          await access(entry.currentImagePath);
        } catch {
          // Current image doesn't exist, skip this entry
          continue;
        }

        await mkdir(dirname(entry.baselineImagePath), { recursive: true });
        await copyFile(entry.currentImagePath, entry.baselineImagePath);

        entry.status = "approved";
        entry.reviewedAt = Date.now();
        entry.notes = notes ?? "Bulk approved";
        count++;
      }
    }

    state.lastUpdated = Date.now();
    await this.saveState(state);
    return count;
  }

  /**
   * Reject a visual diff, marking it for developer action.
   */
  async reject(testId: string, notes?: string): Promise<void> {
    const state = await this.loadState();
    const entry = state.entries[testId];

    if (!entry) {
      throw new Error(`No pending approval found for test: ${testId}`);
    }

    entry.status = "rejected";
    entry.reviewedAt = Date.now();
    entry.notes = notes;
    state.lastUpdated = Date.now();

    await this.saveState(state);
  }

  /**
   * List all pending visual diffs that need review.
   */
  async listPending(): Promise<ApprovalEntry[]> {
    const state = await this.loadState();
    return Object.values(state.entries).filter((e) => e.status === "pending");
  }

  /**
   * List all entries (pending, approved, rejected).
   */
  async listAll(): Promise<ApprovalEntry[]> {
    const state = await this.loadState();
    return Object.values(state.entries);
  }

  /**
   * List rejected entries.
   */
  async listRejected(): Promise<ApprovalEntry[]> {
    const state = await this.loadState();
    return Object.values(state.entries).filter((e) => e.status === "rejected");
  }

  /**
   * Get a single approval entry by test ID.
   */
  async get(testId: string): Promise<ApprovalEntry | null> {
    const state = await this.loadState();
    return state.entries[testId] ?? null;
  }

  /**
   * Reset a rejected entry back to pending.
   */
  async resetToPending(testId: string): Promise<void> {
    const state = await this.loadState();
    const entry = state.entries[testId];

    if (!entry) {
      throw new Error(`No approval found for test: ${testId}`);
    }

    entry.status = "pending";
    entry.reviewedAt = undefined;
    entry.notes = undefined;
    state.lastUpdated = Date.now();

    await this.saveState(state);
  }

  /**
   * Remove an entry from the workflow.
   */
  async remove(testId: string): Promise<void> {
    const state = await this.loadState();
    delete state.entries[testId];
    state.lastUpdated = Date.now();
    await this.saveState(state);
  }

  /**
   * Clear all resolved (approved + rejected) entries.
   */
  async clearResolved(): Promise<number> {
    const state = await this.loadState();
    let count = 0;

    for (const [testId, entry] of Object.entries(state.entries)) {
      if (entry.status !== "pending") {
        delete state.entries[testId];
        count++;
      }
    }

    state.lastUpdated = Date.now();
    await this.saveState(state);
    return count;
  }

  /**
   * Clear all entries.
   */
  async clearAll(): Promise<void> {
    const state: ApprovalState = { entries: {}, lastUpdated: Date.now() };
    await this.saveState(state);
  }

  /**
   * Get summary statistics.
   */
  async getSummary(): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  }> {
    const state = await this.loadState();
    const entries = Object.values(state.entries);

    return {
      pending: entries.filter((e) => e.status === "pending").length,
      approved: entries.filter((e) => e.status === "approved").length,
      rejected: entries.filter((e) => e.status === "rejected").length,
      total: entries.length,
    };
  }

  /**
   * Check if a baseline exists for a test.
   */
  async baselineExists(baselinePath: string): Promise<boolean> {
    try {
      await access(baselinePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load approval state from disk.
   */
  private async loadState(): Promise<ApprovalState> {
    try {
      const content = await readFile(this.statePath, "utf-8");
      return JSON.parse(content) as ApprovalState;
    } catch (error) {
      logger.debug("Failed to load approval state, starting fresh", { error });
      return { entries: {}, lastUpdated: Date.now() };
    }
  }

  /**
   * Save approval state to disk.
   */
  private async saveState(state: ApprovalState): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.statePath, JSON.stringify(state, null, 2), "utf-8");
  }
}
