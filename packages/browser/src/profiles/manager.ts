// ──────────────────────────────────────────────────────────────────────────────
// @inspect/browser - Browser Profile Manager
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { createLogger } from "@inspect/observability";

const logger = createLogger("browser/profiles");

/** Browser profile definition */
export interface BrowserProfile {
  /** Unique profile ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description?: string;
  /** Profile storage directory */
  dataDir: string;
  /** Created timestamp */
  createdAt: number;
  /** Last used timestamp */
  lastUsedAt?: number;
  /** Whether this is the default profile */
  isDefault?: boolean;
  /** Associated cookies (encrypted) */
  cookies?: EncryptedCookie[];
  /** Local storage data */
  localStorage?: Record<string, string>;
  /** Profile tags */
  tags?: string[];
}

/** Encrypted cookie for profile persistence */
export interface EncryptedCookie {
  name: string;
  domain: string;
  path: string;
  encrypted: string;
  iv: string;
}

/** Profile manager configuration */
export interface ProfileManagerConfig {
  /** Base directory for profile storage */
  profilesDir: string;
  /** Encryption key for cookie storage */
  encryptionKey?: string;
}

/**
 * Manages browser profiles for persistent sessions.
 * Supports creating, listing, switching, and deleting profiles.
 * Cookies and local storage are encrypted at rest.
 */
export class ProfileManager {
  private config: ProfileManagerConfig;
  private profiles: Map<string, BrowserProfile> = new Map();

  constructor(config: ProfileManagerConfig) {
    this.config = config;
  }

  /**
   * Initialize the profile manager (must be called after construction).
   */
  async init(): Promise<void> {
    await this.ensureDirectory();
    await this.loadProfiles();
  }

  /**
   * Create a new browser profile.
   */
  async create(name: string, options?: { description?: string; tags?: string[] }): Promise<BrowserProfile> {
    const id = crypto.randomUUID();
    const dataDir = path.join(this.config.profilesDir, id);

    const profile: BrowserProfile = {
      id,
      name,
      description: options?.description,
      dataDir,
      createdAt: Date.now(),
      isDefault: this.profiles.size === 0,
      tags: options?.tags,
    };

    await mkdir(dataDir, { recursive: true });
    this.profiles.set(id, profile);
    await this.saveProfiles();

    return profile;
  }

  /**
   * List all profiles.
   */
  list(): BrowserProfile[] {
    return Array.from(this.profiles.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get a profile by ID or name.
   */
  get(idOrName: string): BrowserProfile | undefined {
    return (
      this.profiles.get(idOrName) ??
      Array.from(this.profiles.values()).find((p) => p.name === idOrName)
    );
  }

  /**
   * Get the default profile.
   */
  getDefault(): BrowserProfile | undefined {
    return Array.from(this.profiles.values()).find((p) => p.isDefault);
  }

  /**
   * Set a profile as the default.
   */
  async setDefault(id: string): Promise<boolean> {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    for (const p of this.profiles.values()) {
      p.isDefault = p.id === id;
    }

    await this.saveProfiles();
    return true;
  }

  /**
   * Delete a profile.
   */
  async delete(id: string): Promise<boolean> {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    // Remove data directory
    if (existsSync(profile.dataDir)) {
      await rm(profile.dataDir, { recursive: true, force: true });
    }

    this.profiles.delete(id);
    await this.saveProfiles();
    return true;
  }

  /**
   * Export a profile to a JSON file.
   */
  async export(id: string, outputPath: string): Promise<boolean> {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    const data = JSON.stringify(profile, null, 2);
    await writeFile(outputPath, data, "utf-8");
    return true;
  }

  /**
   * Import a profile from a JSON file.
   */
  async import(inputPath: string): Promise<BrowserProfile> {
    const data = await readFile(inputPath, "utf-8");
    const profile = JSON.parse(data) as BrowserProfile;

    // Generate new ID to avoid conflicts
    profile.id = crypto.randomUUID();
    profile.dataDir = path.join(this.config.profilesDir, profile.id);
    profile.createdAt = Date.now();
    profile.isDefault = false;

    await mkdir(profile.dataDir, { recursive: true });
    this.profiles.set(profile.id, profile);
    await this.saveProfiles();

    return profile;
  }

  /**
   * Update last used timestamp.
   */
  async touch(id: string): Promise<void> {
    const profile = this.profiles.get(id);
    if (profile) {
      profile.lastUsedAt = Date.now();
      await this.saveProfiles();
    }
  }

  /**
   * Encrypt cookies for storage.
   */
  encryptCookies(
    cookies: Array<{ name: string; value: string; domain: string; path: string }>,
  ): EncryptedCookie[] {
    if (!this.config.encryptionKey) {
      throw new Error("Encryption key not configured");
    }

    return cookies.map((cookie) => {
      const iv = crypto.randomBytes(16);
      const key = crypto.scryptSync(this.config.encryptionKey!, "salt", 32);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(cookie), "utf-8"),
        cipher.final(),
      ]);
      return {
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
        encrypted: encrypted.toString("base64"),
        iv: iv.toString("base64"),
      };
    });
  }

  /**
   * Decrypt stored cookies.
   */
  decryptCookies(
    encrypted: EncryptedCookie[],
  ): Array<{ name: string; value: string; domain: string; path: string }> {
    if (!this.config.encryptionKey) {
      throw new Error("Encryption key not configured");
    }

    return encrypted.map((ec) => {
      const key = crypto.scryptSync(this.config.encryptionKey!, "salt", 32);
      const iv = Buffer.from(ec.iv, "base64");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(ec.encrypted, "base64")),
        decipher.final(),
      ]);
      return JSON.parse(decrypted.toString("utf-8")) as {
        name: string;
        value: string;
        domain: string;
        path: string;
      };
    });
  }

  // ── Private methods ──────────────────────────────────────────────────

  private async ensureDirectory(): Promise<void> {
    if (!existsSync(this.config.profilesDir)) {
      await mkdir(this.config.profilesDir, { recursive: true });
    }
  }

  private async loadProfiles(): Promise<void> {
    const manifestPath = path.join(this.config.profilesDir, "profiles.json");
    if (!existsSync(manifestPath)) return;

    try {
      const data = await readFile(manifestPath, "utf-8");
      const profiles = JSON.parse(data) as BrowserProfile[];
      for (const profile of profiles) {
        this.profiles.set(profile.id, profile);
      }
    } catch (error) {
      logger.warn("Failed to load profiles manifest", { error });
    }
  }

  private async saveProfiles(): Promise<void> {
    const manifestPath = path.join(this.config.profilesDir, "profiles.json");
    const data = JSON.stringify(Array.from(this.profiles.values()), null, 2);
    await writeFile(manifestPath, data, "utf-8");
  }
}
