import type { Command } from "commander";
import type { APIRequest, APIResponse } from "@inspect/api";
import chalk from "chalk";

export interface ServeOptions {
  port?: string;
  host?: string;
  cors?: boolean;
}

async function startServer(options: ServeOptions): Promise<void> {
  const port = parseInt(options.port ?? "4100", 10);
  const host = options.host ?? "127.0.0.1";
  const enableCors = options.cors ?? false;

  // Import the proper API server and route handlers
  const {
    APIServer,
    SSEManager,
    WebSocketManager,
    registerTaskRoutes,
    registerWorkflowRoutes,
    registerCredentialRoutes,
    registerSessionRoutes,
    registerSystemRoutes,
    registerAuditRoutes,
    createPersistentStores,
    RouteRateLimiter,
    MetricsCollector,
    registerMetricsEndpoint,
  } = await import("@inspect/api");

  const isProduction = process.env.NODE_ENV === "production";
  const jwtSecret = process.env.INSPECT_JWT_SECRET;

  if (isProduction && !jwtSecret) {
    console.error(
      chalk.red(
        "FATAL: INSPECT_JWT_SECRET must be set in production. " +
          "Generate one with: openssl rand -base64 32",
      ),
    );
    process.exit(1);
  }

  const server = new APIServer({
    jwtSecret: jwtSecret ?? (isProduction ? undefined : "inspect-dev-secret"),
    corsOrigin: enableCors ? "*" : undefined,
    logging: true,
  });

  // Register security headers and CSRF middleware
  server.use(server.securityHeaders());
  server.use(server.csrfProtection());

  // JWT authentication (only if a secret is configured)
  if (jwtSecret) {
    server.use(server.jwtAuth());
  }

  // RBAC authorization middleware
  const { createRBACMiddleware } = await import("@inspect/api/middleware/rbac.js");
  server.use(createRBACMiddleware());

  // Metrics collection
  const metrics = new MetricsCollector();
  server.use(metrics.middleware());

  // Per-endpoint rate limits (stricter on expensive endpoints)
  const routeLimiter = new RouteRateLimiter([
    { path: "/api/tasks", method: "POST", maxRequests: 20, windowMs: 60_000 },
    { path: "/api/workflows", method: "POST", maxRequests: 15, windowMs: 60_000 },
    { path: "/api/credentials", method: "POST", maxRequests: 10, windowMs: 60_000 },
    { path: "/api/sessions", method: "POST", maxRequests: 10, windowMs: 60_000 },
  ]);
  server.use(routeLimiter.middleware());

  // Streaming managers
  const sseManager = new SSEManager({ keepAliveMs: 30_000 });
  const wsManager = new WebSocketManager({ pingIntervalMs: 30_000 });

  // Register system routes (health, version, models)
  registerSystemRoutes(server, {
    api: async () => ({ status: "ok" as const, message: "API server running" }),
  });

  // Create persistent stores (data survives restarts in .inspect/data/)
  const stores = createPersistentStores();
  console.log(chalk.dim(`  Data directory: ${stores.dataDir}`));

  // Register task routes
  registerTaskRoutes(server, stores.taskStore);

  // Register workflow routes
  registerWorkflowRoutes(server, stores.workflowStore);

  // Register credential routes
  try {
    const { CredentialVault } = await import("@inspect/credentials");
    const vault = new CredentialVault();
    // Adapt CredentialVault to the CredentialVaultAPI interface
    registerCredentialRoutes(server, {
      create: (opts) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vault.create(opts as any) as unknown as { id: string; [key: string]: unknown },
      getSafe: (id) => vault.getSafe(id) as unknown as Record<string, unknown> | null,
      update: (id, opts) => vault.update(id, opts) as unknown as Record<string, unknown> | null,
      delete: (id) => vault.delete(id),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      list: (filter) => vault.list(filter as any) as unknown as Array<Record<string, unknown>>,
      test: (id) => vault.test(id),
    });
  } catch {
    console.log(chalk.dim("  Credential routes: skipped (vault not configured)"));
  }

  // Register session routes
  registerSessionRoutes(server, stores.sessionManager);

  // Register audit routes (a11y, performance)
  registerAuditRoutes(server, stores.dataDir);

  // Add device presets and agents endpoints
  const { DEVICE_PRESETS, SUPPORTED_MODELS } = await import("@inspect/shared");

  server.get("/api/devices", (_req: APIRequest, res: APIResponse) => {
    const devices = Object.entries(DEVICE_PRESETS).map(([key, d]) => ({
      key,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      name: (d as any).name ?? key,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      width: (d as any).width,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      height: (d as any).height,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dpr: (d as any).dpr ?? 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mobile: (d as any).mobile ?? false,
    }));
    res.json({ devices, total: devices.length });
  });

  server.get("/api/agents", (_req: APIRequest, res: APIResponse) => {
    const agents = Object.entries(SUPPORTED_MODELS)
      .filter(([, m]) => m.supportsFunctionCalling)
      .map(([key, m]) => ({
        key,
        name: m.name,
        provider: m.provider,
        supportsVision: m.supportsVision,
        supportsThinking: m.supportsThinking,
      }));
    res.json({ agents, total: agents.length });
  });

  // Register metrics endpoint
  registerMetricsEndpoint(server, metrics);

  // MCP Server endpoint — expose browser automation tools via HTTP for external MCP clients
  const { MCPServer, BROWSER_TOOLS } = await import("@inspect/browser");
  const mcpServer = new MCPServer();
  server.get("/mcp/tools", (_req: APIRequest, res: APIResponse) => {
    res.json({ tools: BROWSER_TOOLS });
  });
  server.post("/mcp/call", async (req: APIRequest, res: APIResponse) => {
    try {
      const { tool, args } = req.body as { tool: string; args: Record<string, unknown> };
      if (!tool) {
        res.status(400).json({ error: "Missing 'tool' field" });
        return;
      }
      const result = await mcpServer.executeMethod(tool, args ?? {});
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // OpenAPI docs endpoint
  let openApiSpec: object | null = null;
  try {
    const { readFileSync, existsSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { join, dirname } = await import("node:path");
    // Resolve from CLI dist -> project root -> packages/api/dist/openapi.json
    const cliDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(cliDir, "..", "..", "..", "packages", "api", "dist", "openapi.json"),
      join(cliDir, "..", "..", "..", "..", "packages", "api", "dist", "openapi.json"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        openApiSpec = JSON.parse(readFileSync(candidate, "utf-8"));
        break;
      }
    }
  } catch {
    // Spec not available
  }
  server.get("/api/docs", (_req: APIRequest, res: APIResponse) => {
    if (openApiSpec) {
      res.json(openApiSpec);
    } else {
      res.status(501).json({ error: "OpenAPI spec not available" });
    }
  });

  // Start the server
  await server.start(port, host);

  // Attach WebSocket upgrade handling to the HTTP server
  const httpServer = server.getServer();
  if (httpServer) {
    wsManager.attach(httpServer);
  }

  console.log(chalk.blue("\nInspect API Server\n"));
  console.log(`  ${chalk.green("→")} http://${host}:${port}`);
  console.log(chalk.dim(`\n  Endpoints:`));
  console.log(chalk.dim(`    GET    /api/health              Health check`));
  console.log(chalk.dim(`    GET    /api/version             Version info`));
  console.log(chalk.dim(`    GET    /api/models              Supported LLM models`));
  console.log(chalk.dim(`    POST   /api/tasks               Create & run a task`));
  console.log(chalk.dim(`    GET    /api/tasks/:id           Get task status`));
  console.log(chalk.dim(`    POST   /api/tasks/:id/cancel    Cancel a task`));
  console.log(chalk.dim(`    POST   /api/workflows           Create a workflow`));
  console.log(chalk.dim(`    GET    /api/workflows            List workflows`));
  console.log(chalk.dim(`    POST   /api/workflows/:id/run   Run a workflow`));
  console.log(chalk.dim(`    POST   /api/credentials         Store credentials`));
  console.log(chalk.dim(`    GET    /api/credentials          List credentials`));
  console.log(chalk.dim(`    POST   /api/sessions            Create session`));
  console.log(chalk.dim(`    GET    /api/sessions             List sessions`));
  console.log(chalk.dim(`    GET    /api/devices              Device presets`));
  console.log(chalk.dim(`    GET    /api/agents               AI agents`));
  console.log(chalk.dim(`    GET    /api/docs                 OpenAPI specification`));
  console.log(chalk.dim(`    GET    /api/metrics              Prometheus metrics`));
  console.log(chalk.dim(`\n  Press Ctrl+C to stop\n`));

  // Graceful shutdown
  const shutdown = async () => {
    console.log(chalk.dim("\nShutting down..."));
    sseManager.destroy();
    wsManager.destroy();
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep alive
  await new Promise(() => {});
}

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Start the Inspect API server")
    .option("-p, --port <port>", "Port to listen on", "4100")
    .option("--host <host>", "Host to bind to", "127.0.0.1")
    .option("--cors", "Enable CORS for all origins")
    .action(async (opts: ServeOptions) => {
      try {
        await startServer(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
