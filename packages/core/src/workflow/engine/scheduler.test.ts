import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorkflowScheduler } from "./scheduler.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("WorkflowScheduler", () => {
  let tmpDir: string;
  let scheduler: WorkflowScheduler;
  let callbackCalls: Array<{ workflowId: string; scheduleId: string }>;
  let callback: (workflowId: string, scheduleId: string) => void;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-test-"));
    callbackCalls = [];
    callback = (workflowId, scheduleId) => {
      callbackCalls.push({ workflowId, scheduleId });
    };
    scheduler = new WorkflowScheduler(tmpDir, callback);
  });

  afterEach(() => {
    scheduler.destroy();
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("schedule", () => {
    it("creates a new schedule entry", async () => {
      const entry = await scheduler.schedule("wf-1", "0 9 * * *");

      expect(entry.id).toBeDefined();
      expect(entry.workflowId).toBe("wf-1");
      expect(entry.cronExpression).toBe("0 9 * * *");
      expect(entry.enabled).toBe(true);
      expect(entry.createdAt).toBeGreaterThan(0);
    });

    it("attaches metadata to schedule", async () => {
      const meta = { env: "production", priority: "high" };
      const entry = await scheduler.schedule("wf-2", "*/5 * * * *", meta);

      expect(entry.metadata).toEqual(meta);
    });

    it("rejects invalid cron expressions", async () => {
      await expect(scheduler.schedule("wf-1", "not a cron")).rejects.toThrow(
        "Invalid cron expression",
      );
    });

    it("calculates nextRunAt", async () => {
      const entry = await scheduler.schedule("wf-1", "30 14 * * *");

      expect(entry.nextRunAt).toBeDefined();
      expect(entry.nextRunAt).toBeGreaterThan(0);
    });
  });

  describe("listScheduled / getSchedule", () => {
    it("lists all scheduled workflows", async () => {
      await scheduler.schedule("wf-1", "0 9 * * *");
      await scheduler.schedule("wf-2", "0 17 * * *");

      const list = scheduler.listScheduled();
      expect(list).toHaveLength(2);
      expect(list.map((s) => s.workflowId).sort()).toEqual(["wf-1", "wf-2"]);
    });

    it("retrieves a specific schedule by ID", async () => {
      const created = await scheduler.schedule("wf-1", "0 9 * * *");
      const fetched = scheduler.getSchedule(created.id);

      expect(fetched).toBeDefined();
      expect(fetched!.workflowId).toBe("wf-1");
    });

    it("returns undefined for non-existent schedule", () => {
      const fetched = scheduler.getSchedule("nonexistent-id");

      expect(fetched).toBeUndefined();
    });
  });

  describe("unschedule", () => {
    it("removes a scheduled workflow", async () => {
      const entry = await scheduler.schedule("wf-1", "0 9 * * *");

      const removed = scheduler.unschedule(entry.id);
      expect(removed).toBe(true);
      expect(scheduler.listScheduled()).toHaveLength(0);
    });

    it("returns false when unscheduling non-existent ID", () => {
      const removed = scheduler.unschedule("nonexistent-id");

      expect(removed).toBe(false);
    });
  });

  describe("setEnabled", () => {
    it("disables a schedule", async () => {
      const entry = await scheduler.schedule("wf-1", "0 9 * * *");

      const result = await scheduler.setEnabled(entry.id, false);
      expect(result).toBe(true);

      const updated = scheduler.getSchedule(entry.id);
      expect(updated!.enabled).toBe(false);
    });

    it("re-enables a disabled schedule", async () => {
      const entry = await scheduler.schedule("wf-1", "0 9 * * *");
      await scheduler.setEnabled(entry.id, false);
      await scheduler.setEnabled(entry.id, true);

      const updated = scheduler.getSchedule(entry.id);
      expect(updated!.enabled).toBe(true);
    });

    it("returns false for non-existent schedule", async () => {
      const result = await scheduler.setEnabled("nonexistent", true);

      expect(result).toBe(false);
    });
  });

  describe("updateCron", () => {
    it("updates the cron expression of an existing schedule", async () => {
      const entry = await scheduler.schedule("wf-1", "0 9 * * *");
      const updated = await scheduler.updateCron(entry.id, "30 18 * * *");

      expect(updated).not.toBeNull();
      expect(updated!.cronExpression).toBe("30 18 * * *");
    });

    it("returns null for non-existent schedule", async () => {
      const result = await scheduler.updateCron("nonexistent", "0 9 * * *");

      expect(result).toBeNull();
    });

    it("rejects invalid cron on update", async () => {
      const entry = await scheduler.schedule("wf-1", "0 9 * * *");

      await expect(scheduler.updateCron(entry.id, "bad")).rejects.toThrow(
        "Invalid cron expression",
      );
    });
  });

  describe("getSchedulesForWorkflow", () => {
    it("filters schedules by workflow ID", async () => {
      await scheduler.schedule("wf-1", "0 9 * * *");
      await scheduler.schedule("wf-2", "0 12 * * *");
      await scheduler.schedule("wf-1", "0 18 * * *");

      const wf1Schedules = scheduler.getSchedulesForWorkflow("wf-1");
      expect(wf1Schedules).toHaveLength(2);
      expect(wf1Schedules.every((s) => s.workflowId === "wf-1")).toBe(true);
    });

    it("returns empty array when workflow has no schedules", () => {
      const result = scheduler.getSchedulesForWorkflow("nonexistent");

      expect(result).toEqual([]);
    });
  });

  describe("persistence", () => {
    it("persists schedule files to disk", async () => {
      const entry = await scheduler.schedule("wf-1", "0 9 * * *");
      const filePath = path.join(tmpDir, ".inspect", "schedules", `${entry.id}.json`);

      expect(fs.existsSync(filePath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      expect(data.workflowId).toBe("wf-1");
    });

    it("removes schedule file on unschedule", async () => {
      const entry = await scheduler.schedule("wf-1", "0 9 * * *");
      const filePath = path.join(tmpDir, ".inspect", "schedules", `${entry.id}.json`);

      scheduler.unschedule(entry.id);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it("loads persisted schedules on new instance creation", async () => {
      const entry = await scheduler.schedule("wf-1", "0 9 * * *");
      scheduler.destroy();

      // Create a new scheduler pointing to the same directory
      const scheduler2 = new WorkflowScheduler(tmpDir);
      const loaded = scheduler2.getSchedule(entry.id);

      expect(loaded).toBeDefined();
      expect(loaded!.workflowId).toBe("wf-1");
      scheduler2.destroy();
    });
  });

  describe("destroy", () => {
    it("stops all cron tasks", async () => {
      await scheduler.schedule("wf-1", "0 9 * * *");
      await scheduler.schedule("wf-2", "0 18 * * *");

      // Should not throw
      scheduler.destroy();

      // Schedules are still listed (in memory) but tasks are stopped
      expect(scheduler.listScheduled()).toHaveLength(2);
    });
  });
});
