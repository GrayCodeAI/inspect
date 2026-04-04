// ──────────────────────────────────────────────────────────────────────────────
// @inspect/network - Domain Security & URL Validation
// ──────────────────────────────────────────────────────────────────────────────

import { createLogger } from "@inspect/observability";

const logger = createLogger("network/domains");

/**
 * Default blocked hosts that should never be accessed.
 * Includes localhost, loopback, metadata endpoints, and link-local addresses.
 */
export const DEFAULT_BLOCKED: string[] = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  // AWS metadata endpoint
  "169.254.169.254",
  // GCP metadata endpoint
  "metadata.google.internal",
  // Azure metadata endpoint
  "169.254.169.253",
  // Link-local range
  "169.254.*",
  // Private network ranges (wildcards)
  "10.*",
  "192.168.*",
  "172.16.*",
  "172.17.*",
  "172.18.*",
  "172.19.*",
  "172.20.*",
  "172.21.*",
  "172.22.*",
  "172.23.*",
  "172.24.*",
  "172.25.*",
  "172.26.*",
  "172.27.*",
  "172.28.*",
  "172.29.*",
  "172.30.*",
  "172.31.*",
];

/** Result of URL validation */
export interface UrlValidationResult {
  /** Whether the URL is valid and allowed */
  valid: boolean;
  /** Reason for rejection, if any */
  reason?: string;
  /** The parsed URL, if valid */
  parsed?: URL;
}

/**
 * DomainSecurity enforces allowlists and blocklists for URLs,
 * preventing navigation to dangerous or internal endpoints.
 * Supports wildcard pattern matching (e.g. "*.example.com").
 */
export class DomainSecurity {
  private allowedPatterns: string[] = [];
  private blockedPatterns: string[] = [...DEFAULT_BLOCKED];
  private allowedProtocols: Set<string> = new Set(["http:", "https:"]);

  /**
   * Set the list of allowed host patterns.
   * When set, ONLY these hosts will be allowed (allowlist mode).
   * Supports wildcard (*) matching.
   *
   * @param patterns - Array of host patterns (e.g. ["*.example.com", "api.site.com"])
   */
  setAllowedHosts(patterns: string[]): void {
    this.allowedPatterns = patterns.map((p) => p.toLowerCase());
  }

  /**
   * Set the list of blocked host patterns.
   * These hosts are always blocked, even if they match an allow pattern.
   * Includes DEFAULT_BLOCKED by default.
   *
   * @param patterns - Array of host patterns to block
   */
  setBlockedHosts(patterns: string[]): void {
    this.blockedPatterns = [...DEFAULT_BLOCKED, ...patterns.map((p) => p.toLowerCase())];
  }

  /**
   * Set allowed protocols. Defaults to ["http:", "https:"].
   */
  setAllowedProtocols(protocols: string[]): void {
    this.allowedProtocols = new Set(protocols);
  }

  /**
   * Check if a URL is allowed according to the security rules.
   *
   * @param url - The URL string or URL object to check
   * @returns true if the URL is allowed
   */
  isAllowed(url: string | URL): boolean {
    const result = this.validateUrl(typeof url === "string" ? url : url.href);
    return result.valid;
  }

  /**
   * Validate a URL against all security rules.
   * Returns a detailed result with the reason for any rejection.
   *
   * @param urlStr - The URL string to validate
   * @returns Validation result with status and optional reason
   */
  validateUrl(urlStr: string): UrlValidationResult {
    // Parse the URL
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch (error) {
      logger.debug("Invalid URL format", { urlStr, error });
      return { valid: false, reason: "Invalid URL format" };
    }

    // Check protocol
    if (!this.allowedProtocols.has(parsed.protocol)) {
      return {
        valid: false,
        reason: `Protocol "${parsed.protocol}" is not allowed`,
        parsed,
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check blocked patterns (always takes priority)
    for (const pattern of this.blockedPatterns) {
      if (matchWildcard(hostname, pattern)) {
        return {
          valid: false,
          reason: `Host "${hostname}" matches blocked pattern "${pattern}"`,
          parsed,
        };
      }
    }

    // Check IP address ranges for additional safety
    if (isBlockedIpRange(hostname)) {
      return {
        valid: false,
        reason: `Host "${hostname}" resolves to a blocked IP range`,
        parsed,
      };
    }

    // If allowlist is set, the host must match at least one pattern
    if (this.allowedPatterns.length > 0) {
      const matches = this.allowedPatterns.some((pattern) => matchWildcard(hostname, pattern));
      if (!matches) {
        return {
          valid: false,
          reason: `Host "${hostname}" does not match any allowed patterns`,
          parsed,
        };
      }
    }

    return { valid: true, parsed };
  }

  /**
   * Get the current blocked patterns list.
   */
  getBlockedPatterns(): string[] {
    return [...this.blockedPatterns];
  }

  /**
   * Get the current allowed patterns list.
   */
  getAllowedPatterns(): string[] {
    return [...this.allowedPatterns];
  }

  /**
   * Reset to default state (no allowlist, default blocklist).
   */
  reset(): void {
    this.allowedPatterns = [];
    this.blockedPatterns = [...DEFAULT_BLOCKED];
    this.allowedProtocols = new Set(["http:", "https:"]);
  }
}

/**
 * Match a hostname against a wildcard pattern.
 *
 * Supported patterns:
 * - Exact match: "example.com"
 * - Wildcard prefix: "*.example.com" (matches any subdomain)
 * - Full wildcard: "*" (matches everything)
 * - IP wildcard: "192.168.*" (matches IP prefix)
 *
 * @param hostname - The hostname to test
 * @param pattern - The wildcard pattern
 * @returns true if the hostname matches the pattern
 */
function matchWildcard(hostname: string, pattern: string): boolean {
  const h = hostname.toLowerCase();
  const p = pattern.toLowerCase();

  // Exact match
  if (h === p) return true;

  // Full wildcard
  if (p === "*") return true;

  // *.domain.com pattern — matches "sub.domain.com" and "domain.com"
  if (p.startsWith("*.")) {
    const suffix = p.slice(2);
    return h === suffix || h.endsWith("." + suffix);
  }

  // IP prefix wildcard: "192.168.*" matches "192.168.1.1"
  if (p.endsWith(".*")) {
    const prefix = p.slice(0, -1); // "192.168."
    return h.startsWith(prefix);
  }

  // Simple glob: convert * to regex
  if (p.includes("*")) {
    const escaped = p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(h);
  }

  return false;
}

/**
 * Check if a 32-bit IP value falls within any blocked range.
 * Covers loopback, private networks, link-local, and special-use addresses.
 */
function isBlockedIpValue(ipVal: number): boolean {
  if (ipVal < 0 || ipVal > 0xffffffff) return false;

  // 0.0.0.0
  if (ipVal === 0) return true;
  // 127.0.0.0/8 (loopback)
  if (ipVal >>> 24 === 127) return true;
  // 10.0.0.0/8
  if (ipVal >>> 24 === 10) return true;
  // 172.16.0.0/12
  if (ipVal >>> 20 === ((172 << 4) | 1)) return true; // 0xAC1 = 172.16-31
  // 192.168.0.0/16
  if (ipVal >>> 16 === ((192 << 8) | 168)) return true; // 0xC0A8
  // 169.254.0.0/16 (link-local / metadata)
  if (ipVal >>> 16 === ((169 << 8) | 254)) return true; // 0xA9FE

  return false;
}

/**
 * Check if an IP address falls within blocked ranges.
 * Covers private networks, special-use addresses, and alternative
 * encodings (decimal, hexadecimal, octal).
 */
function isBlockedIpRange(hostname: string): boolean {
  // Check for IPv4 addresses in decimal notation (e.g. "2130706433" for 127.0.0.1)
  const decimalIp = parseInt(hostname, 10);
  if (!isNaN(decimalIp) && hostname === String(decimalIp)) {
    if (isBlockedIpValue(decimalIp)) return true;
  }

  // Check for hex-encoded IPs (e.g. "0x7f000001" for 127.0.0.1)
  if (/^0x[0-9a-f]+$/i.test(hostname)) {
    const hexVal = parseInt(hostname, 16);
    if (isBlockedIpValue(hexVal)) return true;
  }

  // Check for octal-encoded IPs (e.g. "017700000001" for 127.0.0.1)
  if (/^0[0-7]+/.test(hostname) && !hostname.includes(".")) {
    const octalVal = parseInt(hostname, 8);
    if (isBlockedIpValue(octalVal)) return true;
  }

  return false;
}
