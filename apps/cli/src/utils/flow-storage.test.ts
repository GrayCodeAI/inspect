import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FlowStorage } from "./flow-storage.js";

const TEST_DIR = join(process.cwd(), ".test-flows-" + Date.now());

describe("FlowStorage", () => {
  let storage: FlowStorage;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    storage = new FlowStorage(TEST_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("should save and load a flow", () => {
    const flow = storage.save({
      name: "Test Login",
      instruction: "Test the login form",
      target: "unstaged",
      tags: ["auth", "login"],
    });
    expect(flow.slug).toBe("test-login");
    expect(flow.name).toBe("Test Login");
    expect(flow.runCount).toBe(0);

    const loaded = storage.load("test-login");
    expect(loaded).not.toBeNull();
    expect(loaded!.instruction).toBe("Test the login form");
    expect(loaded!.tags).toEqual(["auth", "login"]);
  });

  it("should list flows", () => {
    storage.save({ name: "Flow 1", instruction: "Test 1", target: "changes", tags: [] });
    storage.save({ name: "Flow 2", instruction: "Test 2", target: "branch", tags: [] });
    const list = storage.list();
    expect(list.length).toBe(2);
  });

  it("should delete a flow", () => {
    storage.save({ name: "Delete Me", instruction: "Test", target: "changes", tags: [] });
    expect(storage.delete("delete-me")).toBe(true);
    expect(storage.load("delete-me")).toBeNull();
  });

  it("should record run count", () => {
    storage.save({ name: "Run Test", instruction: "Test", target: "changes", tags: [] });
    storage.recordRun("run-test");
    storage.recordRun("run-test");
    const flow = storage.load("run-test");
    expect(flow!.runCount).toBe(2);
    expect(flow!.lastRun).toBeDefined();
  });

  it("should return null for non-existent flow", () => {
    expect(storage.load("nonexistent")).toBeNull();
  });

  it("should return false when deleting non-existent flow", () => {
    expect(storage.delete("nonexistent")).toBe(false);
  });
});
