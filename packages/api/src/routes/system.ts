// ============================================================================
// @inspect/api - System Routes
// ============================================================================

import { VERSION, SUPPORTED_MODELS } from "@inspect/shared";
import type { APIServer, APIRequest, APIResponse } from "../server.js";

/** System health status */
export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  version: string;
  timestamp: number;
  checks: Record<string, { status: "ok" | "error"; message?: string; latency?: number }>;
}

/** Health check function */
export type HealthCheck = () => Promise<{
  status: "ok" | "error";
  message?: string;
  latency?: number;
}>;

/**
 * Register system routes on the API server.
 *
 * GET /api/health   - Health check endpoint
 * GET /api/version  - Version information
 * GET /api/models   - Supported LLM models
 */
export function registerSystemRoutes(
  server: APIServer,
  healthChecks?: Record<string, HealthCheck>,
): void {
  const startTime = Date.now();

  // GET /api/health - Health check
  server.get("/api/health", async (_req: APIRequest, res: APIResponse) => {
    const checks: HealthStatus["checks"] = {};
    let overallStatus: HealthStatus["status"] = "healthy";

    // Run all registered health checks
    if (healthChecks) {
      for (const [name, check] of Object.entries(healthChecks)) {
        try {
          const checkStart = Date.now();
          const result = await check();
          result.latency = Date.now() - checkStart;
          checks[name] = result;

          if (result.status === "error") {
            overallStatus = "degraded";
          }
        } catch (error) {
          checks[name] = {
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          };
          overallStatus = "degraded";
        }
      }
    }

    // Basic system checks
    checks.memory = {
      status: "ok",
      message: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB heap used`,
    };

    checks.uptime = {
      status: "ok",
      message: `${Math.round((Date.now() - startTime) / 1000)}s`,
    };

    const health: HealthStatus = {
      status: overallStatus,
      uptime: Date.now() - startTime,
      version: VERSION,
      timestamp: Date.now(),
      checks,
    };

    const statusCode = overallStatus === "healthy" ? 200 : 503;
    res.status(statusCode).json(health);
  });

  // GET /api/version - Version info
  server.get("/api/version", (_req: APIRequest, res: APIResponse) => {
    res.json({
      version: VERSION,
      name: "inspect",
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    });
  });

  // GET /api/models - Supported models
  server.get("/api/models", (req: APIRequest, res: APIResponse) => {
    const provider = req.query.provider;

    const models = Object.entries(SUPPORTED_MODELS)
      .filter(([_, m]) => !provider || m.provider === provider)
      .map(([key, m]) => ({
        key,
        id: m.id,
        name: m.name,
        provider: m.provider,
        contextWindow: m.contextWindow,
        maxOutput: m.maxOutput,
        supportsVision: m.supportsVision,
        supportsThinking: m.supportsThinking,
        supportsFunctionCalling: m.supportsFunctionCalling,
        costPer1kInput: m.costPer1kInput,
        costPer1kOutput: m.costPer1kOutput,
      }));

    res.json({ models, total: models.length });
  });
}
