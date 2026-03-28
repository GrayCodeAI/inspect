// ============================================================================
// @inspect/workflow - Workflow Scheduler
// ============================================================================

import * as fs from "node:fs";
import * as path from "node:path";
import { generateId } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("workflow/scheduler");

/** Scheduled workflow entry */
export interface ScheduledWorkflow {
  id: string;
  workflowId: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt?: number;
  nextRunAt?: number;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

/** Callback invoked when a scheduled workflow fires */
export type ScheduleCallback = (
  workflowId: string,
  scheduleId: string,
) => void | Promise<void>;

/**
 * WorkflowScheduler manages cron-based scheduling of workflows.
 * Persists schedules to .inspect/schedules/ for durability across restarts.
 * Uses node-cron for cron expression parsing and scheduling.
 */
export class WorkflowScheduler {
  private schedules: Map<string, ScheduledWorkflow> = new Map();
  private cronTasks: Map<string, { stop: () => void }> = new Map();
  private schedulesDir: string;
  private callback?: ScheduleCallback;
  private cronModule: {
    schedule: (
      expr: string,
      fn: () => void,
      opts?: Record<string, unknown>,
    ) => { stop: () => void };
    validate: (expr: string) => boolean;
  } | null = null;

  constructor(
    basePath: string = process.cwd(),
    callback?: ScheduleCallback,
  ) {
    this.schedulesDir = path.join(basePath, ".inspect", "schedules");
    this.callback = callback;
    this.ensureDir(this.schedulesDir);
    this.loadSchedules();
  }

  /**
   * Schedule a workflow with a cron expression.
   *
   * @param workflowId - The workflow to schedule
   * @param cronExpression - Cron expression (e.g., "0 9 * * MON-FRI")
   * @param metadata - Optional metadata to attach
   * @returns The created schedule entry
   */
  async schedule(
    workflowId: string,
    cronExpression: string,
    metadata?: Record<string, unknown>,
  ): Promise<ScheduledWorkflow> {
    // Validate cron expression
    const cron = await this.getCronModule();
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const id = generateId();
    const entry: ScheduledWorkflow = {
      id,
      workflowId,
      cronExpression,
      enabled: true,
      createdAt: Date.now(),
      nextRunAt: this.getNextRunTime(cronExpression),
      metadata,
    };

    this.schedules.set(id, entry);
    this.persistSchedule(entry);
    this.startCronTask(entry);

    return entry;
  }

  /**
   * Remove a scheduled workflow.
   */
  unschedule(id: string): boolean {
    const entry = this.schedules.get(id);
    if (!entry) return false;

    // Stop the cron task
    const task = this.cronTasks.get(id);
    if (task) {
      task.stop();
      this.cronTasks.delete(id);
    }

    this.schedules.delete(id);
    this.removeScheduleFile(id);
    return true;
  }

  /**
   * List all scheduled workflows.
   */
  listScheduled(): ScheduledWorkflow[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Get a specific schedule by ID.
   */
  getSchedule(id: string): ScheduledWorkflow | undefined {
    return this.schedules.get(id);
  }

  /**
   * Enable or disable a schedule.
   */
  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    const entry = this.schedules.get(id);
    if (!entry) return false;

    entry.enabled = enabled;
    this.persistSchedule(entry);

    if (enabled) {
      this.startCronTask(entry);
    } else {
      const task = this.cronTasks.get(id);
      if (task) {
        task.stop();
        this.cronTasks.delete(id);
      }
    }

    return true;
  }

  /**
   * Update the cron expression for a schedule.
   */
  async updateCron(
    id: string,
    cronExpression: string,
  ): Promise<ScheduledWorkflow | null> {
    const cron = await this.getCronModule();
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const entry = this.schedules.get(id);
    if (!entry) return null;

    // Stop existing task
    const task = this.cronTasks.get(id);
    if (task) {
      task.stop();
      this.cronTasks.delete(id);
    }

    entry.cronExpression = cronExpression;
    entry.nextRunAt = this.getNextRunTime(cronExpression);
    this.persistSchedule(entry);

    if (entry.enabled) {
      this.startCronTask(entry);
    }

    return entry;
  }

  /**
   * Get schedules for a specific workflow.
   */
  getSchedulesForWorkflow(workflowId: string): ScheduledWorkflow[] {
    return Array.from(this.schedules.values()).filter(
      (s) => s.workflowId === workflowId,
    );
  }

  /**
   * Stop all cron tasks and clean up.
   */
  destroy(): void {
    for (const task of this.cronTasks.values()) {
      task.stop();
    }
    this.cronTasks.clear();
  }

  /**
   * Restart all enabled schedules (e.g., after app restart).
   */
  async restartAll(): Promise<number> {
    let count = 0;
    for (const entry of this.schedules.values()) {
      if (entry.enabled) {
        this.startCronTask(entry);
        count++;
      }
    }
    return count;
  }

  /**
   * Lazy-load the node-cron module.
   */
  private async getCronModule(): Promise<{
    schedule: (
      expr: string,
      fn: () => void,
      opts?: Record<string, unknown>,
    ) => { stop: () => void };
    validate: (expr: string) => boolean;
  }> {
    if (!this.cronModule) {
      try {
        // @ts-ignore - node-cron has no type declarations
        this.cronModule = await import("node-cron");
      } catch (error) {
        logger.debug("node-cron not available, using fallback", { error });
        this.cronModule = this.createFallbackCron();
      }
    }
    return this.cronModule!;
  }

  /**
   * Start a cron task for a schedule entry.
   */
  private async startCronTask(entry: ScheduledWorkflow): Promise<void> {
    // Stop existing task if any
    const existing = this.cronTasks.get(entry.id);
    if (existing) {
      existing.stop();
    }

    try {
      const cron = await this.getCronModule();
      const task = cron.schedule(
        entry.cronExpression,
        () => {
          entry.lastRunAt = Date.now();
          entry.nextRunAt = this.getNextRunTime(entry.cronExpression);
          this.persistSchedule(entry);

          if (this.callback) {
            Promise.resolve(this.callback(entry.workflowId, entry.id)).catch(
              (err) => {
                logger.error("Schedule callback failed", {
                  scheduleId: entry.id,
                  error: err,
                });
              },
            );
          }
        },
        { scheduled: true },
      );

      this.cronTasks.set(entry.id, task);
    } catch (err) {
      logger.error("Failed to start cron task", { scheduleId: entry.id, error: err });
    }
  }

  /**
   * Calculate approximate next run time from a cron expression.
   * This is a simplified calculation for display purposes.
   */
  private getNextRunTime(cronExpression: string): number {
    // Parse cron fields: minute hour day month weekday
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 5) return Date.now() + 60_000;

    const now = new Date();
    const next = new Date(now);

    // Simple approximation: advance to next matching minute
    const minute = parts[0];
    const hour = parts[1];

    if (minute !== "*" && hour !== "*") {
      const targetMinute = parseInt(minute, 10);
      const targetHour = parseInt(hour, 10);

      next.setHours(targetHour, targetMinute, 0, 0);
      if (next.getTime() <= now.getTime()) {
        next.setDate(next.getDate() + 1);
      }
    } else if (minute !== "*") {
      const targetMinute = parseInt(minute, 10);
      next.setMinutes(targetMinute, 0, 0);
      if (next.getTime() <= now.getTime()) {
        next.setHours(next.getHours() + 1);
      }
    } else {
      // Advance by one minute
      next.setTime(now.getTime() + 60_000);
    }

    return next.getTime();
  }

  /**
   * Persist a schedule entry to disk.
   */
  private persistSchedule(entry: ScheduledWorkflow): void {
    try {
      const filePath = path.join(this.schedulesDir, `${entry.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");
    } catch (err) {
      logger.error("Failed to persist schedule", { scheduleId: entry.id, error: err });
    }
  }

  /**
   * Remove a schedule file from disk.
   */
  private removeScheduleFile(id: string): void {
    try {
      const filePath = path.join(this.schedulesDir, `${id}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      logger.debug("Failed to remove schedule file", { id, error });
    }
  }

  /**
   * Load persisted schedules from disk.
   */
  private loadSchedules(): void {
    try {
      if (!fs.existsSync(this.schedulesDir)) return;

      const files = fs.readdirSync(this.schedulesDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const filePath = path.join(this.schedulesDir, file);
          const data = fs.readFileSync(filePath, "utf-8");
          const entry = JSON.parse(data) as ScheduledWorkflow;
          this.schedules.set(entry.id, entry);
        } catch (error) {
          logger.debug("Skipping corrupt schedule file", { file, error });
        }
      }
    } catch (error) {
      logger.debug("Failed to load schedules directory", { error });
    }
  }

  /**
   * Ensure a directory exists.
   */
  private ensureDir(dir: string): void {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      logger.debug("Failed to create directory", { dir, error });
    }
  }

  /**
   * Create a minimal fallback cron implementation when node-cron is not available.
   */
  private createFallbackCron(): {
    schedule: (
      expr: string,
      fn: () => void,
      opts?: Record<string, unknown>,
    ) => { stop: () => void };
    validate: (expr: string) => boolean;
  } {
    return {
      validate: (expr: string): boolean => {
        const parts = expr.trim().split(/\s+/);
        return parts.length >= 5 && parts.length <= 6;
      },
      schedule: (
        _expr: string,
        fn: () => void,
        _opts?: Record<string, unknown>,
      ): { stop: () => void } => {
        // Simple interval-based fallback (every minute check)
        const interval = setInterval(() => {
          fn();
        }, 60_000);

        return {
          stop: () => clearInterval(interval),
        };
      },
    };
  }
}
