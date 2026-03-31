// ============================================================================
// RBAC Authorization Middleware
// ============================================================================
// Enforces role-based access control on API routes.
// Must be used after jwtAuth() middleware (requires req.user to be set).
// ============================================================================

import type { Middleware } from "../server.js";
import { RBACManager, Role, type UserIdentity } from "@inspect/enterprise";

// Route-to-permission mapping: maps route patterns to required resource/action pairs
const ROUTE_PERMISSIONS: Record<string, { resource: string; action: string }> = {
  // Tasks
  "GET /api/tasks": { resource: "tests", action: "read" },
  "POST /api/tasks": { resource: "tests", action: "create" },
  "GET /api/tasks/:id": { resource: "tests", action: "read" },
  "DELETE /api/tasks/:id": { resource: "tests", action: "delete" },

  // Workflows
  "GET /api/workflows": { resource: "workflows", action: "read" },
  "POST /api/workflows": { resource: "workflows", action: "create" },
  "POST /api/workflows/:id/run": { resource: "workflows", action: "execute" },
  "DELETE /api/workflows/:id": { resource: "workflows", action: "delete" },

  // Credentials
  "GET /api/credentials": { resource: "credentials", action: "read" },
  "POST /api/credentials": { resource: "credentials", action: "create" },
  "PUT /api/credentials/:id": { resource: "credentials", action: "update" },
  "DELETE /api/credentials/:id": { resource: "credentials", action: "delete" },

  // Sessions
  "GET /api/sessions": { resource: "sessions", action: "read" },
  "POST /api/sessions": { resource: "sessions", action: "create" },
  "DELETE /api/sessions/:id": { resource: "sessions", action: "delete" },

  // Audits
  "GET /api/audits": { resource: "reports", action: "read" },
  "POST /api/audits": { resource: "tests", action: "execute" },

  // Dashboard
  "GET /api/dashboard": { resource: "dashboard", action: "read" },

  // System
  "GET /api/system/health": { resource: "system", action: "read" },
  "GET /api/system/metrics": { resource: "system", action: "read" },
};

// Routes that bypass RBAC (public or system-level)
const RBAC_EXEMPT_ROUTES = new Set(["GET /api/system/health"]);

export interface RBACMiddlewareConfig {
  /** Custom RBAC manager instance. If not provided, a default one is created. */
  manager?: RBACManager;
  /** When true, log RBAC denials (default: true) */
  logDenials?: boolean;
}

/**
 * Create RBAC authorization middleware.
 *
 * Usage:
 *   const rbac = createRBACMiddleware({ manager: myManager });
 *   server.use(rbac);
 *
 * The middleware extracts the user's role from the JWT (req.user.role),
 * looks up the required permission for the route, and denies access if
 * the user lacks the permission.
 */
export function createRBACMiddleware(config?: RBACMiddlewareConfig): Middleware {
  const manager = config?.manager ?? new RBACManager();
  const logDenials = config?.logDenials ?? true;

  return async (req, res, next) => {
    // Skip RBAC for exempt routes
    const routeKey = `${req.method} ${req.url?.split("?")[0]}`;
    if (RBAC_EXEMPT_ROUTES.has(routeKey)) {
      await next();
      return;
    }

    // Require authentication
    const user = (req as Record<string, unknown>).user as UserIdentity | undefined;
    if (!user) {
      // Let jwtAuth handle missing auth — if we got here without a user,
      // jwtAuth is not configured or failed silently
      await next();
      return;
    }

    // Look up required permission for this route
    const required = ROUTE_PERMISSIONS[routeKey];
    if (!required) {
      // No RBAC rule for this route — allow by default
      await next();
      return;
    }

    // Check permission
    if (manager.hasPermission(user, required.resource, required.action)) {
      await next();
      return;
    }

    // Deny access
    if (logDenials) {
      console.warn(
        `[RBAC] Denied: user=${user.id} role=${user.role} ` +
          `resource=${required.resource} action=${required.action} route=${routeKey}`,
      );
    }

    res.status(403).json({
      error: "Forbidden",
      message: `Role '${user.role}' does not have permission to ${required.action} ${required.resource}`,
      required,
      role: user.role,
    });
  };
}

/**
 * Helper: elevate a user's role temporarily (for admin overrides).
 */
export function withElevatedRole<T>(user: UserIdentity, role: Role, fn: () => T): T {
  const originalRole = user.role;
  user.role = role;
  try {
    return fn();
  } finally {
    user.role = originalRole;
  }
}
