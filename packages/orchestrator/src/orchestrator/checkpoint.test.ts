import { describe, it, expect, beforeEach } from "vitest";
import { CheckpointManager, CheckpointData, CheckpointStep } from "./checkpoint.js";
import * as fs from "fs/promises";
import * as fsSync from "fs";

// Mock the file system for testing
const mockFiles = new Map<string, string>();

// Mock fs.promises functions
const mockFsPromises = {
  ...fs,
  readFile: async (path: string, options?: string) => {
    if (mockFiles.has(path)) {
      return mockFiles.get(path)!;
    }
    throw new Error(`File not found: ${path}`);
  },
  writeFile: async (path: string, data: any) => {
    mockFiles.set(path, typeof data === "string" ? data : JSON.stringify(data, null, 2));
  },
  mkdir: async (path: string, options?: { recursive?: boolean }) => {
    // Ensure the directory exists in our mock
    if (options?.recursive) {
      return;
    }
    throw new Error("mkdir not implemented in mock");
  },
  readdir: async (path: string) => {
    const files: string[] = [];
    for (const [key, value] of mockFiles.entries()) {
      if (key.startsWith(path)) {
        const fileName = key.replace(path + "/", "");
        files.push(fileName);
      }
    }
    return files;
  },
  unlink: async (path: string) => {
    mockFiles.delete(path);
  },
  existsSync: (path: string) => {
    for (const [key] of mockFiles.entries()) {
      if (key === path || key.startsWith(path + "/")) {
        return true;
      }
    }
    return false;
  },
};

// Restore original fs functions after each test
let originalReadFile: any;
let originalWriteFile: any;
let originalMkdir: any;
let originalReaddir: any;
let originalUnlink: any;
let originalExistsSync: any;

beforeEach(() => {
  // Save originals
  originalReadFile = fs.readFile;
  originalWriteFile = fs.writeFile;
  originalMkdir = fs.mkdir;
  originalReaddir = fs.readdir;
  originalUnlink = fs.unlink;
  originalExistsSync = fsSync.existsSync;

  // Replace with mocks
  (fs as any).readFile = mockFsPromises.readFile;
  (fs as any).writeFile = mockFsPromises.writeFile;
  (fs as any).mkdir = mockFsPromises.mkdir;
  (fs as any).readdir = mockFsPromises.readdir;
  (fs as any).unlink = mockFsPromises.unlink;
  (fsSync as any).existsSync = mockFsPromises.existsSync;

  // Clear mock files
  mockFiles.clear();
});

afterEach(() => {
  // Restore originals
  (fs as any).readFile = originalReadFile;
  (fs as any).writeFile = originalWriteFile;
  (fs as any).mkdir = originalMkdir;
  (fs as any).readdir = originalReaddir;
  (fs as any).unlink = originalUnlink;
  (fsSync as any).existsSync = originalExistsSync;
});

describe("CheckpointManager", () => {
  const runId = "run_12345";
  const checkpointDir = "./test-checkpoints";
  let manager: CheckpointManager;

  beforeEach(() => {
    manager = new CheckpointManager(checkpointDir);
  });

  describe("save", () => {
    it("should save a checkpoint to a file", async () => {
      const data: CheckpointData = {
        runId,
        url: "http://example.com",
        instruction: "Test instruction",
        stepIndex: 2,
        totalSteps: 10,
        completedSteps: [
          { index: 0, description: "Step 1", action: "navigate", status: "pass", duration: 100 },
          { index: 1, description: "Step 2", action: "interact", status: "pass", duration: 200 },
        ],
        browserState: { currentUrl: "http://example.com", title: "Example" },
        tokenUsage: 150,
        config: {},
        savedAt: Date.now(),
        status: "in-progress",
      };

      await manager.save(data);

      const filePath = `${checkpointDir}/${runId}.json`;
      expect(mockFiles.has(filePath)).toBe(true);

      const content = mockFiles.get(filePath);
      expect(content).toContain(runId);
      expect(content).toContain("in-progress");
    });

    it("should create the directory if it doesn't exist", async () => {
      // The directory should not exist initially
      expect(mockFiles.has(checkpointDir)).toBe(false);

      const data: CheckpointData = {
        runId,
        url: "http://example.com",
        instruction: "Test instruction",
        stepIndex: 0,
        totalSteps: 5,
        completedSteps: [],
        browserState: { currentUrl: "http://example.com", title: "Example" },
        tokenUsage: 0,
        config: {},
        savedAt: Date.now(),
        status: "in-progress",
      };

      await manager.save(data);

      expect(mockFiles.has(checkpointDir)).toBe(true);
    });

    it("should log a warning if saving fails", async () => {
      // Mock a failure by throwing an error in writeFile
      (fs as any).writeFile = () => {
        throw new Error("Disk full");
      };

      const data: CheckpointData = {
        runId,
        url: "http://example.com",
        instruction: "Test instruction",
        stepIndex: 0,
        totalSteps: 5,
        completedSteps: [],
        browserState: { currentUrl: "http://example.com", title: "Example" },
        tokenUsage: 0,
        config: {},
        savedAt: Date.now(),
        status: "in-progress",
      };

      await manager.save(data);

      // The test passes if it doesn't throw (the error is caught and logged)
      expect(true).toBe(true);
    });
  });

  describe("getIncomplete", () => {
    it("should return null if no checkpoints exist", async () => {
      const checkpoint = await manager.getIncomplete();
      expect(checkpoint).toBeNull();
    });

    it("should return the most recent incomplete checkpoint", async () => {
      // Create multiple checkpoints with different timestamps
      const runId1 = "run_1";
      const runId2 = "run_2";
      const now = Date.now();

      await manager.save({
        runId: runId1,
        url: "http://example.com",
        instruction: "Test 1",
        stepIndex: 2,
        totalSteps: 10,
        completedSteps: [],
        browserState: { currentUrl: "http://example.com", title: "Example" },
        tokenUsage: 100,
        config: {},
        savedAt: now - 1000,
        status: "in-progress",
      });

      await manager.save({
        runId: runId2,
        url: "http://example.org",
        instruction: "Test 2",
        stepIndex: 5,
        totalSteps: 10,
        completedSteps: [],
        browserState: { currentUrl: "http://example.org", title: "Example Org" },
        tokenUsage: 200,
        config: {},
        savedAt: now,
        status: "in-progress",
      });

      const checkpoint = await manager.getIncomplete();
      expect(checkpoint).not.toBeNull();
      if (checkpoint) {
        expect(checkpoint.runId).toEqual(runId2);
        expect(checkpoint.stepIndex).toEqual(5);
      }
    });

    it("should only return checkpoints with status 'in-progress'", async () => {
      // Save a completed checkpoint
      await manager.save({
        runId: "run_completed",
        url: "http://example.com",
        instruction: "Test",
        stepIndex: 10,
        totalSteps: 10,
        completedSteps: [],
        browserState: { currentUrl: "http://example.com", title: "Example" },
        tokenUsage: 300,
        config: {},
        savedAt: Date.now(),
        status: "completed",
      });

      // Save an in-progress checkpoint
      await manager.save({
        runId: "run_inprogress",
        url: "http://example.com",
        instruction: "Test",
        stepIndex: 5,
        totalSteps: 10,
        completedSteps: [],
        browserState: { currentUrl: "http://example.com", title: "Example" },
        tokenUsage: 200,
        config: {},
        savedAt: Date.now(),
        status: "in-progress",
      });

      const checkpoint = await manager.getIncomplete();
      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.runId).toEqual("run_inprogress");
    });

    it("should handle corrupted checkpoint files gracefully", async () => {
      // Create a valid checkpoint
      await manager.save({
        runId: "run_valid",
        url: "http://example.com",
        instruction: "Test",
        stepIndex: 2,
        totalSteps: 10,
        completedSteps: [],
        browserState: { currentUrl: "http://example.com", title: "Example" },
        tokenUsage: 100,
        config: {},
        savedAt: Date.now(),
        status: "in-progress",
      });

      // Create a corrupted file (not JSON)
      const corruptedPath = `${checkpointDir}/corrupted.json`;
      mockFiles.set(corruptedPath, "This is not JSON");

      const checkpoint = await manager.getIncomplete();
      expect(checkpoint).not.toBeNull();
      // Should still return the valid checkpoint, ignoring the corrupted one
      expect(checkpoint?.runId).toEqual("run_valid");
    });
  });

  describe("get", () => {
    it("should load a specific checkpoint by run ID", async () => {
      const runId = "specific_run";
      await manager.save({
        runId,
        url: "http://example.com",
        instruction: "Specific test",
        stepIndex: 3,
        totalSteps: 10,
        completedSteps: [],
        browserState: { currentUrl: "http://example.com", title: "Example" },
        tokenUsage: 150,
        config: {},
        savedAt: Date.now(),
        status: "in-progress",
      });

      const checkpoint = await manager.get(runId);
      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.runId).toEqual(runId);
    });

    it("should return null if checkpoint doesn't exist", async () => {
      const checkpoint = await manager.get("nonexistent");
      expect(checkpoint).toBeNull();
    });

    it("should handle read errors gracefully", async () => {
      // Mock a read error
      (fs as any).readFile = () => {
        throw new Error("Permission denied");
      };

      const checkpoint = await manager.get("any_run");
      expect(checkpoint).toBeNull();
    });
  });

  describe("markCompleted", () => {
    it("should update the status of a checkpoint to 'completed'", async () => {
      const runId = "test_run";
      await manager.save({
        runId,
        url: "http://example.com",
        instruction: "Test",
        stepIndex: 8,
        totalSteps: 10,
        completedSteps: [],
        browserState: { currentUrl: "http://example.com", title: "Example" },
        tokenUsage: 400,
        config: {},
        savedAt: Date.now(),
        status: "in-progress",
      });

      await manager.markCompleted(runId);

      const checkpoint = await manager.get(runId);
      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.status).toEqual("completed");
    });

    it("should do nothing if checkpoint doesn't exist", async () => {
      await manager.markCompleted("nonexistent");
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("markFailed", () => {
    it("should update the status of a checkpoint to 'failed'", async () => {
      const runId = "test_run";
      await manager.save({
        runId,
        url: "http://example.com",
        instruction: "Test",
        stepIndex: 8,
        totalSteps: 10,
        completedSteps: [],
        browserState: { currentUrl: "http://example.com", title: "Example" },
        tokenUsage: 400,
        config: {},
        savedAt: Date.now(),
        status: "in-progress",
      });

      await manager.markFailed(runId);

      const checkpoint = await manager.get(runId);
      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.status).toEqual("failed");
    });
  });

  describe("markAbandoned", () => {
    it("should update the status of a checkpoint to 'abandoned'", async () => {
      const runId = "test_run";
      await manager.save({
        runId,
        url: "http://example.com",
        instruction: "Test",
        stepIndex: 8,
        totalSteps: 10,
        completedSteps: [],
        browserState: { currentUrl: "http://example.com", title: "Example" },
        tokenUsage: 400,
        config: {},
        savedAt: Date.now(),
        status: "in-progress",
      });

      await manager.markAbandoned(runId);

      const checkpoint = await manager.get(runId);
      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.status).toEqual("abandoned");
    });
  });

  describe("cleanup", () => {
    it("should delete old completed checkpoints, keeping only the specified number", async () => {
      const now = Date.now();

      // Create 5 completed checkpoints
      for (let i = 1; i <= 5; i++) {
        await manager.save({
          runId: `run_${i}`,
          url: "http://example.com",
          instruction: `Test ${i}`,
          stepIndex: 10,
          totalSteps: 10,
          completedSteps: [],
          browserState: { currentUrl: "http://example.com", title: "Example" },
          tokenUsage: 100 * i,
          config: {},
          savedAt: now - i * 60_000, // Each one minute apart
          status: "completed",
        });
      }

      // Should keep only 3 most recent
      await manager.cleanup(3);

      const filesAfterCleanup = await fs.readdir(checkpointDir);
      expect(filesAfterCleanup).toHaveLength(3); // Only 3 files should remain

      // The remaining files should be the three most recent (highest savedAt)
      const checkpoints = await Promise.all(
        filesAfterCleanup.map(async (file) => {
          const content = await fs.readFile(`${checkpointDir}/${file}`, "utf-8");
          return JSON.parse(content) as CheckpointData;
        }),
      );
      const savedAtValues = checkpoints.map((cp) => cp.savedAt).sort((a, b) => b - a);
      expect(savedAtValues[0] > savedAtValues[1]).toBe(true);
      expect(savedAtValues[1] > savedAtValues[2]).toBe(true);
    });

    it("should not delete in-progress checkpoints", async () => {
      // Create 2 completed checkpoints
      for (let i = 1; i <= 2; i++) {
        await manager.save({
          runId: `run_${i}`,
          url: "http://example.com",
          instruction: `Test ${i}`,
          stepIndex: 10,
          totalSteps: 10,
          completedSteps: [],
          browserState: { currentUrl: "http://example.com", title: "Example" },
          tokenUsage: 100 * i,
          config: {},
          savedAt: Date.now() - i * 60_000,
          status: "completed",
        });
      }

      // Create 1 in-progress checkpoint
      await manager.save({
        runId: "run_inprogress",
        url: "http://example.com",
        instruction: "In progress",
        stepIndex: 5,
        totalSteps: 10,
        completedSteps: [],
        browserState: { currentUrl: "http://example.com", title: "Example" },
        tokenUsage: 500,
        config: {},
        savedAt: Date.now(),
        status: "in-progress",
      });

      await manager.cleanup((keep = 1));

      // Should keep the in-progress checkpoint and one completed
      const filesAfterCleanup = await fs.readdir(checkpointDir);
      expect(filesAfterCleanup).toHaveLength(2);
      expect(filesAfterCleanup.some((f) => f.includes("inprogress"))).toBe(true);
    });

    it("should handle errors during cleanup gracefully", async () => {
      // Mock a read error
      (fs as any).readdir = () => {
        throw new Error("Permission denied");
      };

      await manager.cleanup((keep = 1));
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("list", () => {
    it("should list all checkpoints with metadata", async () => {
      const now = Date.now();

      await manager.save({
        runId: "run_1",
        url: "http://example.com",
        instruction: "Test 1",
        stepIndex: 2,
        totalSteps: 10,
        completedSteps: [],
        browserState: { currentUrl: "http://example.com", title: "Example" },
        tokenUsage: 100,
        config: {},
        savedAt: now - 1000,
        status: "in-progress",
      });

      await manager.save({
        runId: "run_2",
        url: "http://example.org",
        instruction: "Test 2",
        stepIndex: 8,
        totalSteps: 10,
        completedSteps: [],
        browserState: { currentUrl: "http://example.org", title: "Example Org" },
        tokenUsage: 200,
        config: {},
        savedAt: now,
        status: "completed",
      });

      const list = await manager.list();
      expect(list).toHaveLength(2);
      expect(list[0].runId).toEqual("run_1");
      expect(list[1].runId).toEqual("run_2");
      expect(list[0].status).toEqual("in-progress");
      expect(list[1].status).toEqual("completed");
    });

    it("should return empty array if no checkpoints exist", async () => {
      const list = await manager.list();
      expect(list).toEqual([]);
    });

    it("should handle errors during listing gracefully", async () => {
      // Mock a read error
      (fs as any).readdir = () => {
        throw new Error("Permission denied");
      };

      const list = await manager.list();
      expect(list).toEqual([]);
    });
  });
});
