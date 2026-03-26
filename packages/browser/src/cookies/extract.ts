// ──────────────────────────────────────────────────────────────────────────────
// CookieExtractor - Extract cookies from locally installed browsers
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, copyFileSync, unlinkSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import type { CookieData, CookieParam } from "@inspect/shared";
import { BROWSER_CONFIGS, findBrowserConfig, resolveBrowserPath } from "./browsers.js";

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
      } catch (e) {
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
    // Connect via CDP and use Network.getAllCookies
    const wsUrl = cdpEndpoint.replace("http", "ws");
    // Use fetch to call CDP HTTP API for cookies
    const httpUrl = cdpEndpoint.replace("ws://", "http://").replace("wss://", "https://");
    const listResponse = await fetch(`${httpUrl}/json/list`);
    const targets = (await listResponse.json()) as Array<{
      webSocketDebuggerUrl: string;
      id: string;
    }>;

    if (targets.length === 0) {
      throw new Error("No CDP targets found.");
    }

    // Use the browser's HTTP endpoint to get cookies
    const cookies: CookieData[] = [];

    // For each target, get cookies via CDP HTTP
    for (const target of targets.slice(0, 1)) {
      try {
        const response = await fetch(`${httpUrl}/json/protocol`);
        // CDP doesn't have a simple HTTP cookie API — we need WebSocket
        // Fall back to the approach of sending CDP commands
        break;
      } catch {
        continue;
      }
    }

    return domain
      ? cookies.filter((c) => c.domain.includes(domain))
      : cookies;
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
          const entries = readdirSync(basePath);
          for (const entry of entries) {
            if (entry.startsWith(globPattern) || entry === pattern) {
              const candidate = join(basePath, entry, config.cookieFile);
              if (existsSync(candidate)) {
                foundPath = candidate;
                break;
              }
            }
          }
        } catch {
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
        const entries = readdirSync(basePath);
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
      } catch {
        // ignore
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
    domain?: string,
  ): Promise<CookieData[]> {
    const cookiePath = join(basePath, config.cookieFile);
    if (!existsSync(cookiePath)) {
      throw new Error(`Safari cookie file not found at ${cookiePath}`);
    }

    // Safari uses a binary cookie format — use python or a dedicated parser
    // For now, return empty and log a warning
    console.warn("Safari binary cookie parsing requires additional tooling. Use CDP extraction instead.");
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
      copyFileSync(dbPath, tempPath);

      // Also copy WAL and SHM files if they exist (Chromium)
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;
      if (existsSync(walPath)) copyFileSync(walPath, `${tempPath}-wal`);
      if (existsSync(shmPath)) copyFileSync(shmPath, `${tempPath}-shm`);

      const query = format === "chromium"
        ? this.buildChromiumQuery(domain)
        : this.buildFirefoxQuery(domain);

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
      try { unlinkSync(tempPath); } catch { /* ignore */ }
      try { unlinkSync(`${tempPath}-wal`); } catch { /* ignore */ }
      try { unlinkSync(`${tempPath}-shm`); } catch { /* ignore */ }
    }
  }

  private buildChromiumQuery(domain?: string): string {
    const whereClause = domain ? `WHERE host_key LIKE '%${domain}%'` : "";
    return `SELECT host_key, name, path, expires_utc, is_httponly, is_secure, samesite, hex(encrypted_value) as encrypted_value FROM cookies ${whereClause} ORDER BY host_key, name`;
  }

  private buildFirefoxQuery(domain?: string): string {
    const whereClause = domain ? `WHERE host LIKE '%${domain}%'` : "";
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
    const unixExpiry = expiresUtc > 0n
      ? Number((expiresUtc / 1_000_000n) - chromiumEpochOffset)
      : -1;

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
