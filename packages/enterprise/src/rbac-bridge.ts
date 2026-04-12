// ============================================================================
// @inspect/enterprise - RBAC Bridge
// ============================================================================
// Bridges RBACManager (user roles) with agent-governance PermissionManager
// (agent permissions). Maps enterprise roles to agent permission configurations.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getCwd } from "@inspect/shared";
import { createLogger } from "@inspect/observability";
import { Role, RBACManager, type UserIdentity } from "./rbac.js";

// Re-declare AgentPermissions interface to avoid import dependency
interface AgentPermissions {
  allowedDomains: string[];
  blockedDomains: string[];
  allowedActions: string[];
  blockedActions: string[];
  maxFileUploadSize: number;
  allowFormSubmission: boolean;
  allowNavigation: boolean;
  allowJavaScript: boolean;
  allowDownloads: boolean;
  allowCookies: boolean;
}

const logger = createLogger("enterprise/rbac-bridge");

// ============================================================================
// Agent Permission Profiles by Role
// ============================================================================

const ROLE_PERMISSION_PROFILES: Record<Role, Partial<AgentPermissions>> = {
  [Role.VIEWER]: {
    // Viewers: read-only, no interactions
    allowedDomains: ["*"],
    blockedDomains: [],
    allowedActions: ["screenshot", "extract", "assert", "wait"],
    blockedActions: [],
    maxFileUploadSize: 0,
    allowFormSubmission: false,
    allowNavigation: false,
    allowJavaScript: false,
    allowDownloads: false,
    allowCookies: false,
  },

  [Role.TESTER]: {
    // Testers: standard browser automation
    allowedDomains: ["*"],
    blockedDomains: ["admin.internal", "billing.internal"],
    allowedActions: [
      "navigate",
      "click",
      "type",
      "select",
      "scroll",
      "hover",
      "screenshot",
      "extract",
      "assert",
      "wait",
      "press",
    ],
    blockedActions: [],
    maxFileUploadSize: 10 * 1024 * 1024, // 10MB
    allowFormSubmission: true,
    allowNavigation: true,
    allowJavaScript: false,
    allowDownloads: false,
    allowCookies: true,
  },

  [Role.ADMIN]: {
    // Admins: full access
    allowedDomains: ["*"],
    blockedDomains: [],
    allowedActions: ["*"],
    blockedActions: [],
    maxFileUploadSize: 100 * 1024 * 1024, // 100MB
    allowFormSubmission: true,
    allowNavigation: true,
    allowJavaScript: true,
    allowDownloads: true,
    allowCookies: true,
  },

  [Role.SECURITY]: {
    // Security team: security testing
    allowedDomains: ["*"],
    blockedDomains: [],
    allowedActions: [
      "navigate",
      "click",
      "type",
      "select",
      "scroll",
      "hover",
      "screenshot",
      "extract",
      "assert",
      "wait",
      "press",
    ],
    blockedActions: [],
    maxFileUploadSize: 50 * 1024 * 1024, // 50MB
    allowFormSubmission: true,
    allowNavigation: true,
    allowJavaScript: true,
    allowDownloads: true,
    allowCookies: true,
  },

  [Role.SUPER_ADMIN]: {
    // Super admins: unrestricted
    allowedDomains: ["*"],
    blockedDomains: [],
    allowedActions: ["*"],
    blockedActions: [],
    maxFileUploadSize: 500 * 1024 * 1024, // 500MB
    allowFormSubmission: true,
    allowNavigation: true,
    allowJavaScript: true,
    allowDownloads: true,
    allowCookies: true,
  },
};

// ============================================================================
// RBAC User Persistence
// ============================================================================

interface PersistentUser {
  id: string;
  email: string;
  name: string;
  role: string; // Stored as string
  tenantId?: string;
}

export class RBACUserPersistence {
  private rbacManager: RBACManager;
  private storagePath: string;
  private rawKey: string;
  private loaded: boolean = false;

  // Encryption parameters (matching credentials vault pattern)
  private readonly ALGORITHM = "aes-256-gcm";
  private readonly KEY_LENGTH = 32;
  private readonly IV_LENGTH = 16;
  private readonly TAG_LENGTH = 16;
  private readonly SALT_LENGTH = 32;
  private readonly PBKDF2_ITERATIONS = 600_000;
  private readonly PBKDF2_ITERATIONS_LEGACY = 100_000;

  constructor(
    rbacManager: RBACManager,
    options?: { basePath?: string; masterKey?: string; keyFilePath?: string },
  ) {
    this.rbacManager = rbacManager;
    const basePath = options?.basePath ?? getCwd();
    this.storagePath = path.join(basePath, ".inspect", "rbac-users.json");

    // Derive master key
    const rawKey =
      options?.masterKey ??
      process.env.INSPECT_CREDENTIAL_KEY ??
      process.env.INSPECT_MASTER_KEY ??
      this.readKeyFile(options?.keyFilePath ?? path.join(basePath, ".inspect", "master.key"));

    if (!rawKey) {
      const newKey = crypto.randomBytes(this.KEY_LENGTH).toString("hex");
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

  private load(): void {
    try {
      if (!fs.existsSync(this.storagePath)) {
        this.loaded = true;
        return;
      }

      const data = fs.readFileSync(this.storagePath, "utf8");
      const decrypted = this.decrypt(data);
      const parsed = JSON.parse(decrypted) as PersistentUser[];

      for (const userdata of parsed) {
        this.rbacManager.registerUser({
          id: userdata.id,
          email: userdata.email,
          name: userdata.name,
          role: userdata.role as Role,
          tenantId: userdata.tenantId,
        });
      }

      this.loaded = true;
      logger.info(`Loaded ${parsed.length} RBAC users`);
    } catch (err) {
      logger.error(`Failed to load RBAC users: ${err}`);
      this.loaded = true;
    }
  }

  save(users: UserIdentity[]): void {
    try {
      const data: PersistentUser[] = users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        tenantId: u.tenantId,
      }));

      const json = JSON.stringify(data, null, 2);
      const encrypted = this.encrypt(json);
      fs.writeFileSync(this.storagePath, encrypted, { mode: 0o600 });
      logger.debug(`Saved ${users.length} RBAC users`);
    } catch (err) {
      logger.error(`Failed to save RBAC users: ${err}`);
    }
  }

  private encrypt(plaintext: string): string {
    const salt = crypto.randomBytes(this.SALT_LENGTH);
    const key = crypto.pbkdf2Sync(
      this.rawKey,
      salt,
      this.PBKDF2_ITERATIONS,
      this.KEY_LENGTH,
      "sha512",
    );
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const tag = cipher.getAuthTag();
    return (
      salt.toString("hex") + ":" + iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted
    );
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

    let key = crypto.pbkdf2Sync(
      this.rawKey,
      salt,
      this.PBKDF2_ITERATIONS,
      this.KEY_LENGTH,
      "sha512",
    );

    try {
      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      key = crypto.pbkdf2Sync(
        this.rawKey,
        salt,
        this.PBKDF2_ITERATIONS_LEGACY,
        this.KEY_LENGTH,
        "sha512",
      );
      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
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
      if (err instanceof Error && "code" in err && err.code !== "EEXIST") {
        throw err;
      }
    }
  }
}

// ============================================================================
// RBAC Bridge
// ============================================================================

export function buildAgentPermissions(user: UserIdentity): Partial<AgentPermissions> {
  const profile = ROLE_PERMISSION_PROFILES[user.role];
  if (!profile) {
    logger.warn(`No permission profile for role: ${user.role}`);
    return ROLE_PERMISSION_PROFILES[Role.VIEWER] || {};
  }
  return profile;
}

export function mapSSORolesToRoles(ssoRoles: string[]): Role | undefined {
  // Map SSO provider roles to local roles
  // This is a simple example - expand based on your SSO provider
  const roleMap: Record<string, Role> = {
    // Common SSO role names
    admin: Role.ADMIN,
    administrator: Role.ADMIN,
    super_admin: Role.SUPER_ADMIN,
    superadmin: Role.SUPER_ADMIN,
    tester: Role.TESTER,
    test_user: Role.TESTER,
    security: Role.SECURITY,
    security_engineer: Role.SECURITY,
    viewer: Role.VIEWER,
    readonly: Role.VIEWER,
    read_only: Role.VIEWER,
  };

  for (const ssoRole of ssoRoles) {
    const normalized = ssoRole.toLowerCase().replace(/[_-]/g, "_");
    const mapped = roleMap[normalized];
    if (mapped) {
      logger.debug(`Mapped SSO role '${ssoRole}' to '${mapped}'`);
      return mapped;
    }
  }

  return undefined;
}

export function applyTenantIsolation(
  user: UserIdentity,
  targetTenantId: string,
): { allowed: boolean; reason?: string } {
  // Prevent cross-tenant access
  if (user.tenantId && user.tenantId !== targetTenantId && user.role !== Role.SUPER_ADMIN) {
    return {
      allowed: false,
      reason: `User is in tenant '${user.tenantId}', cannot access tenant '${targetTenantId}'`,
    };
  }
  return { allowed: true };
}

// ============================================================================
// WebSocket Authentication Middleware
// ============================================================================

export interface WebSocketUpgradeRequest {
  headers: Record<string, string | string[]>;
  url: string;
}

export function extractJWTFromWebSocketRequest(req: WebSocketUpgradeRequest): string | undefined {
  // Try Authorization header first
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.substring(7);
  }

  // Try query parameter ?token=...
  try {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");
    if (token) return token;
  } catch {
    // Invalid URL, ignore
  }

  return undefined;
}

export function validateWebSocketAuth(
  req: WebSocketUpgradeRequest,
  rbacManager: RBACManager,
  verifyJWT: (token: string) => UserIdentity | null,
): { authorized: boolean; user?: UserIdentity; reason?: string } {
  const token = extractJWTFromWebSocketRequest(req);

  if (!token) {
    return {
      authorized: false,
      reason: "No authentication token provided",
    };
  }

  try {
    const user = verifyJWT(token);
    if (!user) {
      return {
        authorized: false,
        reason: "Invalid or expired token",
      };
    }

    return { authorized: true, user };
  } catch (err) {
    logger.error(`WebSocket authentication failed: ${err}`);
    return {
      authorized: false,
      reason: "Authentication error",
    };
  }
}
