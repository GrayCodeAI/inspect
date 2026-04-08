import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { TestPlanForkManager } from "./test-fork.js";

describe("TestPlanForkManager", () => {
  let manager: TestPlanForkManager;

  beforeEach(() => {
    manager = new TestPlanForkManager();
  });

  describe("createFork", () => {
    it("should create a fork with a unique ID and initial state", async () => {
      const fork = await Effect.runPromise(
        manager.createFork({
          name: "test-fork",
          description: "Test fork for parallel execution",
          parallelism: 2,
        }),
      );

      expect(fork).toBeInstanceOf(Object);
      expect(fork).toHaveProperty("forkId");
      expect(fork.forkId).toMatch(/^fork_/);
      expect(fork.name).toEqual("test-fork");
      expect(fork.status).toEqual("created");
      expect(fork.createdAt).toBeNumber();
    });

    it("should store the fork in the manager's registry", async () => {
      const fork = await Effect.runPromise(
        manager.createFork({
          name: "test-fork",
          description: "Test fork for parallel execution",
          parallelism: 2,
        }),
      );

      const retrieved = await Effect.runPromise(manager.getFork(fork.forkId));
      expect(retrieved).toEqual(fork);
    });

    it("should throw if fork with same ID already exists", async () => {
      const forkId = "duplicate_fork";
      await Effect.runPromise(
        manager.createFork({
          forkId,
          name: "fork1",
          description: "First fork",
          parallelism: 2,
        }),
      );

      await expect(
        Effect.runPromise(
          manager.createFork({
            forkId,
            name: "fork2",
            description: "Second fork",
            parallelism: 2,
          }),
        ),
      ).rejects.toThrow("Fork with ID already exists");
    });
  });

  describe("addStep", () => {
    it("should add a step to a fork's execution plan", async () => {
      const fork = await Effect.runPromise(
        manager.createFork({
          name: "test-fork",
          description: "Test fork",
          parallelism: 2,
        }),
      );

      const stepId = await Effect.runPromise(
        manager.addStep(fork.forkId, {
          index: 0,
          description: "Navigate to URL",
          type: "navigate",
          targetUrl: "http://example.com",
        }),
      );

      expect(stepId).toBeString();
      expect(stepId).toMatch(/^step_/);

      const updatedFork = await Effect.runPromise(manager.getFork(fork.forkId));
      expect(updatedFork.steps).toHaveLength(1);
      expect(updatedFork.steps[0].index).toEqual(0);
      expect(updatedFork.steps[0].description).toEqual("Navigate to URL");
    });

    it("should throw if fork doesn't exist", async () => {
      await expect(
        Effect.runPromise(
          manager.addStep("nonexistent-fork", {
            index: 0,
            description: "Test step",
            type: "navigate",
          }),
        ),
      ).rejects.toThrow("Fork not found");
    });
  });

  describe("removeStep", () => {
    it("should remove a step from a fork's execution plan", async () => {
      const fork = await Effect.runPromise(
        manager.createFork({
          name: "test-fork",
          description: "Test fork",
          parallelism: 2,
        }),
      );

      const stepId = await Effect.runPromise(
        manager.addStep(fork.forkId, {
          index: 0,
          description: "Step 1",
          type: "navigate",
        }),
      );

      await Effect.runPromise(manager.removeStep(fork.forkId, stepId));

      const updatedFork = await Effect.runPromise(manager.getFork(fork.forkId));
      expect(updatedFork.steps).toHaveLength(0);
    });

    it("should throw if fork doesn't exist", async () => {
      await expect(
        Effect.runPromise(manager.removeStep("nonexistent-fork", "step1")),
      ).rejects.toThrow("Fork not found");
    });

    it("should throw if step doesn't exist", async () => {
      const fork = await Effect.runPromise(
        manager.createFork({
          name: "test-fork",
          description: "Test fork",
          parallelism: 2,
        }),
      );

      await expect(
        Effect.runPromise(manager.removeStep(fork.forkId, "nonexistent-step")),
      ).rejects.toThrow("Step not found");
    });
  });

  describe("getFork", () => {
    it("should retrieve a fork by ID", async () => {
      const fork = await Effect.runPromise(
        manager.createFork({
          name: "test-fork",
          description: "Test fork",
          parallelism: 2,
        }),
      );

      const retrieved = await Effect.runPromise(manager.getFork(fork.forkId));
      expect(retrieved).toEqual(fork);
    });

    it("should return null if fork doesn't exist", async () => {
      const result = await Effect.runPromise(manager.getFork("nonexistent"));
      expect(result).toBeNull();
    });
  });

  describe("listForks", () => {
    it("should list all forks", async () => {
      await Effect.runPromise(
        manager.createFork({ name: "fork1", description: "First fork", parallelism: 2 }),
      );
      await Effect.runPromise(
        manager.createFork({ name: "fork2", description: "Second fork", parallelism: 2 }),
      );

      const forks = await Effect.runPromise(manager.listForks());
      expect(forks).toHaveLength(2);
      expect(forks[0]).toHaveProperty("forkId");
      expect(forks[1]).toHaveProperty("forkId");
    });

    it("should return empty array if no forks exist", async () => {
      const forks = await Effect.runPromise(manager.listForks());
      expect(forks).toEqual([]);
    });
  });

  describe("deleteFork", () => {
    it("should delete a fork and its associated data", async () => {
      const fork = await Effect.runPromise(
        manager.createFork({
          name: "test-fork",
          description: "Test fork",
          parallelism: 2,
        }),
      );

      await Effect.runPromise(manager.deleteFork(fork.forkId));

      const retrieved = await Effect.runPromise(manager.getFork(fork.forkId));
      expect(retrieved).toBeNull();
    });

    it("should throw if fork doesn't exist", async () => {
      await expect(Effect.runPromise(manager.deleteFork("nonexistent"))).rejects.toThrow(
        "Fork not found",
      );
    });
  });

  describe("updateFork", () => {
    it("should update fork metadata", async () => {
      const fork = await Effect.runPromise(
        manager.createFork({
          name: "test-fork",
          description: "Test fork",
          parallelism: 2,
        }),
      );

      const updated = await Effect.runPromise(
        manager.updateFork(fork.forkId, {
          name: "updated-fork",
          description: "Updated fork",
          parallelism: 4,
        }),
      );

      expect(updated.name).toEqual("updated-fork");
      expect(updated.description).toEqual("Updated fork");
      expect(updated.parallelism).toEqual(4);

      const retrieved = await Effect.runPromise(manager.getFork(fork.forkId));
      expect(retrieved?.name).toEqual("updated-fork");
    });

    it("should throw if fork doesn't exist", async () => {
      await expect(
        Effect.runPromise(
          manager.updateFork("nonexistent", {
            name: "updated",
            description: "Updated",
            parallelism: 2,
          }),
        ),
      ).rejects.toThrow("Fork not found");
    });
  });

  describe("executeFork", () => {
    it("should execute a fork's plan and return results", async () => {
      const fork = await Effect.runPromise(
        manager.createFork({
          name: "test-fork",
          description: "Test fork",
          parallelism: 2,
        }),
      );

      await Effect.runPromise(
        manager.addStep(fork.forkId, {
          index: 0,
          description: "Navigate to URL",
          type: "navigate",
          targetUrl: "http://example.com",
        }),
      );

      await Effect.runPromise(
        manager.addStep(fork.forkId, {
          index: 1,
          description: "Click button",
          type: "interact",
          targetSelector: "button.submit",
        }),
      );

      const results = await Effect.runPromise(manager.executeFork(fork.forkId));

      expect(results).toBeInstanceOf(Array);
      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty("status");
      expect(results[0]).toHaveProperty("duration");
    });

    it("should throw if fork doesn't exist", async () => {
      await expect(Effect.runPromise(manager.executeFork("nonexistent"))).rejects.toThrow(
        "Fork not found",
      );
    });

    it("should throw if fork has no steps", async () => {
      const fork = await Effect.runPromise(
        manager.createFork({
          name: "empty-fork",
          description: "Empty fork",
          parallelism: 2,
        }),
      );

      await expect(Effect.runPromise(manager.executeFork(fork.forkId))).rejects.toThrow(
        "No steps to execute",
      );
    });
  });

  describe("forkExists", () => {
    it("should return true if fork exists", async () => {
      const fork = await Effect.runPromise(
        manager.createFork({
          name: "test-fork",
          description: "Test fork",
          parallelism: 2,
        }),
      );

      const exists = await Effect.runPromise(manager.forkExists(fork.forkId));
      expect(exists).toBe(true);
    });

    it("should return false if fork doesn't exist", async () => {
      const exists = await Effect.runPromise(manager.forkExists("nonexistent"));
      expect(exists).toBe(false);
    });
  });
});
