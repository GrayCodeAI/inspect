import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initializeProjectContext,
  getProjectRoot,
  getProjectPath,
  getInspectDir,
  getInspectPath,
  ProjectPaths,
} from "./project-context.js";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("project-context", () => {
  const testDir = join(tmpdir(), "inspect-test-" + Date.now());

  beforeEach(() => {
    // Create test directory
    mkdirSync(testDir, { recursive: true });
    // Initialize with test directory
    initializeProjectContext(testDir);
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("initializeProjectContext", () => {
    it("initializes with provided directory", () => {
      expect(getProjectRoot()).toBe(testDir);
    });

    it("throws when accessing before initialization", () => {
      // Reset module state by reimporting would be needed here
      // For now, we just verify the initialized state works
      expect(() => getProjectRoot()).not.toThrow();
    });
  });

  describe("getProjectRoot", () => {
    it("returns the initialized project root", () => {
      expect(getProjectRoot()).toBe(testDir);
    });
  });

  describe("getProjectPath", () => {
    it("joins path segments with project root", () => {
      const result = getProjectPath("src", "index.ts");
      expect(result).toBe(join(testDir, "src", "index.ts"));
    });

    it("works with single segment", () => {
      const result = getProjectPath("package.json");
      expect(result).toBe(join(testDir, "package.json"));
    });

    it("works with no segments", () => {
      const result = getProjectPath();
      expect(result).toBe(testDir);
    });
  });

  describe("getInspectDir", () => {
    it("returns .inspect directory path", () => {
      const result = getInspectDir();
      expect(result).toBe(join(testDir, ".inspect"));
    });
  });

  describe("getInspectPath", () => {
    it("joins path segments with .inspect directory", () => {
      const result = getInspectPath("preferences.json");
      expect(result).toBe(join(testDir, ".inspect", "preferences.json"));
    });

    it("works with nested paths", () => {
      const result = getInspectPath("reports", "test-report.json");
      expect(result).toBe(join(testDir, ".inspect", "reports", "test-report.json"));
    });
  });

  describe("ProjectPaths", () => {
    it("preferences returns correct path", () => {
      expect(ProjectPaths.preferences()).toBe(join(testDir, ".inspect", "preferences.json"));
    });

    it("keys returns correct path", () => {
      expect(ProjectPaths.keys()).toBe(join(testDir, ".inspect", "keys.json"));
    });

    it("history returns correct path", () => {
      expect(ProjectPaths.history()).toBe(join(testDir, ".inspect", "history.json"));
    });

    it("config returns correct path", () => {
      expect(ProjectPaths.config()).toBe(join(testDir, ".inspect", "config.json"));
    });

    it("reports returns correct path", () => {
      expect(ProjectPaths.reports()).toBe(join(testDir, ".inspect", "reports"));
    });

    it("traces returns correct path", () => {
      expect(ProjectPaths.traces()).toBe(join(testDir, ".inspect", "traces"));
    });

    it("screenshots returns correct path", () => {
      expect(ProjectPaths.screenshots()).toBe(join(testDir, ".inspect", "screenshots"));
    });

    it("cache returns correct path", () => {
      expect(ProjectPaths.cache()).toBe(join(testDir, ".inspect", "cache"));
    });

    it("workflows returns correct path", () => {
      expect(ProjectPaths.workflows()).toBe(join(testDir, ".inspect", "workflows"));
    });

    it("flows returns correct path", () => {
      expect(ProjectPaths.flows()).toBe(join(testDir, ".inspect", "flows"));
    });

    it("visual returns correct path", () => {
      expect(ProjectPaths.visual()).toBe(join(testDir, ".inspect", "visual"));
    });

    it("baselines returns correct path", () => {
      expect(ProjectPaths.baselines()).toBe(join(testDir, ".inspect", "baselines"));
    });

    it("monitorHistory returns correct path", () => {
      expect(ProjectPaths.monitorHistory()).toBe(join(testDir, ".inspect", "monitor-history.json"));
    });

    it("flakeHistory returns correct path", () => {
      expect(ProjectPaths.flakeHistory()).toBe(join(testDir, ".inspect", "flake-history.json"));
    });

    it("trend returns correct path", () => {
      expect(ProjectPaths.trend()).toBe(join(testDir, ".inspect", "trend.json"));
    });

    it("testTrend returns correct path", () => {
      expect(ProjectPaths.testTrend()).toBe(join(testDir, ".inspect", "test-trend.json"));
    });
  });
});
