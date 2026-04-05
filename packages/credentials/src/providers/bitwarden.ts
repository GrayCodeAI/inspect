// ============================================================================
// @inspect/credentials - Bitwarden Integration
// ============================================================================

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Bitwarden vault item */
export interface BitwardenItem {
  id: string;
  name: string;
  type: number;
  login?: {
    username: string;
    password: string;
    uris?: Array<{ uri: string }>;
    totp?: string;
  };
  notes?: string;
  fields?: Array<{ name: string; value: string; type: number }>;
  folderId?: string;
  organizationId?: string;
  creationDate: string;
  revisionDate: string;
}

/** Bitwarden session status */
export interface BitwardenStatus {
  serverUrl: string | null;
  lastSync: string | null;
  status: "unauthenticated" | "locked" | "unlocked";
  userEmail?: string;
}

/**
 * BitwardenIntegration interacts with the Bitwarden CLI (bw) to
 * retrieve credentials from a Bitwarden vault. Requires the `bw`
 * CLI to be installed and accessible in PATH.
 */
export class BitwardenIntegration {
  private sessionToken: string | null = null;
  private bwPath: string;

  constructor(options?: { bwPath?: string; sessionToken?: string }) {
    this.bwPath = options?.bwPath ?? "bw";
    this.sessionToken = options?.sessionToken ?? null;
  }

  /**
   * Check the Bitwarden CLI status.
   */
  async status(): Promise<BitwardenStatus> {
    const result = await this.exec(["status"]);
    return JSON.parse(result);
  }

  /**
   * Login to Bitwarden vault.
   *
   * @param email - Bitwarden account email
   * @param password - Master password
   * @param method - 2FA method (optional): 0=authenticator, 1=email, 3=yubikey
   * @param code - 2FA code (optional)
   */
  async login(email: string, password: string, method?: number, code?: string): Promise<string> {
    const args = ["login", email, password, "--raw"];
    if (method !== undefined) {
      args.push("--method", String(method));
    }
    if (code) {
      args.push("--code", code);
    }

    this.sessionToken = await this.exec(args);
    return this.sessionToken;
  }

  /**
   * Login using API key (non-interactive).
   */
  async loginApiKey(clientId: string, clientSecret: string): Promise<string> {
    const env: Record<string, string> = {};
    if (process.env.PATH) env.PATH = process.env.PATH;
    if (process.env.HOME) env.HOME = process.env.HOME;
    env.BW_CLIENTID = clientId;
    env.BW_CLIENTSECRET = clientSecret;

    const { stdout } = await execFileAsync(this.bwPath, ["login", "--apikey", "--raw"], { env });
    this.sessionToken = stdout.trim();
    return this.sessionToken;
  }

  /**
   * Unlock the vault with master password.
   */
  async unlock(password: string): Promise<string> {
    this.sessionToken = await this.exec(["unlock", password, "--raw"]);
    return this.sessionToken;
  }

  /**
   * Lock the vault.
   */
  async lock(): Promise<void> {
    await this.exec(["lock"]);
    this.sessionToken = null;
  }

  /**
   * Sync the vault.
   */
  async sync(): Promise<void> {
    await this.exec(["sync"]);
  }

  /**
   * Get a vault item by ID.
   */
  async getItem(id: string): Promise<BitwardenItem> {
    const result = await this.exec(["get", "item", id]);
    return JSON.parse(result);
  }

  /**
   * Search for items by name.
   */
  async searchItems(query: string): Promise<BitwardenItem[]> {
    const result = await this.exec(["list", "items", "--search", query]);
    return JSON.parse(result);
  }

  /**
   * List all items, optionally filtered by folder.
   */
  async listItems(folderId?: string): Promise<BitwardenItem[]> {
    const args = ["list", "items"];
    if (folderId) {
      args.push("--folderid", folderId);
    }
    const result = await this.exec(args);
    return JSON.parse(result);
  }

  /**
   * Get username and password for a specific item.
   */
  async getCredentials(
    itemId: string,
  ): Promise<{ username: string; password: string; totp?: string } | null> {
    const item = await this.getItem(itemId);
    if (!item.login) return null;

    return {
      username: item.login.username,
      password: item.login.password,
      totp: item.login.totp ?? undefined,
    };
  }

  /**
   * Get a specific field value from an item.
   */
  async getField(itemId: string, fieldName: string): Promise<string | null> {
    const item = await this.getItem(itemId);
    if (!item.fields) return null;

    const field = item.fields.find((f) => f.name.toLowerCase() === fieldName.toLowerCase());
    return field?.value ?? null;
  }

  /**
   * Generate a TOTP code for an item.
   */
  async getTOTP(itemId: string): Promise<string> {
    return this.exec(["get", "totp", itemId]);
  }

  /**
   * Get password for an item by ID.
   */
  async getPassword(itemId: string): Promise<string> {
    return this.exec(["get", "password", itemId]);
  }

  /**
   * Get username for an item by ID.
   */
  async getUsername(itemId: string): Promise<string> {
    return this.exec(["get", "username", itemId]);
  }

  /**
   * Generate a random password.
   */
  async generatePassword(options?: {
    length?: number;
    uppercase?: boolean;
    lowercase?: boolean;
    number?: boolean;
    special?: boolean;
  }): Promise<string> {
    const args = ["generate"];
    const len = options?.length ?? 24;
    args.push("--length", String(len));

    if (options?.uppercase !== false) args.push("--uppercase");
    if (options?.lowercase !== false) args.push("--lowercase");
    if (options?.number !== false) args.push("--number");
    if (options?.special) args.push("--special");

    return this.exec(args);
  }

  /**
   * Set the session token directly.
   */
  setSession(token: string): void {
    this.sessionToken = token;
  }

  /**
   * Execute a Bitwarden CLI command.
   */
  private async exec(args: string[]): Promise<string> {
    const env: Record<string, string> = {};
    if (process.env.PATH) env.PATH = process.env.PATH;
    if (process.env.HOME) env.HOME = process.env.HOME;
    if (this.sessionToken) {
      env.BW_SESSION = this.sessionToken;
    }

    try {
      const { stdout } = await execFileAsync(this.bwPath, args, {
        env,
        timeout: 30_000,
      });
      return stdout.trim();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Bitwarden CLI error: ${msg}`, { cause: error });
    }
  }
}
