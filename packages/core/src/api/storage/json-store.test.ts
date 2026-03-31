import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JsonStore } from "./json-store.js";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

interface TestItem {
  id: string;
  name: string;
  value: number;
}

describe("JsonStore", () => {
  let testDir: string;
  let store: JsonStore<TestItem>;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `json-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    store = new JsonStore<TestItem>(testDir, "test-collection");
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe("basic CRUD", () => {
    it("starts empty", () => {
      expect(store.size).toBe(0);
      expect(store.list()).toEqual([]);
    });

    it("sets and gets items", () => {
      const item: TestItem = { id: "1", name: "test", value: 42 };
      store.set("1", item);
      expect(store.get("1")).toEqual(item);
      expect(store.size).toBe(1);
    });

    it("returns undefined for missing items", () => {
      expect(store.get("nonexistent")).toBeUndefined();
    });

    it("checks existence with has()", () => {
      store.set("1", { id: "1", name: "a", value: 1 });
      expect(store.has("1")).toBe(true);
      expect(store.has("2")).toBe(false);
    });

    it("deletes items", () => {
      store.set("1", { id: "1", name: "a", value: 1 });
      expect(store.delete("1")).toBe(true);
      expect(store.get("1")).toBeUndefined();
      expect(store.size).toBe(0);
    });

    it("returns false when deleting nonexistent items", () => {
      expect(store.delete("nonexistent")).toBe(false);
    });

    it("lists all items", () => {
      store.set("1", { id: "1", name: "a", value: 1 });
      store.set("2", { id: "2", name: "b", value: 2 });
      store.set("3", { id: "3", name: "c", value: 3 });
      const items = store.list();
      expect(items).toHaveLength(3);
      expect(items.map((i) => i.id).sort()).toEqual(["1", "2", "3"]);
    });

    it("filters items", () => {
      store.set("1", { id: "1", name: "a", value: 1 });
      store.set("2", { id: "2", name: "b", value: 10 });
      store.set("3", { id: "3", name: "c", value: 5 });
      const filtered = store.filter((item) => item.value > 3);
      expect(filtered).toHaveLength(2);
    });

    it("overwrites items with same id", () => {
      store.set("1", { id: "1", name: "original", value: 1 });
      store.set("1", { id: "1", name: "updated", value: 99 });
      expect(store.get("1")?.name).toBe("updated");
      expect(store.size).toBe(1);
    });
  });

  describe("persistence", () => {
    it("persists data to disk and reloads", () => {
      store.set("1", { id: "1", name: "persist-me", value: 42 });
      store.flush();

      // Create a new store from the same directory
      const store2 = new JsonStore<TestItem>(testDir, "test-collection");
      expect(store2.get("1")).toEqual({ id: "1", name: "persist-me", value: 42 });
      expect(store2.size).toBe(1);
    });

    it("persists deletes", () => {
      store.set("1", { id: "1", name: "a", value: 1 });
      store.set("2", { id: "2", name: "b", value: 2 });
      store.flush();
      store.delete("1");
      store.flush();

      const store2 = new JsonStore<TestItem>(testDir, "test-collection");
      expect(store2.size).toBe(1);
      expect(store2.get("1")).toBeUndefined();
      expect(store2.get("2")?.name).toBe("b");
    });

    it("creates data directory if it does not exist", () => {
      const nestedDir = join(testDir, "deep", "nested", "dir");
      const nestedStore = new JsonStore<TestItem>(nestedDir, "collection");
      nestedStore.set("1", { id: "1", name: "nested", value: 1 });
      nestedStore.flush();
      expect(existsSync(join(nestedDir, "collection.json"))).toBe(true);
    });

    it("handles empty file gracefully", () => {
      writeFileSync(join(testDir, "empty.json"), "", "utf-8");
      // Should not throw
      const emptyStore = new JsonStore<TestItem>(testDir, "empty");
      expect(emptyStore.size).toBe(0);
    });
  });

  describe("multiple collections", () => {
    it("stores different collections independently", () => {
      const storeA = new JsonStore<TestItem>(testDir, "collection-a");
      const storeB = new JsonStore<TestItem>(testDir, "collection-b");

      storeA.set("1", { id: "1", name: "in-a", value: 1 });
      storeB.set("1", { id: "1", name: "in-b", value: 2 });

      expect(storeA.get("1")?.name).toBe("in-a");
      expect(storeB.get("1")?.name).toBe("in-b");
    });
  });
});
