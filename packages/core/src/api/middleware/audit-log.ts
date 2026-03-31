// ============================================================================
// @inspect/api - Audit Logging Middleware
// ============================================================================

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import * as path from "node:path";
import type { Middleware, APIRequest, APIResponse } from "../server.js";
import { createLogger } from "@inspect/core";

const logger = createLogger("api/audit-log");

/** Audit log entry */
export interface AuditLogEntry {
  /** ISO timestamp */
  timestamp: string;
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Client IP address */
  clientIp: string;
  /** Authenticated user (from JWT) */
  userId?: string;
  /** Response status code */
  statusCode: number;
  /** Duration in ms */
  durationMs: number;
  /** Resource type (e.g. "credential", "session") */
  resourceType?: string;
  /** Resource ID if applicable */
  resourceId?: string;
  /** Action description */
  action: string;
}

/** Audit logger configuration */
export interface AuditLogConfig {
  /** File path for audit logs (default: .inspect/audit.log) */
  filePath?: string;
  /** Paths to audit (default: credentials, sessions) */
  auditPaths?: string[];
  /** Custom log handler (receives entries for external logging) */
  onEntry?: (entry: AuditLogEntry) => void;
  /** Whether to log to stdout as well (default: false) */
  stdout?: boolean;
}

/** Paths and their resource types */
const RESOURCE_PATTERNS: Array<{
  pattern: RegExp;
  type: string;
  actionMap: Record<string, string>;
}> = [
  {
    pattern: /^\/api\/credentials(?:\/([^/]+))?(?:\/(.+))?$/,
    type: "credential",
    actionMap: {
      GET: "read",
      POST: "create",
      PUT: "update",
      DELETE: "delete",
    },
  },
  {
    pattern: /^\/api\/sessions(?:\/([^/]+))?$/,
    type: "session",
    actionMap: {
      GET: "read",
      POST: "create",
      DELETE: "close",
    },
  },
  {
    pattern: /^\/api\/webhooks(?:\/([^/]+))?$/,
    type: "webhook",
    actionMap: {
      GET: "read",
      POST: "create",
      PUT: "update",
      DELETE: "delete",
    },
  },
  {
    pattern: /^\/api\/workflows(?:\/([^/]+))?(?:\/(.+))?$/,
    type: "workflow",
    actionMap: {
      GET: "read",
      POST: "create",
      PUT: "update",
      DELETE: "delete",
    },
  },
];

/**
 * AuditLogger records security-relevant API operations to a log file.
 * Tracks credential access, session management, and other sensitive operations.
 */
export class AuditLogger {
  private config: Required<Omit<AuditLogConfig, "onEntry">> & { onEntry?: AuditLogConfig["onEntry"] };

  constructor(config?: AuditLogConfig) {
    const filePath = config?.filePath ?? path.join(process.cwd(), ".inspect", "audit.log");

    this.config = {
      filePath,
      auditPaths: config?.auditPaths ?? [
        "/api/credentials",
        "/api/sessions",
        "/api/webhooks",
        "/api/workflows",
      ],
      onEntry: config?.onEntry,
      stdout: config?.stdout ?? false,
    };

    // Ensure directory exists
    const dir = path.dirname(this.config.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Create a middleware function for audit logging.
   */
  middleware(): Middleware {
    return async (req: APIRequest, res: APIResponse, next: () => Promise<void>) => {
      // Only audit configured paths
      const shouldAudit = this.config.auditPaths.some((p) => req.path.startsWith(p));
      if (!shouldAudit) {
        await next();
        return;
      }

      const startTime = Date.now();

      // Execute the route handler
      await next();

      // Build the audit entry after response is determined
      const entry = this.buildEntry(req, res, startTime);
      this.record(entry);
    };
  }

  /**
   * Manually record an audit entry (for non-HTTP events).
   */
  record(entry: AuditLogEntry): void {
    const line = JSON.stringify(entry);

    // Write to file
    try {
      appendFileSync(this.config.filePath, line + "\n", "utf-8");
    } catch (error) {
      process.stderr.write(
        `[AuditLogger] Failed to write audit log: ${error instanceof Error ? error.message : error}\n`,
      );
    }

    // Write to stdout if configured
    if (this.config.stdout) {
      process.stdout.write(`[AUDIT] ${entry.action} ${entry.resourceType ?? ""}${entry.resourceId ? `:${entry.resourceId}` : ""} by ${entry.userId ?? entry.clientIp} -> ${entry.statusCode}\n`);
    }

    // Call custom handler
    if (this.config.onEntry) {
      try {
        this.config.onEntry(entry);
      } catch (error) {
        logger.warn("Audit log callback failed", { error });
      }
    }
  }

  /**
   * Get the audit log file path.
   */
  getFilePath(): string {
    return this.config.filePath;
  }

  private buildEntry(req: APIRequest, res: APIResponse, startTime: number): AuditLogEntry {
    const { resourceType, resourceId, action } = this.parseResource(req.path, req.method);

    return {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      clientIp: this.extractClientIp(req),
      userId: req.user?.sub ? String(req.user.sub) : req.user?.userId ? String(req.user.userId) : undefined,
      statusCode: res.statusCode,
      durationMs: Date.now() - startTime,
      resourceType,
      resourceId,
      action,
    };
  }

  private parseResource(
    requestPath: string,
    method: string,
  ): { resourceType?: string; resourceId?: string; action: string } {
    for (const { pattern, type, actionMap } of RESOURCE_PATTERNS) {
      const match = requestPath.match(pattern);
      if (match) {
        const resourceId = match[1] || undefined;
        const subAction = match[2];
        let action = actionMap[method] ?? method.toLowerCase();

        // Handle sub-actions like /credentials/:id/test
        if (subAction) {
          action = subAction;
        }

        return { resourceType: type, resourceId, action };
      }
    }

    return { action: `${method.toLowerCase()} ${requestPath}` };
  }

  private extractClientIp(req: APIRequest): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
      return ip.trim();
    }

    const realIp = req.headers["x-real-ip"];
    if (realIp && typeof realIp === "string") {
      return realIp.trim();
    }

    return req.raw.socket?.remoteAddress ?? "unknown";
  }
}
