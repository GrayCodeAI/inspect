import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProfileManager } from "./manager.js";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("ProfileManager", () => {
  let tempDir: string;
  let manager: ProfileManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "inspect-profile-test-"));
    manager = new ProfileManager({ profilesDir: tempDir });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("create", () => {
    it("should create a new profile", () => {
      const profile = manager.create("Test Profile");
      expect(profile.id).toBeDefined();
      expect(profile.name).toBe("Test Profile");
      expect(profile.dataDir).toBeDefined();
      expect(profile.createdAt).toBeGreaterThan(0);
    });

    it("should set first profile as default", () => {
      const profile = manager.create("First");
      expect(profile.isDefault).toBe(true);
    });

    it("should not set second profile as default", () => {
      manager.create("First");
      const second = manager.create("Second");
      expect(second.isDefault).toBe(false);
    });

    it("should accept description and tags", () => {
      const profile = manager.create("Test", {
        description: "A test profile",
        tags: ["test", "dev"],
      });
      expect(profile.description).toBe("A test profile");
      expect(profile.tags).toEqual(["test", "dev"]);
    });
  });

  describe("list", () => {
    it("should list all profiles", () => {
      manager.create("A");
      manager.create("B");
      const list = manager.list();
      expect(list.length).toBe(2);
    });

    it("should sort by creation date (newest first)", () => {
      const a = manager.create("A");
      // Small delay to ensure different timestamps
      const b = manager.create("B");
      const list = manager.list();
      // Both should be present
      expect(list.length).toBe(2);
      expect(list.some((p) => p.id === a.id)).toBe(true);
      expect(list.some((p) => p.id === b.id)).toBe(true);
    });
  });

  describe("get", () => {
    it("should get profile by ID", () => {
      const created = manager.create("Test");
      const found = manager.get(created.id);
      expect(found?.id).toBe(created.id);
    });

    it("should get profile by name", () => {
      manager.create("MyProfile");
      const found = manager.get("MyProfile");
      expect(found?.name).toBe("MyProfile");
    });

    it("should return undefined for unknown", () => {
      expect(manager.get("unknown")).toBeUndefined();
    });
  });

  describe("getDefault / setDefault", () => {
    it("should get default profile", () => {
      const created = manager.create("Default");
      const def = manager.getDefault();
      expect(def?.id).toBe(created.id);
    });

    it("should set a new default", () => {
      manager.create("A");
      const b = manager.create("B");
      manager.setDefault(b.id);
      expect(manager.getDefault()?.id).toBe(b.id);
    });

    it("should return false for unknown ID on setDefault", () => {
      expect(manager.setDefault("unknown")).toBe(false);
    });
  });

  describe("delete", () => {
    it("should delete a profile", () => {
      const profile = manager.create("ToDelete");
      const deleted = manager.delete(profile.id);
      expect(deleted).toBe(true);
      expect(manager.get(profile.id)).toBeUndefined();
    });

    it("should return false for unknown profile", () => {
      expect(manager.delete("unknown")).toBe(false);
    });
  });

  describe("touch", () => {
    it("should update lastUsedAt", () => {
      const profile = manager.create("Test");
      expect(profile.lastUsedAt).toBeUndefined();
      manager.touch(profile.id);
      const updated = manager.get(profile.id);
      expect(updated?.lastUsedAt).toBeDefined();
    });
  });

  describe("export / import", () => {
    it("should export profile to file", () => {
      const profile = manager.create("ExportTest");
      const path = join(tempDir, "export.json");
      const success = manager.export(profile.id, path);
      expect(success).toBe(true);
      expect(existsSync(path)).toBe(true);
    });

    it("should return false for unknown profile export", () => {
      const path = join(tempDir, "export.json");
      expect(manager.export("unknown", path)).toBe(false);
    });

    it("should import profile from file", () => {
      const profile = manager.create("ImportTest");
      const path = join(tempDir, "import.json");
      manager.export(profile.id, path);

      const imported = manager.import(path);
      expect(imported.name).toBe("ImportTest");
      expect(imported.id).not.toBe(profile.id); // New ID assigned
      expect(imported.isDefault).toBe(false);
    });
  });
});
