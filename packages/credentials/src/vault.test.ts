import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CredentialVault } from "./vault.js";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

describe("CredentialVault", () => {
  let vault: CredentialVault;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `inspect-vault-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    vault = new CredentialVault({
      basePath: testDir,
      masterKey: "test-master-key-12345",
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("encrypt/decrypt", () => {
    it("round-trips plaintext", () => {
      const plaintext = "Hello, World!";
      const encrypted = vault.encrypt(plaintext);
      const decrypted = vault.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("encrypts JSON payloads", () => {
      const json = JSON.stringify({ user: "admin", pass: "secret123" });
      const encrypted = vault.encrypt(json);
      const decrypted = vault.decrypt(encrypted);
      expect(JSON.parse(decrypted)).toEqual({ user: "admin", pass: "secret123" });
    });

    it("produces different ciphertext for same plaintext", () => {
      const plaintext = "same input";
      const enc1 = vault.encrypt(plaintext);
      const enc2 = vault.encrypt(plaintext);
      expect(enc1.equals(enc2)).toBe(false);
    });

    it("throws for invalid encrypted data", () => {
      expect(() => vault.decrypt(Buffer.from("too short"))).toThrow("Invalid encrypted data");
    });
  });

  describe("CRUD operations", () => {
    it("creates a credential and returns sanitized data", () => {
      const cred = vault.create({
        type: "password",
        label: "My Login",
        domain: "example.com",
        data: { username: "admin", password: "secret" },
      });
      expect(cred.id).toBeDefined();
      expect(cred.label).toBe("My Login");
      expect(cred.domain).toBe("example.com");
      expect(cred.provider).toBe("native");
      // Password should be sanitized
      expect(String(cred.data.password)).toContain("****");
    });

    it("gets a credential by ID", () => {
      const created = vault.create({
        type: "api-key",
        label: "API Key",
        data: { apiKey: "sk-123456789" },
      });
      const retrieved = vault.get(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.label).toBe("API Key");
    });

    it("returns null for missing ID", () => {
      expect(vault.get("nonexistent")).toBeNull();
    });

    it("updates a credential", () => {
      const cred = vault.create({
        type: "password",
        label: "Old Name",
        data: {},
      });
      const updated = vault.update(cred.id, { label: "New Name" });
      expect(updated).not.toBeNull();
      expect(updated!.label).toBe("New Name");
    });

    it("deletes a credential", () => {
      const cred = vault.create({
        type: "password",
        label: "To Delete",
        data: {},
      });
      expect(vault.delete(cred.id)).toBe(true);
      expect(vault.get(cred.id)).toBeNull();
    });

    it("returns false when deleting nonexistent ID", () => {
      expect(vault.delete("no-such-id")).toBe(false);
    });
  });

  describe("list and filter", () => {
    beforeEach(() => {
      vault.create({ type: "password", label: "Login A", domain: "a.com", data: {} });
      vault.create({ type: "api-key", label: "Key B", domain: "b.com", data: {} });
      vault.create({ type: "password", label: "Login C", domain: "a.com", data: {} });
    });

    it("lists all credentials", () => {
      expect(vault.list()).toHaveLength(3);
    });

    it("filters by type", () => {
      const passwords = vault.list({ type: "password" });
      expect(passwords).toHaveLength(2);
    });

    it("filters by domain", () => {
      const aDomain = vault.list({ domain: "a.com" });
      expect(aDomain).toHaveLength(2);
    });

    it("reports correct count", () => {
      expect(vault.count).toBe(3);
    });

    it("findByDomain matches partial domains", () => {
      const found = vault.findByDomain("a.com");
      expect(found.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("test", () => {
    it("validates password credentials", async () => {
      const cred = vault.create({
        type: "password",
        label: "Login",
        data: { username: "admin", password: "pass123" },
      });
      const result = await vault.test(cred.id);
      expect(result.success).toBe(true);
    });

    it("fails validation for empty password credentials", async () => {
      const cred = vault.create({
        type: "password",
        label: "Empty Login",
        data: {},
      });
      const result = await vault.test(cred.id);
      expect(result.success).toBe(false);
    });

    it("returns failure for nonexistent ID", async () => {
      const result = await vault.test("no-such-id");
      expect(result.success).toBe(false);
      expect(result.message).toContain("not found");
    });
  });

  describe("persistence", () => {
    it("persists credentials across vault instances", () => {
      vault.create({
        type: "password",
        label: "Persistent",
        data: { username: "user" },
      });

      const vault2 = new CredentialVault({
        basePath: testDir,
        masterKey: "test-master-key-12345",
      });
      const creds = vault2.list();
      expect(creds).toHaveLength(1);
      expect(creds[0].label).toBe("Persistent");
    });
  });

  describe("PBKDF2 migration", () => {
    it("decrypts data encrypted with legacy 100K iterations", () => {
      // Simulate legacy encryption: encrypt with 100K iterations using raw crypto
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const crypto = require("node:crypto");
      const passphrase = "test-master-key-12345";
      const salt = crypto.randomBytes(32);
      const key = crypto.pbkdf2Sync(passphrase, salt, 100_000, 32, "sha512");
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const plaintext = JSON.stringify([
        {
          id: "legacy-1",
          provider: "native",
          type: "password",
          label: "Legacy Cred",
          data: { username: "old" },
          createdAt: 1,
          updatedAt: 1,
        },
      ]);
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      const legacyData = Buffer.concat([salt, iv, tag, encrypted]);

      // Write legacy-encrypted data to the storage path
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("node:fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require("node:path");
      const storagePath = path.join(testDir, ".inspect", "credentials.enc");
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
      fs.writeFileSync(storagePath, legacyData, { mode: 0o600 });

      // Create a new vault — should transparently decrypt legacy data
      const vault2 = new CredentialVault({
        basePath: testDir,
        masterKey: "test-master-key-12345",
      });
      const creds = vault2.list();
      expect(creds).toHaveLength(1);
      expect(creds[0].label).toBe("Legacy Cred");
    });

    it("auto-upgrades legacy vaults to current iteration count", () => {
      // Simulate legacy encryption
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const crypto = require("node:crypto");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("node:fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pathMod = require("node:path");
      const passphrase = "test-master-key-12345";
      const salt = crypto.randomBytes(32);
      const key = crypto.pbkdf2Sync(passphrase, salt, 100_000, 32, "sha512");
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const plaintext = JSON.stringify([
        {
          id: "upgrade-1",
          provider: "native",
          type: "password",
          label: "Upgrade Me",
          data: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ]);
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      const legacyData = Buffer.concat([salt, iv, tag, encrypted]);

      const storagePath = pathMod.join(testDir, ".inspect", "credentials.enc");
      fs.mkdirSync(pathMod.dirname(storagePath), { recursive: true });
      fs.writeFileSync(storagePath, legacyData, { mode: 0o600 });

      // Load vault — triggers auto-upgrade
      new CredentialVault({
        basePath: testDir,
        masterKey: "test-master-key-12345",
      });

      // Read the upgraded file — should now be encrypted with 600K iterations
      const upgradedData = fs.readFileSync(storagePath);
      const upgradedSalt = upgradedData.subarray(0, 32);
      const upgradedIv = upgradedData.subarray(32, 48);
      const upgradedTag = upgradedData.subarray(48, 64);
      const upgradedEnc = upgradedData.subarray(64);

      // Legacy iterations should now FAIL (data was re-encrypted with 600K)
      const legacyKey = crypto.pbkdf2Sync(passphrase, upgradedSalt, 100_000, 32, "sha512");
      const legacyDecipher = crypto.createDecipheriv("aes-256-gcm", legacyKey, upgradedIv);
      legacyDecipher.setAuthTag(upgradedTag);
      expect(() => {
        legacyDecipher.update(upgradedEnc);
        legacyDecipher.final();
      }).toThrow();

      // Current iterations should SUCCEED
      const currentKey = crypto.pbkdf2Sync(passphrase, upgradedSalt, 600_000, 32, "sha512");
      const currentDecipher = crypto.createDecipheriv("aes-256-gcm", currentKey, upgradedIv);
      currentDecipher.setAuthTag(upgradedTag);
      const decrypted = Buffer.concat([
        currentDecipher.update(upgradedEnc),
        currentDecipher.final(),
      ]).toString("utf-8");
      const creds = JSON.parse(decrypted);
      expect(creds).toHaveLength(1);
      expect(creds[0].label).toBe("Upgrade Me");
    });
  });
});
