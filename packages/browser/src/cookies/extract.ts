// ──────────────────────────────────────────────────────────────────────────────
// CookieExtractor - Extract cookies from locally installed browsers
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync } from "node:fs";
import { readdir, copyFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import * as http from "node:http";
import * as https from "node:https";
import type { CookieData, CookieParam } from "@inspect/shared";
import { createLogger } from "@inspect/observability";
import { BROWSER_CONFIGS, findBrowserConfig, resolveBrowserPath } from "./browsers.js";

const logger = createLogger("browser/cookies");

/**
 * Extracts cookies from locally installed browsers.
 * Supports multiple extraction strategies:
 * - SQLite direct read (Chromium and Firefox)
 * - CDP (Chrome DevTools Protocol) for running browsers
 *
 * Handles cookie deduplication and format conversion to Playwright format.
 */
export class CookieExtractor {
  /**
   * Extract cookies from a specified browser.
   *
   * @param browserName - Browser name (e.g., "Chrome", "Firefox", "Brave")
   * @param profile - Optional profile name (default: "Default")
   * @param domain - Optional domain filter
   * @returns Extracted cookies
   */
  async extractCookies(
    browserName: string,
    profile?: string,
    domain?: string,
  ): Promise<CookieData[]> {
    const config = findBrowserConfig(browserName);
    if (!config) {
      throw new Error(
        `Unknown browser: "${browserName}". Available browsers: ${BROWSER_CONFIGS.map((b) => b.name).join(", ")}`,
      );
    }

    const platform = process.platform as "darwin" | "linux" | "win32";
    const paths = config.paths[platform];
    if (!paths || paths.length === 0) {
      throw new Error(`Browser "${browserName}" has no known paths for platform "${platform}".`);
    }

    // Try each known path
    for (const pathTemplate of paths) {
      const basePath = resolveBrowserPath(pathTemplate);
      if (!existsSync(basePath)) continue;

      try {
        switch (config.encryption) {
          case "chromium":
            return await this.extractChromiumCookies(basePath, config, profile, domain);
          case "firefox":
            return await this.extractFirefoxCookies(basePath, config, profile, domain);
          case "safari":
            return await this.extractSafariCookies(basePath, config, domain);
          default:
            throw new Error(`Unsupported encryption method: ${config.encryption}`);
        }
      } catch (_e) {
        // Try next path
        continue;
      }
    }

    throw new Error(`Could not find cookie database for "${browserName}" on this system.`);
  }

  /**
   * Extract cookies from a running browser via CDP.
   *
   * @param cdpEndpoint - WebSocket URL of the CDP endpoint
   * @param domain - Optional domain filter
   */
  async extractViaCDP(cdpEndpoint: string, domain?: string): Promise<CookieData[]> {
    // Resolve the WebSocket debugger URL from the CDP endpoint
    const httpUrl = cdpEndpoint.replace("ws://", "http://").replace("wss://", "https://");

    // Get available targets to find the WebSocket URL
    const listResponse = await fetch(`${httpUrl}/json/list`);
    const targets = (await listResponse.json()) as Array<{
      webSocketDebuggerUrl: string;
      id: string;
    }>;

    if (targets.length === 0) {
      throw new Error("No CDP targets found.");
    }

    // Prefer the browser-level endpoint for getAllCookies
    let wsUrl: string;
    try {
      const versionResponse = await fetch(`${httpUrl}/json/version`);
      const version = (await versionResponse.json()) as { webSocketDebuggerUrl?: string };
      wsUrl = version.webSocketDebuggerUrl ?? targets[0].webSocketDebuggerUrl;
    } catch (error) {
      logger.debug("Failed to get browser WebSocket URL, using target URL", { error });
      wsUrl = targets[0].webSocketDebuggerUrl;
    }

    // Send CDP command via WebSocket to get all cookies
    const rawCookies = await this.sendCDPCommand<{
      cookies: Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
        expires: number;
        httpOnly: boolean;
        secure: boolean;
        sameSite: string;
      }>;
    }>(wsUrl, "Network.getAllCookies", {});

    // Convert CDP cookies to our CookieData format
    const sameSiteMap: Record<string, "Strict" | "Lax" | "None"> = {
      Strict: "Strict",
      Lax: "Lax",
      None: "None",
    };

    const cookies: CookieData[] = rawCookies.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires === -1 ? -1 : Math.floor(c.expires),
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: sameSiteMap[c.sameSite] ?? "None",
      source: "CDP",
    }));

    return domain ? cookies.filter((c) => c.domain.includes(domain)) : cookies;
  }

  /**
   * Send a CDP command over WebSocket and wait for the response.
   * Uses a simple one-shot WebSocket connection.
   */
  private sendCDPCommand<T>(
    wsUrl: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // Use Node.js built-in WebSocket (available since Node 21) or
      // fall back to a manual HTTP upgrade + raw socket approach
      const url = new URL(wsUrl);
      const protocol = url.protocol === "wss:" ? "https" : "http";
      const httpModule = protocol === "https" ? https : http;

      const requestId = 1;
      const message = JSON.stringify({ id: requestId, method, params });

      const req = httpModule.request(
        {
          hostname: url.hostname,
          port: url.port || (protocol === "https" ? 443 : 80),
          path: url.pathname + url.search,
          headers: {
            Connection: "Upgrade",
            Upgrade: "websocket",
            "Sec-WebSocket-Version": "13",
            "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
          },
        },
        () => {
          reject(new Error("CDP WebSocket upgrade failed: got HTTP response"));
        },
      );

      const timeout = setTimeout(() => {
        req.destroy();
        reject(new Error("CDP command timed out after 10s"));
      }, 10_000);

      req.on("upgrade", (_res: unknown, socket: import("node:net").Socket) => {
        // Send the CDP command as a WebSocket text frame
        const payload = Buffer.from(message, "utf-8");
        const frame = this.buildWebSocketFrame(payload);
        socket.write(frame);

        // Read the response
        let buffer = Buffer.alloc(0);

        socket.on("data", (data: Buffer) => {
          buffer = Buffer.concat([buffer, data]);

          // Try to parse a WebSocket frame
          const parsed = this.parseWebSocketFrame(buffer);
          if (parsed) {
            clearTimeout(timeout);
            socket.destroy();
            try {
              const response = JSON.parse(parsed.toString("utf-8"));
              if (response.error) {
                reject(new Error(`CDP error: ${response.error.message}`));
              } else {
                resolve(response.result as T);
              }
            } catch (e) {
              reject(new Error(`Failed to parse CDP response: ${e}`));
            }
          }
        });

        socket.on("error", (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      req.on("error", (err: Error) => {
        clearTimeout(timeout);
        reject(new Error(`CDP connection failed: ${err.message}`));
      });

      req.end();
    });
  }

  /**
   * Build a WebSocket text frame (unmasked, for client-to-server).
   */
  private buildWebSocketFrame(payload: Buffer): Buffer {
    const length = payload.length;
    let header: Buffer;

    if (length < 126) {
      header = Buffer.alloc(6);
      header[0] = 0x81; // FIN + text opcode
      header[1] = 0x80 | length; // masked + length
    } else if (length < 65536) {
      header = Buffer.alloc(8);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(14);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(length, 6);
    }

    // Masking key
    const maskKey = randomBytes(4);
    const maskOffset = header.length - 4;
    maskKey.copy(header, maskOffset);

    // Mask the payload
    const masked = Buffer.alloc(length);
    for (let i = 0; i < length; i++) {
      masked[i] = payload[i] ^ maskKey[i % 4];
    }

    return Buffer.concat([header, masked]);
  }

  /**
   * Parse a basic WebSocket frame (for reading server responses).
   */
  private parseWebSocketFrame(buffer: Buffer): Buffer | null {
    if (buffer.length < 2) return null;

    const secondByte = buffer[1];
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      if (buffer.length < 4) return null;
      payloadLength = buffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      if (buffer.length < 10) return null;
      payloadLength = buffer.readUInt32BE(6);
      offset = 10;
    }

    if (buffer.length < offset + payloadLength) return null;

    return buffer.subarray(offset, offset + payloadLength);
  }

  /**
   * Convert CookieDatas to Playwright CookieParam format.
   */
  toPlaywrightFormat(cookies: CookieData[]): CookieParam[] {
    return cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    }));
  }

  /**
   * Deduplicate cookies — keep the most recent cookie for each name+domain+path combo.
   */
  deduplicate(cookies: CookieData[]): CookieData[] {
    const map = new Map<string, CookieData>();
    for (const cookie of cookies) {
      const key = `${cookie.name}|${cookie.domain}|${cookie.path}`;
      const existing = map.get(key);
      if (!existing || cookie.expires > existing.expires) {
        map.set(key, cookie);
      }
    }
    return [...map.values()];
  }

  /**
   * List all locally installed browsers that we can extract cookies from.
   */
  listAvailableBrowsers(): string[] {
    const platform = process.platform as "darwin" | "linux" | "win32";
    const available: string[] = [];

    for (const config of BROWSER_CONFIGS) {
      const paths = config.paths[platform];
      if (!paths) continue;
      for (const pathTemplate of paths) {
        const resolved = resolveBrowserPath(pathTemplate);
        if (existsSync(resolved)) {
          available.push(config.name);
          break;
        }
      }
    }

    return available;
  }

  // ── Private extraction methods ───────────────────────────────────────────

  /**
   * Extract cookies from Chromium-based browsers using sqlite3 CLI.
   * Copies the database to a temp file to avoid locking issues.
   */
  private async extractChromiumCookies(
    basePath: string,
    config: { name: string; cookieFile: string; profilePattern?: string },
    profile?: string,
    domain?: string,
  ): Promise<CookieData[]> {
    const profileDir = profile ?? "Default";
    const cookiePath = join(basePath, profileDir, config.cookieFile);

    if (!existsSync(cookiePath)) {
      // Try to find profile directories
      const profilePattern = config.profilePattern ?? "Default";
      const patterns = profilePattern.split("|");
      let foundPath: string | null = null;

      for (const pattern of patterns) {
        const globPattern = pattern.replace("*", "");
        try {
          const entries = await readdir(basePath);
          for (const entry of entries) {
            if (entry.startsWith(globPattern) || entry === pattern) {
              const candidate = join(basePath, entry, config.cookieFile);
              if (existsSync(candidate)) {
                foundPath = candidate;
                break;
              }
            }
          }
        } catch (error) {
          logger.debug("Failed to read profile directory", { basePath, error });
          continue;
        }
        if (foundPath) break;
      }

      if (!foundPath) {
        throw new Error(`Cookie file not found at ${cookiePath}`);
      }

      return this.readSQLiteCookies(foundPath, config.name, domain, "chromium");
    }

    return this.readSQLiteCookies(cookiePath, config.name, domain, "chromium");
  }

  /**
   * Extract cookies from Firefox-based browsers.
   */
  private async extractFirefoxCookies(
    basePath: string,
    config: { name: string; cookieFile: string; profilePattern?: string },
    profile?: string,
    domain?: string,
  ): Promise<CookieData[]> {
    let cookiePath: string | null = null;

    if (profile) {
      cookiePath = join(basePath, profile, config.cookieFile);
    } else {
      // Find default profile
      const profilePattern = config.profilePattern ?? "*.default-release";
      const patterns = profilePattern.split("|");

      try {
        const entries = await readdir(basePath);
        for (const pattern of patterns) {
          const suffix = pattern.replace("*", "");
          for (const entry of entries) {
            if (entry.endsWith(suffix)) {
              const candidate = join(basePath, entry, config.cookieFile);
              if (existsSync(candidate)) {
                cookiePath = candidate;
                break;
              }
            }
          }
          if (cookiePath) break;
        }
      } catch (error) {
        logger.debug("Failed to read Firefox profiles directory", { basePath, error });
      }
    }

    if (!cookiePath || !existsSync(cookiePath)) {
      throw new Error(`Firefox cookie database not found in ${basePath}`);
    }

    return this.readSQLiteCookies(cookiePath, config.name, domain, "firefox");
  }

  /**
   * Extract cookies from Safari (macOS only).
   */
  private async extractSafariCookies(
    basePath: string,
    config: { name: string; cookieFile: string },
    _domain?: string,
  ): Promise<CookieData[]> {
    const cookiePath = join(basePath, config.cookieFile);
    if (!existsSync(cookiePath)) {
      throw new Error(`Safari cookie file not found at ${cookiePath}`);
    }

    // Safari uses a binary cookie format — use python or a dedicated parser
    // For now, return empty and log a warning
    logger.warn(
      "Safari binary cookie parsing requires additional tooling — use CDP extraction instead",
    );
    return [];
  }

  /**
   * Read cookies from a SQLite database (Chromium or Firefox format).
   * Copies to a temp file to avoid WAL locking.
   */
  private async readSQLiteCookies(
    dbPath: string,
    browserName: string,
    domain?: string,
    format: "chromium" | "firefox" = "chromium",
  ): Promise<CookieData[]> {
    // Copy database to temp file to avoid locking
    const tempPath = join(tmpdir(), `inspect_cookies_${randomBytes(4).toString("hex")}.sqlite`);

    try {
      await copyFile(dbPath, tempPath);

      // Also copy WAL and SHM files if they exist (Chromium)
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;
      if (existsSync(walPath)) await copyFile(walPath, `${tempPath}-wal`);
      if (existsSync(shmPath)) await copyFile(shmPath, `${tempPath}-shm`);

      const query =
        format === "chromium" ? this.buildChromiumQuery(domain) : this.buildFirefoxQuery(domain);

      // Execute sqlite3 query
      const result = execSync(`sqlite3 -json "${tempPath}" "${query}"`, {
        encoding: "utf-8",
        timeout: 10_000,
      });

      const rows = JSON.parse(result || "[]") as Record<string, unknown>[];

      return rows.map((row) =>
        format === "chromium"
          ? this.parseChromiumRow(row, browserName)
          : this.parseFirefoxRow(row, browserName),
      );
    } finally {
      // Cleanup temp files
      await unlink(tempPath).catch(() => {});
      await unlink(`${tempPath}-wal`).catch(() => {});
      await unlink(`${tempPath}-shm`).catch(() => {});
    }
  }

  /**
   * Sanitize a domain string for safe use in SQL LIKE clauses.
   * Escapes SQL special characters to prevent injection.
   */
  private sanitizeDomainForSQL(domain: string): string {
    return (
      domain
        .replace(/'/g, "''")
        .replace(/%/g, "")
        .replace(/_/g, "\\_")
        .replace(/\\/g, "\\\\")
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1f\x7f]/g, "")
    );
  }

  private buildChromiumQuery(domain?: string): string {
    const whereClause = domain
      ? `WHERE host_key LIKE '%${this.sanitizeDomainForSQL(domain)}%'`
      : "";
    return `SELECT host_key, name, path, expires_utc, is_httponly, is_secure, samesite, hex(encrypted_value) as encrypted_value FROM cookies ${whereClause} ORDER BY host_key, name`;
  }

  private buildFirefoxQuery(domain?: string): string {
    const whereClause = domain ? `WHERE host LIKE '%${this.sanitizeDomainForSQL(domain)}%'` : "";
    return `SELECT host, name, value, path, expiry, isHttpOnly, isSecure, sameSite FROM moz_cookies ${whereClause} ORDER BY host, name`;
  }

  private parseChromiumRow(row: Record<string, unknown>, source: string): CookieData {
    // Chromium stores encrypted cookies — the value field is typically empty
    // and encrypted_value contains the AES-encrypted data.
    // Decryption requires OS-specific keychain access (DPAPI on Windows, keychain on macOS, etc.)
    // For now, we store the hex-encoded encrypted value as a placeholder.
    const sameSiteMap: Record<number, "Strict" | "Lax" | "None"> = {
      0: "None",
      1: "Lax",
      2: "Strict",
    };

    // Convert Chromium epoch (microseconds since Jan 1, 1601) to Unix epoch
    const chromiumEpochOffset = 11644473600n;
    const expiresUtc = BigInt(row["expires_utc"] as number);
    const unixExpiry = expiresUtc > 0n ? Number(expiresUtc / 1_000_000n - chromiumEpochOffset) : -1;

    return {
      name: row["name"] as string,
      value: "", // Encrypted — requires OS keychain for decryption
      domain: row["host_key"] as string,
      path: (row["path"] as string) || "/",
      expires: unixExpiry,
      httpOnly: (row["is_httponly"] as number) === 1,
      secure: (row["is_secure"] as number) === 1,
      sameSite: sameSiteMap[(row["samesite"] as number) ?? 0] ?? "None",
      source,
    };
  }

  private parseFirefoxRow(row: Record<string, unknown>, source: string): CookieData {
    const sameSiteMap: Record<number, "Strict" | "Lax" | "None"> = {
      0: "None",
      1: "Lax",
      2: "Strict",
    };

    return {
      name: row["name"] as string,
      value: row["value"] as string,
      domain: row["host"] as string,
      path: (row["path"] as string) || "/",
      expires: row["expiry"] as number,
      httpOnly: (row["isHttpOnly"] as number) === 1,
      secure: (row["isSecure"] as number) === 1,
      sameSite: sameSiteMap[(row["sameSite"] as number) ?? 0] ?? "None",
      source,
    };
  }
}
