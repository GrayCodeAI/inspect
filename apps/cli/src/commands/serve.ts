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
    registerTaskRoutes,
    registerWorkflowRoutes,
    registerCredentialRoutes,
    registerSessionRoutes,
    registerSystemRoutes,
    registerAuditRoutes,
    createPersistentStores,
  } = await import("@inspect/api");

  const server = new APIServer({
    jwtSecret: process.env.INSPECT_JWT_SECRET ?? "inspect-dev-secret",
    corsOrigin: enableCors ? "*" : undefined,
    logging: true,
  });

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
      create: (opts) => vault.create(opts as any) as unknown as { id: string; [key: string]: unknown },
      getSafe: (id) => vault.getSafe(id) as unknown as Record<string, unknown> | null,
      update: (id, opts) => vault.update(id, opts) as unknown as Record<string, unknown> | null,
      delete: (id) => vault.delete(id),
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
      name: (d as any).name ?? key,
      width: (d as any).width,
      height: (d as any).height,
      dpr: (d as any).dpr ?? 1,
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

  // Start the server
  await server.start(port, host);

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
  console.log(chalk.dim(`\n  Press Ctrl+C to stop\n`));

  // Graceful shutdown
  const shutdown = async () => {
    console.log(chalk.dim("\nShutting down..."));
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
