// ============================================================================
// @inspect/credentials - Azure Key Vault Integration
// ============================================================================

import * as https from "node:https";

/** Azure Key Vault secret */
export interface AzureSecret {
  id: string;
  value: string;
  contentType?: string;
  attributes: {
    enabled: boolean;
    created: number;
    updated: number;
    expires?: number;
    notBefore?: number;
  };
  tags?: Record<string, string>;
}

/** Azure Key Vault secret metadata (no value) */
export interface AzureSecretMetadata {
  id: string;
  contentType?: string;
  attributes: {
    enabled: boolean;
    created: number;
    updated: number;
  };
  tags?: Record<string, string>;
}

/** Raw shape of the Azure Key Vault API response for a secret */
interface AzureKeyVaultSecretResponse {
  id: string;
  value: string;
  contentType?: string;
  attributes?: {
    enabled?: boolean;
    created?: number;
    updated?: number;
    exp?: number;
    nbf?: number;
  };
  tags?: Record<string, string>;
}

/** Raw shape of the Azure Key Vault API list response */
interface AzureKeyVaultListResponse {
  value?: AzureKeyVaultSecretResponse[];
}

/**
 * AzureKeyVaultIntegration uses the Azure REST API to interact with
 * Azure Key Vault for secret management. Authenticates via bearer token
 * from environment, managed identity, or client credentials.
 */
export class AzureKeyVaultIntegration {
  private vaultUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private clientId?: string;
  private clientSecret?: string;
  private tenantId?: string;
  private apiVersion: string = "7.4";

  constructor(options: {
    vaultUrl: string;
    accessToken?: string;
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
  }) {
    this.vaultUrl = options.vaultUrl.replace(/\/$/, "");
    this.accessToken = options.accessToken ?? null;
    this.clientId = options.clientId ?? process.env.AZURE_CLIENT_ID;
    this.clientSecret =
      options.clientSecret ?? process.env.AZURE_CLIENT_SECRET;
    this.tenantId = options.tenantId ?? process.env.AZURE_TENANT_ID;
  }

  /**
   * Get a secret value by name.
   */
  async getSecret(
    name: string,
    version?: string,
  ): Promise<AzureSecret> {
    const path = version
      ? `/secrets/${name}/${version}`
      : `/secrets/${name}`;

    const result = await this.request<AzureKeyVaultSecretResponse>("GET", path);
    return {
      id: result.id,
      value: result.value,
      contentType: result.contentType,
      attributes: {
        enabled: result.attributes?.enabled ?? true,
        created: result.attributes?.created ?? 0,
        updated: result.attributes?.updated ?? 0,
        expires: result.attributes?.exp,
        notBefore: result.attributes?.nbf,
      },
      tags: result.tags,
    };
  }

  /**
   * Set a secret value.
   */
  async setSecret(
    name: string,
    value: string,
    options?: {
      contentType?: string;
      tags?: Record<string, string>;
      expiresOn?: Date;
      notBefore?: Date;
    },
  ): Promise<AzureSecret> {
    const body: Record<string, unknown> = { value };
    if (options?.contentType) {
      body.contentType = options.contentType;
    }
    if (options?.tags) {
      body.tags = options.tags;
    }
    if (options?.expiresOn || options?.notBefore) {
      body.attributes = {
        exp: options.expiresOn
          ? Math.floor(options.expiresOn.getTime() / 1000)
          : undefined,
        nbf: options.notBefore
          ? Math.floor(options.notBefore.getTime() / 1000)
          : undefined,
      };
    }

    const result = await this.request<AzureKeyVaultSecretResponse>("PUT", `/secrets/${name}`, body);
    return {
      id: result.id,
      value: result.value,
      contentType: result.contentType,
      attributes: {
        enabled: result.attributes?.enabled ?? true,
        created: result.attributes?.created ?? 0,
        updated: result.attributes?.updated ?? 0,
      },
      tags: result.tags,
    };
  }

  /**
   * Delete a secret.
   */
  async deleteSecret(name: string): Promise<void> {
    await this.request("DELETE", `/secrets/${name}`);
  }

  /**
   * List all secrets (metadata only, no values).
   */
  async listSecrets(): Promise<AzureSecretMetadata[]> {
    const result = await this.request<AzureKeyVaultListResponse>("GET", "/secrets");
    const items = result.value ?? [];

    return items.map((item) => ({
      id: item.id ?? "",
      contentType: item.contentType,
      attributes: {
        enabled: item.attributes?.enabled ?? true,
        created: item.attributes?.created ?? 0,
        updated: item.attributes?.updated ?? 0,
      },
      tags: item.tags,
    }));
  }

  /**
   * Get secret versions.
   */
  async getSecretVersions(
    name: string,
  ): Promise<AzureSecretMetadata[]> {
    const result = await this.request<AzureKeyVaultListResponse>(
      "GET",
      `/secrets/${name}/versions`,
    );
    const items = result.value ?? [];

    return items.map((item) => ({
      id: item.id ?? "",
      contentType: item.contentType,
      attributes: {
        enabled: item.attributes?.enabled ?? true,
        created: item.attributes?.created ?? 0,
        updated: item.attributes?.updated ?? 0,
      },
      tags: item.tags,
    }));
  }

  /**
   * Acquire an access token using client credentials flow.
   */
  private async acquireToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.tenantId || !this.clientId || !this.clientSecret) {
      throw new Error(
        "Azure Key Vault requires either an access token or client credentials (tenantId, clientId, clientSecret)",
      );
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: "https://vault.azure.net/.default",
    }).toString();

    const response = await this.httpRequest("POST", tokenUrl, {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(body)),
    }, body);

    const tokenData = JSON.parse(response) as {
      access_token: string;
      expires_in: number;
    };

    this.accessToken = tokenData.access_token;
    this.tokenExpiry = Date.now() + tokenData.expires_in * 1000 - 60_000;

    return this.accessToken;
  }

  /**
   * Make a request to the Key Vault REST API.
   */
  private async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const token = await this.acquireToken();
    const url = `${this.vaultUrl}${path}?api-version=${this.apiVersion}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const bodyStr = body ? JSON.stringify(body) : undefined;
    if (bodyStr) {
      headers["Content-Length"] = String(Buffer.byteLength(bodyStr));
    }

    const response = await this.httpRequest(method, url, headers, bodyStr);

    if (!response.trim()) return {} as T;
    return JSON.parse(response) as T;
  }

  /**
   * Make a raw HTTPS request.
   */
  private httpRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);

      const req = https.request(
        {
          hostname: parsedUrl.hostname,
          port: 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const responseBody = Buffer.concat(chunks).toString("utf-8");
            const statusCode = res.statusCode ?? 0;

            if (statusCode >= 400) {
              reject(
                new Error(
                  `Azure Key Vault API error (${statusCode}): ${responseBody}`,
                ),
              );
              return;
            }

            resolve(responseBody);
          });
        },
      );

      req.on("error", (err) =>
        reject(new Error(`Azure Key Vault request failed: ${err.message}`)),
      );

      if (body) req.write(body);
      req.end();
    });
  }
}
