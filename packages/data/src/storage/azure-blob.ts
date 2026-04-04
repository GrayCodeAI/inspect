// ============================================================================
// @inspect/data - Azure Blob Storage
// ============================================================================

import * as crypto from "node:crypto";
import * as https from "node:https";

/** Azure Blob Storage configuration */
export interface AzureBlobConfig {
  /** Storage account name */
  accountName: string;
  /** Storage account key */
  accountKey: string;
  /** Container name */
  container: string;
  /** Custom endpoint (for emulator or custom domains) */
  endpoint?: string;
}

/** Upload result */
export interface AzureBlobUploadResult {
  blobName: string;
  container: string;
  etag: string;
  url: string;
}

/**
 * AzureBlobStorage provides upload and download capabilities using
 * the Azure Blob REST API with Shared Key authentication.
 */
export class AzureBlobStorage {
  private config: AzureBlobConfig;

  constructor(config: AzureBlobConfig) {
    this.config = config;
  }

  /**
   * Upload a blob.
   */
  async upload(
    blobName: string,
    body: Buffer | string,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
    },
  ): Promise<AzureBlobUploadResult> {
    const bodyBuffer = typeof body === "string" ? Buffer.from(body) : body;
    const contentType = options?.contentType ?? "application/octet-stream";

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(bodyBuffer.length),
      "x-ms-blob-type": "BlockBlob",
    };

    if (options?.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        headers[`x-ms-meta-${k}`] = v;
      }
    }

    const response = await this.request(
      "PUT",
      `/${this.config.container}/${blobName}`,
      headers,
      bodyBuffer,
    );

    return {
      blobName,
      container: this.config.container,
      etag: (response.headers.etag ?? "").replace(/"/g, ""),
      url: this.getBlobUrl(blobName),
    };
  }

  /**
   * Download a blob.
   */
  async download(blobName: string): Promise<Buffer> {
    const response = await this.request("GET", `/${this.config.container}/${blobName}`, {});
    return response.body;
  }

  /**
   * Delete a blob.
   */
  async deleteBlob(blobName: string): Promise<void> {
    await this.request("DELETE", `/${this.config.container}/${blobName}`, {});
  }

  /**
   * List blobs in a container.
   */
  async listBlobs(
    prefix?: string,
  ): Promise<Array<{ name: string; contentLength: number; lastModified: string }>> {
    let path = `/${this.config.container}?restype=container&comp=list`;
    if (prefix) {
      path += `&prefix=${encodeURIComponent(prefix)}`;
    }

    const response = await this.request("GET", path, {});
    const xml = response.body.toString("utf-8");

    const blobs: Array<{
      name: string;
      contentLength: number;
      lastModified: string;
    }> = [];
    const blobRegex = /<Blob>([\s\S]*?)<\/Blob>/g;
    let match: RegExpExecArray | null;

    while ((match = blobRegex.exec(xml)) !== null) {
      const nameMatch = match[1].match(/<Name>(.*?)<\/Name>/);
      const sizeMatch = match[1].match(/<Content-Length>(.*?)<\/Content-Length>/);
      const dateMatch = match[1].match(/<Last-Modified>(.*?)<\/Last-Modified>/);

      if (nameMatch) {
        blobs.push({
          name: nameMatch[1],
          contentLength: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
          lastModified: dateMatch ? dateMatch[1] : "",
        });
      }
    }

    return blobs;
  }

  /**
   * Get blob URL.
   */
  getBlobUrl(blobName: string): string {
    const baseUrl =
      this.config.endpoint ?? `https://${this.config.accountName}.blob.core.windows.net`;
    return `${baseUrl}/${this.config.container}/${blobName}`;
  }

  /**
   * Make a signed request to Azure Blob Storage.
   */
  private request(
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: Buffer,
  ): Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: Buffer;
  }> {
    return new Promise((resolve, reject) => {
      const now = new Date().toUTCString();
      const baseUrl =
        this.config.endpoint ?? `https://${this.config.accountName}.blob.core.windows.net`;
      const parsedUrl = new URL(path, baseUrl);

      const msVersion = "2023-11-03";

      const allHeaders: Record<string, string> = {
        ...headers,
        "x-ms-date": now,
        "x-ms-version": msVersion,
      };

      // Build authorization header (Shared Key)
      const authHeader = this.buildAuthHeader(method, path, allHeaders, body);
      allHeaders["Authorization"] = authHeader;

      const req = https.request(
        {
          hostname: parsedUrl.hostname,
          port: 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method,
          headers: allHeaders,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const statusCode = res.statusCode ?? 0;
            const responseBody = Buffer.concat(chunks);

            if (statusCode >= 400) {
              reject(
                new Error(`Azure Blob error (${statusCode}): ${responseBody.toString("utf-8")}`),
              );
              return;
            }

            resolve({
              statusCode,
              headers: res.headers as Record<string, string>,
              body: responseBody,
            });
          });
        },
      );

      req.on("error", (err) => reject(new Error(`Azure Blob request failed: ${err.message}`)));

      if (body) req.write(body);
      req.end();
    });
  }

  /**
   * Build Shared Key authorization header.
   */
  private buildAuthHeader(
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: Buffer,
  ): string {
    const contentLength = body && body.length > 0 ? String(body.length) : "";
    const contentType = headers["Content-Type"] ?? "";

    // Canonicalized headers (x-ms-*)
    const msHeaders = Object.entries(headers)
      .filter(([k]) => k.toLowerCase().startsWith("x-ms-"))
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(([k, v]) => `${k.toLowerCase()}:${v}`)
      .join("\n");

    // Canonicalized resource
    const parsedPath = path.split("?");
    let canonicalizedResource = `/${this.config.accountName}${parsedPath[0]}`;

    if (parsedPath[1]) {
      const params = new URLSearchParams(parsedPath[1]);
      const sortedParams = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [key, value] of sortedParams) {
        canonicalizedResource += `\n${key}:${value}`;
      }
    }

    const stringToSign = [
      method,
      "", // Content-Encoding
      "", // Content-Language
      contentLength,
      "", // Content-MD5
      contentType,
      "", // Date
      "", // If-Modified-Since
      "", // If-Match
      "", // If-None-Match
      "", // If-Unmodified-Since
      "", // Range
      msHeaders,
      canonicalizedResource,
    ].join("\n");

    const key = Buffer.from(this.config.accountKey, "base64");
    const signature = crypto
      .createHmac("sha256", key)
      .update(stringToSign, "utf-8")
      .digest("base64");

    return `SharedKey ${this.config.accountName}:${signature}`;
  }
}
