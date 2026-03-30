export interface AgentPermissions {
  /** Allowed domains for navigation */
  allowedDomains: string[];
  /** Explicitly blocked domains */
  blockedDomains: string[];
  /** Allowed action types */
  allowedActions: string[];
  /** Blocked action types */
  blockedActions: string[];
  /** Max file upload size in bytes */
  maxFileUploadSize: number;
  /** Allow form submissions */
  allowFormSubmission: boolean;
  /** Allow page navigation */
  allowNavigation: boolean;
  /** Allow JavaScript evaluation */
  allowJavaScript: boolean;
  /** Allow file downloads */
  allowDownloads: boolean;
  /** Allow cookie manipulation */
  allowCookies: boolean;
}

const DEFAULT_PERMISSIONS: AgentPermissions = {
  allowedDomains: ["*"],
  blockedDomains: [],
  allowedActions: ["navigate", "click", "type", "select", "scroll", "hover", "screenshot", "extract", "assert", "wait", "press"],
  blockedActions: [],
  maxFileUploadSize: 10 * 1024 * 1024, // 10MB
  allowFormSubmission: true,
  allowNavigation: true,
  allowJavaScript: true,
  allowDownloads: false,
  allowCookies: true,
};

/**
 * Manages agent permissions with domain and action restrictions.
 */
export class PermissionManager {
  private permissions: AgentPermissions;

  constructor(permissions: Partial<AgentPermissions> = {}) {
    this.permissions = { ...DEFAULT_PERMISSIONS, ...permissions };
  }

  /**
   * Check if a domain is allowed.
   */
  isDomainAllowed(domain: string): boolean {
    // Check blocked first
    for (const pattern of this.permissions.blockedDomains) {
      if (this.matchDomain(domain, pattern)) return false;
    }
    // Check allowed
    for (const pattern of this.permissions.allowedDomains) {
      if (this.matchDomain(domain, pattern)) return true;
    }
    return false;
  }

  /**
   * Check if an action is allowed.
   */
  isActionAllowed(action: string): boolean {
    if (this.permissions.blockedActions.includes(action)) return false;
    if (this.permissions.allowedActions.includes(action)) return true;
    return false;
  }

  /**
   * Check if a URL is allowed for navigation.
   */
  isUrlAllowed(url: string): { allowed: boolean; reason?: string } {
    try {
      const parsed = new URL(url);

      if (!this.permissions.allowNavigation && parsed.protocol !== "data:") {
        return { allowed: false, reason: "Navigation is disabled" };
      }

      if (!this.isDomainAllowed(parsed.hostname)) {
        return { allowed: false, reason: `Domain ${parsed.hostname} is not allowed` };
      }

      return { allowed: true };
    } catch {
      return { allowed: false, reason: "Invalid URL" };
    }
  }

  /**
   * Check if a file upload is allowed.
   */
  isFileUploadAllowed(sizeInBytes: number): { allowed: boolean; reason?: string } {
    if (sizeInBytes > this.permissions.maxFileUploadSize) {
      return {
        allowed: false,
        reason: `File size ${sizeInBytes} exceeds limit ${this.permissions.maxFileUploadSize}`,
      };
    }
    return { allowed: true };
  }

  getPermissions(): AgentPermissions {
    return { ...this.permissions };
  }

  updatePermissions(update: Partial<AgentPermissions>): void {
    this.permissions = { ...this.permissions, ...update };
  }

  private matchDomain(domain: string, pattern: string): boolean {
    if (pattern === "*") return true;
    if (pattern === domain) return true;
    // Wildcard subdomain matching: *.example.com
    if (pattern.startsWith("*.")) {
      const base = pattern.slice(2);
      return domain === base || domain.endsWith(`.${base}`);
    }
    return false;
  }
}
