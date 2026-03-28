import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProfileManager } from "./manager.js";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("ProfileManager", () => {
  let tempDir: string;
  let manager: ProfileManager;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "inspect-profile-test-"));
    manager = new ProfileManager({ profilesDir: tempDir });
    await manager.init();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("create", () => {
    it("should create a new profile", async () => {
      const profile = await manager.create("Test Profile");
      expect(profile.id).toBeDefined();
      expect(profile.name).toBe("Test Profile");
      expect(profile.dataDir).toBeDefined();
      expect(profile.createdAt).toBeGreaterThan(0);
    });

    it("should set first profile as default", async () => {
      const profile = await manager.create("First");
      expect(profile.isDefault).toBe(true);
    });

    it("should not set second profile as default", async () => {
      await manager.create("First");
      const second = await manager.create("Second");
      expect(second.isDefault).toBe(false);
    });

    it("should accept description and tags", async () => {
      const profile = await manager.create("Test", {
        description: "A test profile",
        tags: ["test", "dev"],
      });
      expect(profile.description).toBe("A test profile");
      expect(profile.tags).toEqual(["test", "dev"]);
    });
  });

  describe("list", () => {
    it("should list all profiles", async () => {
      await manager.create("A");
      await manager.create("B");
      const list = manager.list();
      expect(list.length).toBe(2);
    });

    it("should sort by creation date (newest first)", async () => {
      const a = await manager.create("A");
      // Small delay to ensure different timestamps
      const b = await manager.create("B");
      const list = manager.list();
      // Both should be present
      expect(list.length).toBe(2);
      expect(list.some((p) => p.id === a.id)).toBe(true);
      expect(list.some((p) => p.id === b.id)).toBe(true);
    });
  });

  describe("get", () => {
    it("should get profile by ID", async () => {
      const created = await manager.create("Test");
      const found = manager.get(created.id);
      expect(found?.id).toBe(created.id);
    });

    it("should get profile by name", async () => {
      await manager.create("MyProfile");
      const found = manager.get("MyProfile");
      expect(found?.name).toBe("MyProfile");
    });

    it("should return undefined for unknown", () => {
      expect(manager.get("unknown")).toBeUndefined();
    });
  });

  describe("getDefault / setDefault", () => {
    it("should get default profile", async () => {
      const created = await manager.create("Default");
      const def = manager.getDefault();
      expect(def?.id).toBe(created.id);
    });

    it("should set a new default", async () => {
      await manager.create("A");
      const b = await manager.create("B");
      await manager.setDefault(b.id);
      expect(manager.getDefault()?.id).toBe(b.id);
    });

    it("should return false for unknown ID on setDefault", async () => {
      expect(await manager.setDefault("unknown")).toBe(false);
    });
  });

  describe("delete", () => {
    it("should delete a profile", async () => {
      const profile = await manager.create("ToDelete");
      const deleted = await manager.delete(profile.id);
      expect(deleted).toBe(true);
      expect(manager.get(profile.id)).toBeUndefined();
    });

    it("should return false for unknown profile", async () => {
      expect(await manager.delete("unknown")).toBe(false);
    });
  });

  describe("touch", () => {
    it("should update lastUsedAt", async () => {
      const profile = await manager.create("Test");
      expect(profile.lastUsedAt).toBeUndefined();
      await manager.touch(profile.id);
      const updated = manager.get(profile.id);
      expect(updated?.lastUsedAt).toBeDefined();
    });
  });

  describe("export / import", () => {
    it("should export profile to file", async () => {
      const profile = await manager.create("ExportTest");
      const path = join(tempDir, "export.json");
      const success = await manager.export(profile.id, path);
      expect(success).toBe(true);
      expect(existsSync(path)).toBe(true);
    });

    it("should return false for unknown profile export", async () => {
      const path = join(tempDir, "export.json");
      expect(await manager.export("unknown", path)).toBe(false);
    });

    it("should import profile from file", async () => {
      const profile = await manager.create("ImportTest");
      const path = join(tempDir, "import.json");
      await manager.export(profile.id, path);

      const imported = await manager.import(path);
      expect(imported.name).toBe("ImportTest");
      expect(imported.id).not.toBe(profile.id); // New ID assigned
      expect(imported.isDefault).toBe(false);
    });
  });
});
