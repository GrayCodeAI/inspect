// ============================================================================
// @inspect/credentials - 1Password Integration
// ============================================================================

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createLogger } from "@inspect/observability";

const logger = createLogger("credentials/onepassword");

const execFileAsync = promisify(execFile);

/** 1Password item */
export interface OnePasswordItem {
  id: string;
  title: string;
  category: string;
  vault: { id: string; name: string };
  fields?: OnePasswordField[];
  urls?: Array<{ href: string; primary: boolean }>;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

/** 1Password field */
export interface OnePasswordField {
  id: string;
  label: string;
  value: string;
  type: string;
  purpose?: string;
  section?: { id: string; label: string };
}

/** 1Password vault */
export interface OnePasswordVault {
  id: string;
  name: string;
  contentVersion: number;
}

/**
 * OnePasswordIntegration uses the 1Password CLI (op) to retrieve
 * credentials. Requires `op` to be installed and authenticated.
 */
export class OnePasswordIntegration {
  private opPath: string;
  private serviceAccountToken: string | null;
  private account: string | null;

  constructor(options?: { opPath?: string; serviceAccountToken?: string; account?: string }) {
    this.opPath = options?.opPath ?? "op";
    this.serviceAccountToken =
      options?.serviceAccountToken ??
      process.env.OP_SERVICE_ACCOUNT_TOKEN ??
      process.env.ONEPASSWORD_TOKEN ??
      null;
    this.account = options?.account ?? null;
  }

  /**
   * Check if op CLI is available and authenticated.
   */
  async whoami(): Promise<{
    accountUuid: string;
    email: string;
    url: string;
  }> {
    const result = await this.exec(["whoami", "--format", "json"]);
    return JSON.parse(result);
  }

  /**
   * List available vaults.
   */
  async listVaults(): Promise<OnePasswordVault[]> {
    const result = await this.exec(["vault", "list", "--format", "json"]);
    return JSON.parse(result);
  }

  /**
   * Get a specific item by ID or title.
   */
  async getItem(identifier: string, vault?: string): Promise<OnePasswordItem> {
    const args = ["item", "get", identifier, "--format", "json"];
    if (vault) {
      args.push("--vault", vault);
    }
    const result = await this.exec(args);
    return JSON.parse(result);
  }

  /**
   * List items in a vault.
   */
  async listItems(options?: {
    vault?: string;
    categories?: string[];
    tags?: string[];
  }): Promise<OnePasswordItem[]> {
    const args = ["item", "list", "--format", "json"];
    if (options?.vault) {
      args.push("--vault", options.vault);
    }
    if (options?.categories?.length) {
      args.push("--categories", options.categories.join(","));
    }
    if (options?.tags?.length) {
      args.push("--tags", options.tags.join(","));
    }
    const result = await this.exec(args);
    return JSON.parse(result);
  }

  /**
   * Get a specific field value from an item.
   */
  async getField(item: string, field: string, vault?: string): Promise<string> {
    const args = ["item", "get", item, "--fields", field, "--format", "json"];
    if (vault) {
      args.push("--vault", vault);
    }
    const result = await this.exec(args);
    try {
      const parsed = JSON.parse(result);
      return parsed.value ?? result;
    } catch (error) {
      logger.debug("Failed to parse 1Password field JSON, using raw value", { error });
      return result.trim();
    }
  }

  /**
   * Get username and password for a login item.
   */
  async getCredentials(
    item: string,
    vault?: string,
  ): Promise<{
    username: string;
    password: string;
    totp?: string;
  } | null> {
    const fullItem = await this.getItem(item, vault);
    if (!fullItem.fields) return null;

    const username = fullItem.fields.find(
      (f) => f.purpose === "USERNAME" || f.label.toLowerCase() === "username",
    );
    const password = fullItem.fields.find(
      (f) => f.purpose === "PASSWORD" || f.label.toLowerCase() === "password",
    );

    if (!username && !password) return null;

    let totp: string | undefined;
    try {
      totp = await this.getTOTP(item, vault);
    } catch (error) {
      logger.debug("TOTP not configured for this item", { item, error });
    }

    return {
      username: username?.value ?? "",
      password: password?.value ?? "",
      totp,
    };
  }

  /**
   * Get a TOTP code for an item.
   */
  async getTOTP(item: string, vault?: string): Promise<string> {
    const args = ["item", "get", item, "--otp"];
    if (vault) {
      args.push("--vault", vault);
    }
    return (await this.exec(args)).trim();
  }

  /**
   * Read a document/file from 1Password.
   */
  async getDocument(item: string, vault?: string): Promise<Buffer> {
    const args = ["document", "get", item];
    if (vault) {
      args.push("--vault", vault);
    }

    const env = this.buildEnv();
    const { stdout } = await execFileAsync(this.opPath, args, {
      env,
      encoding: "buffer",
      timeout: 30_000,
    });
    return stdout;
  }

  /**
   * Resolve a secret reference (op:// URI).
   * Example: op://vault/item/field
   */
  async resolveReference(reference: string): Promise<string> {
    const args = ["read", reference];
    return (await this.exec(args)).trim();
  }

  /**
   * Inject secrets into a template string, replacing op:// references.
   */
  async injectSecrets(template: string): Promise<string> {
    const opRefRegex = /op:\/\/[^\s"']+/g;
    const refs = template.match(opRefRegex);
    if (!refs) return template;

    let result = template;
    for (const ref of refs) {
      try {
        const value = await this.resolveReference(ref);
        result = result.replace(ref, value);
      } catch (error) {
        logger.debug("Failed to resolve 1Password reference", { ref, error });
      }
    }
    return result;
  }

  /**
   * Execute an op CLI command.
   */
  private async exec(args: string[]): Promise<string> {
    const env = this.buildEnv();

    if (this.account) {
      args.push("--account", this.account);
    }

    try {
      const { stdout } = await execFileAsync(this.opPath, args, {
        env,
        timeout: 30_000,
      });
      return stdout.trim();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`1Password CLI error: ${msg}`, { cause: error });
    }
  }

  /**
   * Build environment with service account token.
   */
  private buildEnv(): Record<string, string> {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    if (this.serviceAccountToken) {
      env.OP_SERVICE_ACCOUNT_TOKEN = this.serviceAccountToken;
    }
    return env;
  }
}
