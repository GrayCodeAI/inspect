// ============================================================================
// @inspect/credentials - Credential Vault
// ============================================================================

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { Config, ConfigProvider, Effect } from "effect";
import { generateId, getCwd } from "@inspect/shared";
import type { CredentialConfig, CredentialProviderType, CredentialType } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("credentials/vault");

/** Options for creating a credential */
export interface CreateCredentialOptions {
  provider?: CredentialProviderType;
  type: CredentialType;
  label: string;
  domain?: string;
  profileId?: string;
  totpSecret?: string;
  data: Record<string, unknown>;
}

/** Options for updating a credential */
export interface UpdateCredentialOptions {
  label?: string;
  domain?: string;
  data?: Record<string, unknown>;
  totpSecret?: string;
}

/** Credential test result */
export interface CredentialTestResult {
  success: boolean;
  message: string;
  testedAt: number;
}

/** Encryption algorithm and parameters */
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 600_000;
/** Legacy iteration count for backward-compatible decryption of pre-upgrade vaults */
const PBKDF2_ITERATIONS_LEGACY = 100_000;

/**
 * CredentialVault provides encrypted credential storage with CRUD operations.
 * Uses AES-256-GCM for encryption with a master key derived from environment
 * variable or keyfile. Stores credentials in .inspect/credentials.enc.
 */
export class CredentialVault {
  private credentials: Map<string, CredentialConfig> = new Map();
  private rawKey: string;
  private storagePath: string;
  private loaded: boolean = false;

  constructor(options?: { basePath?: string; masterKey?: string; keyFilePath?: string }) {
    const basePath = options?.basePath ?? getCwd();
    this.storagePath = path.join(basePath, ".inspect", "credentials.enc");

    // Derive master key from environment, provided key, or keyfile
    const envKeys = Effect.runSync(
      Config.all({
        credentialKey: Config.option(Config.string("INSPECT_CREDENTIAL_KEY")),
        masterKey: Config.option(Config.string("INSPECT_MASTER_KEY")),
      }).parse(ConfigProvider.fromEnv()),
    );
    const rawKey =
      options?.masterKey ??
      (envKeys.credentialKey._tag === "Some" ? envKeys.credentialKey.value : undefined) ??
      (envKeys.masterKey._tag === "Some" ? envKeys.masterKey.value : undefined) ??
      this.readKeyFile(options?.keyFilePath ?? path.join(basePath, ".inspect", "master.key"));

    if (!rawKey) {
      // Generate a new key and save it
      const newKey = crypto.randomBytes(KEY_LENGTH).toString("hex");
      const keyDir = path.join(basePath, ".inspect");
      fs.mkdirSync(keyDir, { recursive: true });
      const keyPath = path.join(keyDir, "master.key");
      if (!fs.existsSync(keyPath)) {
        fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
      }
      this.rawKey = newKey;
    } else {
      this.rawKey = rawKey;
    }

    this.ensureDir(path.dirname(this.storagePath));
    this.load();
  }

  /**
   * Create a new credential.
   */
  create(options: CreateCredentialOptions): CredentialConfig {
    const now = Date.now();
    const credential: CredentialConfig = {
      id: generateId(),
      provider: options.provider ?? "native",
      type: options.type,
      label: options.label,
      domain: options.domain,
      profileId: options.profileId,
      totpSecret: options.totpSecret,
      data: options.data,
      createdAt: now,
      updatedAt: now,
    };

    this.credentials.set(credential.id, credential);
    this.save();
    return this.sanitize(credential);
  }

  /**
   * Get a credential by ID.
   */
  get(id: string): CredentialConfig | null {
    const cred = this.credentials.get(id);
    return cred ? { ...cred } : null;
  }

  /**
   * Get credential with sensitive data redacted (for API responses).
   */
  getSafe(id: string): CredentialConfig | null {
    const cred = this.credentials.get(id);
    return cred ? this.sanitize(cred) : null;
  }

  /**
   * Update an existing credential.
   */
  update(id: string, options: UpdateCredentialOptions): CredentialConfig | null {
    const cred = this.credentials.get(id);
    if (!cred) return null;

    if (options.label !== undefined) cred.label = options.label;
    if (options.domain !== undefined) cred.domain = options.domain;
    if (options.totpSecret !== undefined) cred.totpSecret = options.totpSecret;
    if (options.data !== undefined) {
      cred.data = { ...cred.data, ...options.data };
    }
    cred.updatedAt = Date.now();

    this.credentials.set(id, cred);
    this.save();
    return this.sanitize(cred);
  }

  /**
   * Delete a credential.
   */
  delete(id: string): boolean {
    const existed = this.credentials.delete(id);
    if (existed) {
      this.save();
    }
    return existed;
  }

  /**
   * List all credentials (sanitized).
   */
  list(filter?: {
    provider?: CredentialProviderType;
    type?: CredentialType;
    domain?: string;
  }): CredentialConfig[] {
    let creds = Array.from(this.credentials.values());

    if (filter?.provider) {
      creds = creds.filter((c) => c.provider === filter.provider);
    }
    if (filter?.type) {
      creds = creds.filter((c) => c.type === filter.type);
    }
    if (filter?.domain) {
      creds = creds.filter((c) => c.domain && c.domain.includes(filter.domain!));
    }

    return creds.map((c) => this.sanitize(c));
  }

  /**
   * Test a credential (verifies basic structure/connectivity).
   */
  async test(id: string): Promise<CredentialTestResult> {
    const cred = this.credentials.get(id);
    if (!cred) {
      return {
        success: false,
        message: "Credential not found",
        testedAt: Date.now(),
      };
    }

    try {
      let success = false;
      let message = "";

      switch (cred.type) {
        case "password":
          success = Boolean(cred.data.username && cred.data.password);
          message = success ? "Username and password are set" : "Missing username or password";
          break;

        case "api-key":
          success = Boolean(cred.data.apiKey || cred.data.key || cred.data.token);
          message = success ? "API key is present" : "No API key found in credential data";
          break;

        case "oauth":
          success = Boolean(cred.data.clientId && cred.data.clientSecret);
          message = success
            ? "OAuth client credentials are set"
            : "Missing clientId or clientSecret";
          break;

        case "totp":
          success = Boolean(cred.totpSecret || cred.data.secret);
          message = success ? "TOTP secret is configured" : "No TOTP secret found";
          break;

        case "certificate":
          success = Boolean(cred.data.certificate || cred.data.certPath);
          message = success ? "Certificate is configured" : "No certificate data found";
          break;

        default:
          success = Object.keys(cred.data).length > 0;
          message = success ? "Credential data is present" : "Credential data is empty";
      }

      cred.lastTestedAt = Date.now();
      cred.lastTestPassed = success;
      this.save();

      return { success, message, testedAt: Date.now() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      cred.lastTestedAt = Date.now();
      cred.lastTestPassed = false;
      this.save();
      return { success: false, message, testedAt: Date.now() };
    }
  }

  /**
   * Find credentials by domain.
   */
  findByDomain(domain: string): CredentialConfig[] {
    return Array.from(this.credentials.values())
      .filter((c) => c.domain && domain.includes(c.domain))
      .map((c) => this.sanitize(c));
  }

  /**
   * Get credential count.
   */
  get count(): number {
    return this.credentials.size;
  }

  /**
   * Encrypt data using AES-256-GCM with a random salt.
   * Format: Salt (32) + IV (16) + Tag (16) + Encrypted data
   */
  encrypt(plaintext: string): Buffer {
    const { key, salt } = this.deriveKey(this.rawKey);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([salt, iv, tag, encrypted]);
  }

  /**
   * Decrypt data using AES-256-GCM.
   * Tries current iteration count first, falls back to legacy for pre-upgrade vaults.
   * Format: Salt (32) + IV (16) + Tag (16) + Encrypted data
   */
  decrypt(data: Buffer): string {
    if (data.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
      throw new Error("Invalid encrypted data: too short");
    }

    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    // Try current iteration count first
    try {
      return this.decryptWithIterations(salt, iv, tag, encrypted, PBKDF2_ITERATIONS);
    } catch (error) {
      logger.debug("Current PBKDF2 iterations failed, trying legacy", { error });
      return this.decryptWithIterations(salt, iv, tag, encrypted, PBKDF2_ITERATIONS_LEGACY);
    }
  }

  private decryptWithIterations(
    salt: Buffer,
    iv: Buffer,
    tag: Buffer,
    encrypted: Buffer,
    iterations: number,
  ): string {
    const { key } = this.deriveKey(this.rawKey, salt, iterations);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
  }

  /**
   * Derive a 256-bit key from a passphrase using PBKDF2.
   * Uses a random salt that is stored alongside the encrypted data.
   */
  private deriveKey(
    passphrase: string,
    salt?: Buffer,
    iterations?: number,
  ): { key: Buffer; salt: Buffer } {
    const keySalt = salt ?? crypto.randomBytes(SALT_LENGTH);

    const key = crypto.pbkdf2Sync(
      passphrase,
      keySalt,
      iterations ?? PBKDF2_ITERATIONS,
      KEY_LENGTH,
      "sha512",
    );

    return { key, salt: keySalt };
  }

  /**
   * Read a key from a keyfile.
   */
  private readKeyFile(keyPath: string): string | null {
    try {
      if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath, "utf-8").trim();
      }
    } catch (error) {
      logger.debug("Failed to read key file", { keyPath, error });
    }
    return null;
  }

  /**
   * Load credentials from encrypted storage.
   * Transparently upgrades legacy vaults encrypted with weaker PBKDF2 iterations.
   */
  private load(): void {
    try {
      if (!fs.existsSync(this.storagePath)) {
        this.loaded = true;
        return;
      }

      const encryptedData = fs.readFileSync(this.storagePath);
      const needsUpgrade = this.isLegacyEncryption(encryptedData);
      const json = this.decrypt(encryptedData);
      const creds = JSON.parse(json) as CredentialConfig[];

      this.credentials.clear();
      for (const cred of creds) {
        this.credentials.set(cred.id, cred);
      }
      this.loaded = true;

      // Auto-upgrade: re-encrypt with current iteration count
      if (needsUpgrade) {
        this.save();
      }
    } catch (error) {
      logger.error("Failed to load credentials", {
        error: error instanceof Error ? error.message : error,
      });
      this.loaded = true;
    }
  }

  /**
   * Check if encrypted data was produced with legacy (weaker) iterations.
   * Returns true if decryption succeeds only with legacy iterations.
   */
  private isLegacyEncryption(data: Buffer): boolean {
    if (data.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) return false;

    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    try {
      this.decryptWithIterations(salt, iv, tag, encrypted, PBKDF2_ITERATIONS);
      return false; // Current iterations work — not legacy
    } catch (error) {
      logger.debug("Current iteration decryption failed, vault uses legacy encryption", { error });
      return true;
    }
  }

  /**
   * Save credentials to encrypted storage.
   */
  private save(): void {
    try {
      const creds = Array.from(this.credentials.values());
      const json = JSON.stringify(creds);
      const encrypted = this.encrypt(json);
      fs.writeFileSync(this.storagePath, encrypted, { mode: 0o600 });
    } catch (error) {
      logger.error("Failed to save credentials", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Sanitize a credential for external consumption (redact sensitive data).
   */
  private sanitize(cred: CredentialConfig): CredentialConfig {
    const sanitized = { ...cred, data: { ...cred.data } };

    // Redact sensitive fields
    const sensitiveKeys = [
      "password",
      "secret",
      "apiKey",
      "key",
      "token",
      "clientSecret",
      "privateKey",
      "certificate",
    ];
    for (const key of sensitiveKeys) {
      if (key in sanitized.data) {
        const val = String(sanitized.data[key]);
        sanitized.data[key] = val.length > 4 ? `****${val.slice(-4)}` : "****";
      }
    }

    if (sanitized.totpSecret) {
      sanitized.totpSecret = "****";
    }

    return sanitized;
  }

  /**
   * Ensure directory exists.
   */
  private ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
  }
}
