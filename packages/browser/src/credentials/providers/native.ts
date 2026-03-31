// ============================================================================
// @inspect/credentials - Native Credential Store
// ============================================================================

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { createLogger } from "@inspect/core";

const logger = createLogger("credentials/native");

/** Stored credential entry in the native store */
export interface NativeCredentialEntry {
  id: string;
  service: string;
  account: string;
  data: string; // Encrypted
  createdAt: number;
  updatedAt: number;
}

/** Encryption parameters */
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * NativeCredentialStore implements a local encrypted JSON file store
 * at .inspect/credentials.enc. Uses AES-256-GCM encryption for all
 * credential data.
 */
export class NativeCredentialStore {
  private entries: Map<string, NativeCredentialEntry> = new Map();
  private encryptionKey: Buffer;
  private filePath: string;

  constructor(options?: {
    basePath?: string;
    encryptionKey?: string;
  }) {
    const basePath = options?.basePath ?? process.cwd();
    this.filePath = path.join(basePath, ".inspect", "credentials.enc");

    // Derive encryption key
    const rawKey =
      options?.encryptionKey ??
      process.env.INSPECT_CREDENTIAL_KEY ??
      this.loadOrCreateKey(path.join(basePath, ".inspect"));

    this.encryptionKey = this.deriveKey(rawKey);
    this.load();
  }

  /**
   * Store a credential.
   */
  set(
    service: string,
    account: string,
    data: Record<string, unknown>,
  ): NativeCredentialEntry {
    const id = `${service}:${account}`;
    const encryptedData = this.encrypt(JSON.stringify(data));
    const now = Date.now();

    const existing = this.entries.get(id);
    const entry: NativeCredentialEntry = {
      id,
      service,
      account,
      data: encryptedData,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.entries.set(id, entry);
    this.save();
    return { ...entry, data: "[encrypted]" };
  }

  /**
   * Retrieve a credential.
   */
  get(
    service: string,
    account: string,
  ): Record<string, unknown> | null {
    const id = `${service}:${account}`;
    const entry = this.entries.get(id);
    if (!entry) return null;

    try {
      const decrypted = this.decrypt(entry.data);
      return JSON.parse(decrypted);
    } catch (error) {
      logger.debug("Failed to decrypt credential", { service, account, error });
      return null;
    }
  }

  /**
   * Delete a credential.
   */
  delete(service: string, account: string): boolean {
    const id = `${service}:${account}`;
    const existed = this.entries.delete(id);
    if (existed) this.save();
    return existed;
  }

  /**
   * List all credentials for a service (metadata only, no decrypted data).
   */
  list(service?: string): Array<{
    id: string;
    service: string;
    account: string;
    createdAt: number;
    updatedAt: number;
  }> {
    let entries = Array.from(this.entries.values());
    if (service) {
      entries = entries.filter((e) => e.service === service);
    }
    return entries.map((e) => ({
      id: e.id,
      service: e.service,
      account: e.account,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  }

  /**
   * Check if a credential exists.
   */
  has(service: string, account: string): boolean {
    return this.entries.has(`${service}:${account}`);
  }

  /**
   * Clear all credentials.
   */
  clear(): void {
    this.entries.clear();
    this.save();
  }

  /**
   * Get total number of stored credentials.
   */
  get count(): number {
    return this.entries.size;
  }

  /**
   * Encrypt a string using AES-256-GCM.
   */
  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf-8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Encode as base64: IV + Tag + Ciphertext
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  }

  /**
   * Decrypt a string using AES-256-GCM.
   */
  private decrypt(ciphertext: string): string {
    const data = Buffer.from(ciphertext, "base64");
    if (data.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error("Invalid encrypted data");
    }

    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.encryptionKey,
      iv,
    );
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf-8");
  }

  /**
   * Derive a 256-bit key from a passphrase.
   */
  private deriveKey(passphrase: string): Buffer {
    const salt = crypto
      .createHash("sha256")
      .update("inspect-native-store")
      .digest()
      .subarray(0, 32);
    return crypto.pbkdf2Sync(passphrase, salt, 100_000, KEY_LENGTH, "sha512");
  }

  /**
   * Load or create an encryption key.
   */
  private loadOrCreateKey(dir: string): string {
    const keyPath = path.join(dir, "native-store.key");
    try {
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath, "utf-8").trim();
      }
      const key = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(keyPath, key, { mode: 0o600 });
      return key;
    } catch (error) {
      logger.debug("Failed to load or create key file, using ephemeral key", { error });
      return crypto.randomBytes(32).toString("hex");
    }
  }

  /**
   * Load entries from disk.
   */
  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const entries = JSON.parse(raw) as NativeCredentialEntry[];
      for (const entry of entries) {
        this.entries.set(entry.id, entry);
      }
    } catch (error) {
      logger.warn("Failed to load credential store, starting fresh", { error });
    }
  }

  /**
   * Save entries to disk.
   */
  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const data = JSON.stringify(
        Array.from(this.entries.values()),
        null,
        2,
      );
      fs.writeFileSync(this.filePath, data, { mode: 0o600 });
    } catch (error) {
      logger.error("Failed to save native credential store", { error });
    }
  }
}
