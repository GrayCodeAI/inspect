// ============================================================================
// @inspect/data - S3 Storage (AWS S3 REST API with SigV4)
// ============================================================================

import * as crypto from "node:crypto";
import * as https from "node:https";
import { createLogger } from "@inspect/observability";

const logger = createLogger("data/s3");

/** S3 configuration */
export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

/** Upload result */
export interface S3UploadResult {
  key: string;
  etag: string;
  bucket: string;
  url: string;
}

/**
 * S3Storage provides upload, download, and presigned URL generation
 * using the AWS S3 REST API with Signature Version 4 signing.
 * Uses only Node.js built-in modules.
 */
export class S3Storage {
  private config: S3Config;
  private service = "s3";

  constructor(config: S3Config) {
    this.config = {
      forcePathStyle: false,
      ...config,
    };
  }

  /**
   * Upload a file to S3.
   */
  async upload(
    key: string,
    body: Buffer | string,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
      acl?: string;
    },
  ): Promise<S3UploadResult> {
    const bodyBuffer = typeof body === "string" ? Buffer.from(body) : body;
    const contentType = options?.contentType ?? "application/octet-stream";

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(bodyBuffer.length),
    };

    if (options?.acl) {
      headers["x-amz-acl"] = options.acl;
    }

    if (options?.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        headers[`x-amz-meta-${k.toLowerCase()}`] = v;
      }
    }

    const response = await this.request("PUT", `/${key}`, headers, bodyBuffer);

    return {
      key,
      etag: (response.headers.etag ?? "").replace(/"/g, ""),
      bucket: this.config.bucket,
      url: this.getObjectUrl(key),
    };
  }

  /**
   * Download a file from S3.
   */
  async download(key: string): Promise<Buffer> {
    const response = await this.request("GET", `/${key}`, {});
    return response.body;
  }

  /**
   * Generate a presigned URL for temporary access.
   */
  getPresignedUrl(key: string, expiresIn: number = 86_400, method: string = "GET"): string {
    const now = new Date();
    const dateStamp = this.formatDate(now);
    const amzDate = this.formatAmzDate(now);
    const credentialScope = `${dateStamp}/${this.config.region}/${this.service}/aws4_request`;
    const credential = `${this.config.accessKeyId}/${credentialScope}`;

    const { hostname, path: basePath } = this.getHostAndPath(`/${key}`);

    const queryParams = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": credential,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresIn),
      "X-Amz-SignedHeaders": "host",
    });

    // Sort query parameters
    const sortedParams = new URLSearchParams(
      [...queryParams.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    );

    const canonicalRequest = [
      method,
      basePath,
      sortedParams.toString(),
      `host:${hostname}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      this.sha256(canonicalRequest),
    ].join("\n");

    const signingKey = this.getSigningKey(dateStamp);
    const signature = this.hmac(signingKey, stringToSign).toString("hex");

    sortedParams.set("X-Amz-Signature", signature);

    const protocol = this.config.endpoint?.startsWith("http://") ? "http" : "https";
    return `${protocol}://${hostname}${basePath}?${sortedParams.toString()}`;
  }

  /**
   * Delete an object from S3.
   */
  async deleteObject(key: string): Promise<void> {
    await this.request("DELETE", `/${key}`, {});
  }

  /**
   * Check if an object exists.
   */
  async headObject(
    key: string,
  ): Promise<{ exists: boolean; contentLength?: number; contentType?: string }> {
    try {
      const response = await this.request("HEAD", `/${key}`, {});
      return {
        exists: true,
        contentLength: parseInt(response.headers["content-length"] ?? "0", 10),
        contentType: response.headers["content-type"],
      };
    } catch (error) {
      logger.debug("S3 HEAD request failed, object may not exist", { key, error });
      return { exists: false };
    }
  }

  /**
   * List objects in a prefix.
   */
  async listObjects(
    prefix?: string,
    maxKeys: number = 1000,
  ): Promise<Array<{ key: string; size: number; lastModified: string }>> {
    const queryParams = new URLSearchParams({
      "list-type": "2",
      "max-keys": String(maxKeys),
    });
    if (prefix) {
      queryParams.set("prefix", prefix);
    }

    const response = await this.request("GET", `/?${queryParams.toString()}`, {});
    const xml = response.body.toString("utf-8");

    const objects: Array<{
      key: string;
      size: number;
      lastModified: string;
    }> = [];
    const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
    let match: RegExpExecArray | null;

    while ((match = contentsRegex.exec(xml)) !== null) {
      const keyMatch = match[1].match(/<Key>(.*?)<\/Key>/);
      const sizeMatch = match[1].match(/<Size>(.*?)<\/Size>/);
      const dateMatch = match[1].match(/<LastModified>(.*?)<\/LastModified>/);

      if (keyMatch) {
        objects.push({
          key: keyMatch[1],
          size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
          lastModified: dateMatch ? dateMatch[1] : "",
        });
      }
    }

    return objects;
  }

  /**
   * Make a signed request to S3.
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
      const now = new Date();
      const amzDate = this.formatAmzDate(now);
      const dateStamp = this.formatDate(now);
      const bodyHash = this.sha256(body ?? "");

      const { hostname, port, fullPath } = this.getHostAndPath(path);

      const reqHeaders: Record<string, string> = {
        ...headers,
        host: hostname,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": bodyHash,
      };

      // Sign the request
      const signedHeaders = Object.keys(reqHeaders)
        .map((k) => k.toLowerCase())
        .sort()
        .join(";");

      const canonicalHeaders = Object.keys(reqHeaders)
        .map((k) => k.toLowerCase())
        .sort()
        .map(
          (k) =>
            `${k}:${reqHeaders[Object.keys(reqHeaders).find((h) => h.toLowerCase() === k)!].trim()}`,
        )
        .join("\n");

      const [pathPart, queryPart] = fullPath.split("?");
      const canonicalQueryString = queryPart ? this.sortQueryString(queryPart) : "";

      const canonicalRequest = [
        method,
        pathPart,
        canonicalQueryString,
        canonicalHeaders + "\n",
        signedHeaders,
        bodyHash,
      ].join("\n");

      const credentialScope = `${dateStamp}/${this.config.region}/${this.service}/aws4_request`;
      const stringToSign = [
        "AWS4-HMAC-SHA256",
        amzDate,
        credentialScope,
        this.sha256(canonicalRequest),
      ].join("\n");

      const signingKey = this.getSigningKey(dateStamp);
      const signature = this.hmac(signingKey, stringToSign).toString("hex");

      reqHeaders["Authorization"] =
        `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const req = https.request(
        {
          hostname,
          port,
          path: fullPath,
          method,
          headers: reqHeaders,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const statusCode = res.statusCode ?? 0;
            const responseBody = Buffer.concat(chunks);

            if (statusCode >= 400) {
              reject(new Error(`S3 error (${statusCode}): ${responseBody.toString("utf-8")}`));
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

      req.on("error", (err) => reject(new Error(`S3 request failed: ${err.message}`)));

      if (body) req.write(body);
      req.end();
    });
  }

  private getHostAndPath(path: string): {
    hostname: string;
    port: number;
    path: string;
    fullPath: string;
  } {
    if (this.config.endpoint) {
      const url = new URL(this.config.endpoint);
      const fullPath = this.config.forcePathStyle ? `/${this.config.bucket}${path}` : path;
      return {
        hostname: this.config.forcePathStyle
          ? url.hostname
          : `${this.config.bucket}.${url.hostname}`,
        port: parseInt(url.port) || 443,
        path,
        fullPath,
      };
    }

    return {
      hostname: `${this.config.bucket}.s3.${this.config.region}.amazonaws.com`,
      port: 443,
      path,
      fullPath: path,
    };
  }

  private getObjectUrl(key: string): string {
    if (this.config.endpoint) {
      return `${this.config.endpoint}/${this.config.bucket}/${key}`;
    }
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
  }

  private getSigningKey(dateStamp: string): Buffer {
    const kDate = this.hmac(Buffer.from("AWS4" + this.config.secretAccessKey), dateStamp);
    const kRegion = this.hmac(kDate, this.config.region);
    const kService = this.hmac(kRegion, this.service);
    return this.hmac(kService, "aws4_request");
  }

  private hmac(key: Buffer | string, data: string): Buffer {
    return crypto.createHmac("sha256", key).update(data).digest();
  }

  private sha256(data: Buffer | string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  private formatAmzDate(date: Date): string {
    return date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d+Z/, "Z");
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  }

  private sortQueryString(qs: string): string {
    return qs.split("&").sort().join("&");
  }
}
