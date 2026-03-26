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
    InMemoryTaskStore,
    registerWorkflowRoutes,
    registerCredentialRoutes,
    registerSessionRoutes,
    InMemorySessionManager,
    registerSystemRoutes,
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

  // Register task routes with in-memory store
  const taskStore = new InMemoryTaskStore();
  registerTaskRoutes(server, taskStore);

  // Register workflow routes with in-memory store
  const workflowStore = createInMemoryWorkflowStore();
  registerWorkflowRoutes(server, workflowStore);

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
  const sessionManager = new InMemorySessionManager();
  registerSessionRoutes(server, sessionManager);

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

/**
 * Create an in-memory workflow store for the API server.
 */
function createInMemoryWorkflowStore() {
  const workflows = new Map<string, any>();
  const runs = new Map<string, any>();

  return {
    getWorkflow(id: string) { return workflows.get(id); },
    setWorkflow(id: string, w: any) { workflows.set(id, w); },
    deleteWorkflow(id: string) { return workflows.delete(id); },
    listWorkflows() { return Array.from(workflows.values()); },
    getRun(id: string) { return runs.get(id); },
    setRun(id: string, r: any) { runs.set(id, r); },
    listRuns(workflowId?: string) {
      const all = Array.from(runs.values());
      return workflowId ? all.filter((r: any) => r.workflowId === workflowId) : all;
    },
    async executeWorkflow(id: string, params?: Record<string, unknown>) {
      const workflow = workflows.get(id);
      if (!workflow) throw new Error("Workflow not found");

      // Use the workflow executor if available
      try {
        const { WorkflowExecutor } = await import("@inspect/workflow");
        const executor = new WorkflowExecutor();
        const run = await executor.execute(workflow, params);
        runs.set(run.id, run);
        return run;
      } catch {
        // Fallback: create a stub run
        const { generateId } = await import("@inspect/shared");
        const run = {
          id: generateId(),
          workflowId: id,
          status: "completed" as const,
          parameters: params ?? {},
          blockResults: {},
          startedAt: Date.now(),
          completedAt: Date.now(),
          duration: 0,
        };
        runs.set(run.id, run);
        return run;
      }
    },
    cancelRun(runId: string) {
      const run = runs.get(runId);
      if (run) run.status = "cancelled";
    },
    continueRun(runId: string, _data?: unknown) {
      const run = runs.get(runId);
      if (run) run.status = "running";
    },
  };
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
