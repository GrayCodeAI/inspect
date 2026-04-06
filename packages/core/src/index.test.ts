import { describe, it, assert } from "vitest";
import { TestExecutor, GitManager, DevicePresets } from "@inspect/core";

describe("@inspect/core", () => {
  it("should export TestExecutor from orchestrator", () => {
    // This is a facade package, so we just test that the re-exports work
    assert.ok(TestExecutor);
  });

  it("should export GitManager from git", () => {
    assert.ok(GitManager);
  });

  it("should export DevicePresets from devices", () => {
    assert.ok(DevicePresets);
  });
});
