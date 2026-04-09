// ============================================================================
// @inspect/credentials - Profile Management
// ============================================================================

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { Config, ConfigProvider, Effect, Schema } from "effect";
import { generateId, getCwd } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("credentials/profiles");

// ============================================================================
// Schema Definitions
// ============================================================================

export class SerializedCookie extends Schema.Class<SerializedCookie>("SerializedCookie")({
  name: Schema.String,
  value: Schema.String,
  domain: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  expires: Schema.optional(Schema.Number),
  httpOnly: Schema.optional(Schema.Boolean),
  secure: Schema.optional(Schema.Boolean),
  sameSite: Schema.optional(Schema.String),
}) {}

export class Profile extends Schema.Class<Profile>("Profile")({
  id: Schema.String,
  name: Schema.String,
  cookies: Schema.Array(SerializedCookie),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
}) {}

export interface CreateProfileOptions {
  name: string;
  cookies?: SerializedCookie[];
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export interface UpdateProfileOptions {
  name?: string;
  cookies?: SerializedCookie[];
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export interface SessionValidationResult {
  valid: boolean;
  expiredCookies: string[];
  reason?: string;
}

// ============================================================================
// Encryption Parameters (matching vault.ts pattern)
// ============================================================================

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_ITERATIONS_LEGACY = 100_000;

// ============================================================================
// ProfileManager
// ============================================================================

export class ProfileManager {
  private profiles: Map<string, Profile> = new Map();
  private rawKey: string;
  private storagePath: string;
  private loaded: boolean = false;

  constructor(options?: { basePath?: string; masterKey?: string; keyFilePath?: string }) {
    const basePath = options?.basePath ?? getCwd();
    this.storagePath = path.join(basePath, ".inspect", "profiles.json");

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
   * Create a new profile
   */
  create(options: CreateProfileOptions): Profile {
    const profile = new Profile({
      id: generateId(),
      name: options.name,
      cookies: options.cookies ?? [],
      headers: options.headers,
      env: options.env,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    this.profiles.set(profile.id, profile);
    this.save();
    logger.info(`Profile created: ${profile.id} (${profile.name})`);
    return profile;
  }

  /**
   * Get a profile by ID
   */
  get(id: string): Profile | undefined {
    return this.profiles.get(id);
  }

  /**
   * Get a profile by name
   */
  getByName(name: string): Profile | undefined {
    for (const profile of this.profiles.values()) {
      if (profile.name === name) {
        return profile;
      }
    }
    return undefined;
  }

  /**
   * List all profiles
   */
  list(): Profile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Update a profile
   */
  update(id: string, options: UpdateProfileOptions): Profile {
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new Error(`Profile not found: ${id}`);
    }

    const updated = new Profile({
      ...profile,
      name: options.name ?? profile.name,
      cookies: options.cookies ?? profile.cookies,
      headers: options.headers ?? profile.headers,
      env: options.env ?? profile.env,
      updatedAt: Date.now(),
    });

    this.profiles.set(id, updated);
    this.save();
    logger.info(`Profile updated: ${id}`);
    return updated;
  }

  /**
   * Delete a profile
   */
  delete(id: string): boolean {
    const deleted = this.profiles.delete(id);
    if (deleted) {
      this.save();
      logger.info(`Profile deleted: ${id}`);
    }
    return deleted;
  }

  /**
   * Validate a profile's session (check cookie expiry)
   */
  validateSession(id: string): SessionValidationResult {
    const profile = this.profiles.get(id);
    if (!profile) {
      return {
        valid: false,
        expiredCookies: [],
        reason: `Profile not found: ${id}`,
      };
    }

    const now = Date.now();
    const expiredCookies: string[] = [];

    for (const cookie of profile.cookies) {
      if (cookie.expires && cookie.expires < now) {
        expiredCookies.push(cookie.name);
      }
    }

    return {
      valid: expiredCookies.length === 0,
      expiredCookies,
      reason:
        expiredCookies.length > 0
          ? `${expiredCookies.length} cookies expired: ${expiredCookies.join(", ")}`
          : undefined,
    };
  }

  // =========================================================================
  // Private Methods - File I/O and Encryption
  // =========================================================================

  private load(): void {
    try {
      if (!fs.existsSync(this.storagePath)) {
        this.loaded = true;
        return;
      }

      const data = fs.readFileSync(this.storagePath, "utf8");
      const decrypted = this.decrypt(data);
      const parsed = JSON.parse(decrypted);

      this.profiles.clear();
      for (const profileData of parsed) {
        const profile = new Profile(profileData);
        this.profiles.set(profile.id, profile);
      }
      this.loaded = true;
      logger.info(`Loaded ${this.profiles.size} profiles`);
    } catch (err) {
      logger.error(`Failed to load profiles: ${err}`);
      this.loaded = true;
    }
  }

  private save(): void {
    try {
      const data = Array.from(this.profiles.values());
      const json = JSON.stringify(data, null, 2);
      const encrypted = this.encrypt(json);
      fs.writeFileSync(this.storagePath, encrypted, { mode: 0o600 });
      logger.debug(`Saved ${this.profiles.size} profiles`);
    } catch (err) {
      logger.error(`Failed to save profiles: ${err}`);
    }
  }

  private encrypt(plaintext: string): string {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = crypto.pbkdf2Sync(this.rawKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha512");
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const tag = cipher.getAuthTag();
    const result =
      salt.toString("hex") + ":" + iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted;
    return result;
  }

  private decrypt(ciphertext: string): string {
    const parts = ciphertext.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted data format");
    }

    const salt = Buffer.from(parts[0], "hex");
    const iv = Buffer.from(parts[1], "hex");
    const tag = Buffer.from(parts[2], "hex");
    const encrypted = parts[3];

    // Try current iteration count first
    let key = crypto.pbkdf2Sync(this.rawKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha512");

    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      // Fallback to legacy iteration count
      logger.debug("Decryption failed with current iteration count, trying legacy");
      key = crypto.pbkdf2Sync(this.rawKey, salt, PBKDF2_ITERATIONS_LEGACY, KEY_LENGTH, "sha512");
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      logger.info("Successfully decrypted with legacy iteration count");
      return decrypted;
    }
  }

  private readKeyFile(keyPath: string): string | undefined {
    try {
      if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath, "utf8").trim();
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private ensureDir(dir: string): void {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch (err) {
      if ((err as any).code !== "EEXIST") {
        throw err;
      }
    }
  }
}
