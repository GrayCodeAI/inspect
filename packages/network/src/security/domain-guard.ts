// ============================================================================
// @inspect/network - Domain Guard
//
// Restricts the agent to navigating only allowed domains.
// Prevents the agent from accidentally visiting malicious sites
// or leaking data to unauthorized endpoints.
// Inspired by Browser Use's allowed_domains and Playwright MCP's network config.
// ============================================================================

export interface DomainGuardConfig {
  /** Allowed domains (wildcards supported). Empty = allow all */
  allowedDomains?: string[];
  /** Blocked domains (takes precedence over allowed) */
  blockedDomains?: string[];
  /** Block known tracking/analytics domains. Default: true */
  blockTrackers?: boolean;
  /** Log blocked attempts. Default: true */
  logBlocked?: boolean;
}

export interface BlockedRequest {
  url: string;
  domain: string;
  reason: string;
  timestamp: number;
}

const KNOWN_TRACKERS = [
  "google-analytics.com", "googletagmanager.com", "facebook.net",
  "doubleclick.net", "hotjar.com", "mixpanel.com", "segment.com",
  "amplitude.com", "intercom.io", "crisp.chat", "drift.com",
  "fullstory.com", "mouseflow.com", "clarity.ms",
];

/**
 * DomainGuard restricts agent navigation to allowed domains.
 */
export class DomainGuard {
  private config: Required<DomainGuardConfig>;
  private blocked: BlockedRequest[] = [];

  constructor(config: DomainGuardConfig = {}) {
    this.config = {
      allowedDomains: config.allowedDomains ?? [],
      blockedDomains: config.blockedDomains ?? [],
      blockTrackers: config.blockTrackers ?? true,
      logBlocked: config.logBlocked ?? true,
    };
  }

  /**
   * Check if a URL is allowed.
   */
  isAllowed(url: string): boolean {
    try {
      const domain = new URL(url).hostname;

      // Check blocked list first (takes precedence)
      if (this.matchesDomainList(domain, this.config.blockedDomains)) {
        this.recordBlocked(url, domain, "blocked domain");
        return false;
      }

      // Check trackers
      if (this.config.blockTrackers && this.isTracker(domain)) {
        this.recordBlocked(url, domain, "known tracker");
        return false;
      }

      // If allowed list is empty, allow all (except blocked)
      if (this.config.allowedDomains.length === 0) {
        return true;
      }

      // Check allowed list
      if (this.matchesDomainList(domain, this.config.allowedDomains)) {
        return true;
      }

      this.recordBlocked(url, domain, "not in allowed domains");
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get all blocked requests.
   */
  getBlocked(): BlockedRequest[] {
    return [...this.blocked];
  }

  /**
   * Get blocked count.
   */
  get blockedCount(): number {
    return this.blocked.length;
  }

  /**
   * Clear blocked log.
   */
  clearLog(): void {
    this.blocked = [];
  }

  /**
   * Add domain to allowed list at runtime.
   */
  allow(domain: string): void {
    this.config.allowedDomains.push(domain);
  }

  /**
   * Add domain to blocked list at runtime.
   */
  block(domain: string): void {
    this.config.blockedDomains.push(domain);
  }

  private matchesDomainList(domain: string, list: string[]): boolean {
    for (const pattern of list) {
      if (pattern.startsWith("*.")) {
        // Wildcard: *.example.com matches sub.example.com
        const suffix = pattern.slice(2);
        if (domain === suffix || domain.endsWith("." + suffix)) {
          return true;
        }
      } else if (domain === pattern) {
        return true;
      }
    }
    return false;
  }

  private isTracker(domain: string): boolean {
    return KNOWN_TRACKERS.some((t) => domain === t || domain.endsWith("." + t));
  }

  private recordBlocked(url: string, domain: string, reason: string): void {
    if (this.config.logBlocked) {
      this.blocked.push({ url, domain, reason, timestamp: Date.now() });
    }
  }
}
