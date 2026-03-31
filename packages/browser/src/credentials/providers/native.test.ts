import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NativeCredentialStore } from "./native.js";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

describe("NativeCredentialStore", () => {
  let store: NativeCredentialStore;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `inspect-native-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    store = new NativeCredentialStore({
      basePath: testDir,
      encryptionKey: "test-encryption-key-abc123",
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("set and get", () => {
    it("should store a credential and return sanitized entry", () => {
      const entry = store.set("github", "user1", { token: "ghp_abc123" });
      expect(entry.id).toBe("github:user1");
      expect(entry.service).toBe("github");
      expect(entry.account).toBe("user1");
      expect(entry.data).toBe("[encrypted]");
    });

    it("should retrieve stored credential data", () => {
      store.set("npm", "publish-bot", { token: "npm_tok_xyz", scope: "@inspect" });
      const data = store.get("npm", "publish-bot");
      expect(data).not.toBeNull();
      expect(data!.token).toBe("npm_tok_xyz");
      expect(data!.scope).toBe("@inspect");
    });

    it("should return null for a nonexistent credential", () => {
      expect(store.get("no-service", "no-account")).toBeNull();
    });

    it("should update an existing credential preserving createdAt", () => {
      const entry1 = store.set("svc", "acct", { version: 1 });
      const createdAt = entry1.createdAt;

      const entry2 = store.set("svc", "acct", { version: 2 });
      expect(entry2.createdAt).toBe(createdAt);
      expect(entry2.updatedAt).toBeGreaterThanOrEqual(createdAt);

      const data = store.get("svc", "acct");
      expect(data).toEqual({ version: 2 });
    });
  });

  describe("delete", () => {
    it("should delete an existing credential and return true", () => {
      store.set("aws", "prod", { accessKey: "AKIA..." });
      expect(store.delete("aws", "prod")).toBe(true);
      expect(store.get("aws", "prod")).toBeNull();
    });

    it("should return false when deleting a nonexistent credential", () => {
      expect(store.delete("ghost", "phantom")).toBe(false);
    });
  });

  describe("list and has", () => {
    beforeEach(() => {
      store.set("github", "user1", { token: "a" });
      store.set("github", "user2", { token: "b" });
      store.set("npm", "bot", { token: "c" });
    });

    it("should list all credentials without decrypted data", () => {
      const all = store.list();
      expect(all).toHaveLength(3);
      // Entries should not contain the raw encrypted data field
      for (const entry of all) {
        expect(entry).not.toHaveProperty("data");
      }
    });

    it("should filter list by service", () => {
      const ghEntries = store.list("github");
      expect(ghEntries).toHaveLength(2);
      expect(ghEntries.every((e) => e.service === "github")).toBe(true);
    });

    it("should check existence with has()", () => {
      expect(store.has("github", "user1")).toBe(true);
      expect(store.has("github", "nonexistent")).toBe(false);
    });

    it("should report correct count", () => {
      expect(store.count).toBe(3);
    });
  });

  describe("clear", () => {
    it("should remove all credentials", () => {
      store.set("a", "1", {});
      store.set("b", "2", {});
      expect(store.count).toBe(2);

      store.clear();
      expect(store.count).toBe(0);
      expect(store.list()).toHaveLength(0);
    });
  });

  describe("persistence", () => {
    it("should persist credentials across store instances", () => {
      store.set("persist-svc", "acct", { secret: "keep-me" });

      const store2 = new NativeCredentialStore({
        basePath: testDir,
        encryptionKey: "test-encryption-key-abc123",
      });
      const data = store2.get("persist-svc", "acct");
      expect(data).not.toBeNull();
      expect(data!.secret).toBe("keep-me");
    });

    it("should start empty when loaded with a different encryption key", () => {
      store.set("secret-svc", "acct", { password: "hidden" });

      const store2 = new NativeCredentialStore({
        basePath: testDir,
        encryptionKey: "different-key-entirely",
      });
      // The store loads entries but decryption will fail silently
      const data = store2.get("secret-svc", "acct");
      expect(data).toBeNull();
    });
  });
});
