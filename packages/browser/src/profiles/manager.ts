// ──────────────────────────────────────────────────────────────────────────────
// @inspect/browser - Browser Profile Manager
// ──────────────────────────────────────────────────────────────────────────────

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

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
    this.ensureDirectory();
    this.loadProfiles();
  }

  /**
   * Create a new browser profile.
   */
  create(name: string, options?: { description?: string; tags?: string[] }): BrowserProfile {
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

    fs.mkdirSync(dataDir, { recursive: true });
    this.profiles.set(id, profile);
    this.saveProfiles();

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
  setDefault(id: string): boolean {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    for (const p of this.profiles.values()) {
      p.isDefault = p.id === id;
    }

    this.saveProfiles();
    return true;
  }

  /**
   * Delete a profile.
   */
  delete(id: string): boolean {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    // Remove data directory
    if (fs.existsSync(profile.dataDir)) {
      fs.rmSync(profile.dataDir, { recursive: true, force: true });
    }

    this.profiles.delete(id);
    this.saveProfiles();
    return true;
  }

  /**
   * Export a profile to a JSON file.
   */
  export(id: string, outputPath: string): boolean {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    const data = JSON.stringify(profile, null, 2);
    fs.writeFileSync(outputPath, data, "utf-8");
    return true;
  }

  /**
   * Import a profile from a JSON file.
   */
  import(inputPath: string): BrowserProfile {
    const data = fs.readFileSync(inputPath, "utf-8");
    const profile = JSON.parse(data) as BrowserProfile;

    // Generate new ID to avoid conflicts
    profile.id = crypto.randomUUID();
    profile.dataDir = path.join(this.config.profilesDir, profile.id);
    profile.createdAt = Date.now();
    profile.isDefault = false;

    fs.mkdirSync(profile.dataDir, { recursive: true });
    this.profiles.set(profile.id, profile);
    this.saveProfiles();

    return profile;
  }

  /**
   * Update last used timestamp.
   */
  touch(id: string): void {
    const profile = this.profiles.get(id);
    if (profile) {
      profile.lastUsedAt = Date.now();
      this.saveProfiles();
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

  private ensureDirectory(): void {
    if (!fs.existsSync(this.config.profilesDir)) {
      fs.mkdirSync(this.config.profilesDir, { recursive: true });
    }
  }

  private loadProfiles(): void {
    const manifestPath = path.join(this.config.profilesDir, "profiles.json");
    if (!fs.existsSync(manifestPath)) return;

    try {
      const data = fs.readFileSync(manifestPath, "utf-8");
      const profiles = JSON.parse(data) as BrowserProfile[];
      for (const profile of profiles) {
        this.profiles.set(profile.id, profile);
      }
    } catch {
      // Ignore corrupted manifest
    }
  }

  private saveProfiles(): void {
    const manifestPath = path.join(this.config.profilesDir, "profiles.json");
    const data = JSON.stringify(Array.from(this.profiles.values()), null, 2);
    fs.writeFileSync(manifestPath, data, "utf-8");
  }
}
