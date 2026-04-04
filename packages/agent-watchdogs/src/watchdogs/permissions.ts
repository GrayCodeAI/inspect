// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Browser Permissions Watchdog
// ──────────────────────────────────────────────────────────────────────────────

import type { Watchdog, WatchdogEvent } from "./manager.js";

/** A tracked permission request */
export interface PermissionRequest {
  /** Permission name */
  permission: string;
  /** When requested */
  timestamp: number;
  /** How it was resolved */
  resolution: "granted" | "denied" | "prompt" | "auto";
  /** URL that requested it */
  url: string;
}

/** Permission auto-handling rules */
export interface PermissionRule {
  /** Permission name pattern */
  permission: string;
  /** Action to take */
  action: "grant" | "deny";
}

/**
 * Watchdog that monitors and manages browser permission requests
 * (geolocation, notifications, camera, microphone, clipboard, etc.).
 *
 * Automatically handles permission prompts according to configured
 * rules to prevent them from blocking test execution.
 */
export class PermissionsWatchdog implements Watchdog {
  readonly type = "permission" as const;
  private requests: PermissionRequest[] = [];
  private pendingEvents: WatchdogEvent[] = [];
  private rules: PermissionRule[] = [];
  private defaultAction: "grant" | "deny" = "deny";

  constructor(rules?: PermissionRule[]) {
    if (rules) {
      this.rules = rules;
    }

    // Default: deny sensitive permissions, grant benign ones
    this.rules.push(
      { permission: "geolocation", action: "grant" },
      { permission: "notifications", action: "deny" },
      { permission: "camera", action: "deny" },
      { permission: "microphone", action: "deny" },
      { permission: "clipboard-read", action: "grant" },
      { permission: "clipboard-write", action: "grant" },
    );
  }

  start(): void {
    this.requests = [];
    this.pendingEvents = [];
  }

  stop(): void {
    // Nothing to clean up
  }

  check(): WatchdogEvent | null {
    return this.pendingEvents.shift() ?? null;
  }

  /**
   * Called when a permission is requested by the page.
   * Returns the action to take (grant or deny).
   */
  onPermissionRequest(permission: string, url: string): "grant" | "deny" {
    const rule = this.rules.find((r) =>
      permission.toLowerCase().includes(r.permission.toLowerCase()),
    );
    const action = rule?.action ?? this.defaultAction;

    const request: PermissionRequest = {
      permission,
      timestamp: Date.now(),
      resolution: action === "grant" ? "granted" : "denied",
      url,
    };
    this.requests.push(request);

    this.pendingEvents.push({
      type: "permission",
      timestamp: Date.now(),
      message: `Permission "${permission}" ${action === "grant" ? "granted" : "denied"} for ${url}`,
      severity: action === "grant" ? "info" : "warning",
      blocking: false,
      data: { request, rule: rule ?? null },
    });

    return action;
  }

  /**
   * Add a permission rule.
   */
  addRule(rule: PermissionRule): void {
    // Override existing rule for the same permission
    this.rules = this.rules.filter((r) => r.permission !== rule.permission);
    this.rules.unshift(rule);
  }

  /**
   * Set the default action for unmatched permissions.
   */
  setDefault(action: "grant" | "deny"): void {
    this.defaultAction = action;
  }

  /**
   * Get all permission requests.
   */
  getRequests(): PermissionRequest[] {
    return [...this.requests];
  }

  /**
   * Get the configured rules.
   */
  getRules(): PermissionRule[] {
    return [...this.rules];
  }

  /**
   * Get the permissions that should be pre-configured on the browser context.
   * Returns permission names that should be granted upfront.
   */
  getGrantedPermissions(): string[] {
    return this.rules.filter((r) => r.action === "grant").map((r) => r.permission);
  }
}
