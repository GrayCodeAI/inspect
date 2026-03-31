import type { Command } from "commander";
import chalk from "chalk";
import React from "react";
import { render } from "ink";

export interface DashboardOptions {
  port?: string;
  host?: string;
}

async function openDashboard(options: DashboardOptions): Promise<void> {
  const port = parseInt(options.port ?? "4100", 10);
  const host = options.host ?? "127.0.0.1";

  // Check if an API server is already running
  const apiUrl = `http://${host}:${port}/api/health`;
  let serverRunning = false;

  try {
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(2000) });
    serverRunning = res.ok;
  } catch {
    // Not running
  }

  if (serverRunning) {
    // Connect to existing server's SSE stream
    console.log(chalk.dim(`  Connected to Inspect API at ${host}:${port}`));
    console.log(chalk.dim(`  Open http://${host}:${port}/#/live for web dashboard\n`));

    const { DashboardScreen } = await import("../tui/screens/DashboardScreen.js");

    const app = render(
      React.createElement(DashboardScreen, {
        onDone: () => {
          app.unmount();
          process.exit(0);
        },
      }),
    );

    await app.waitUntilExit();
  } else {
    // Start embedded server + dashboard
    console.log(chalk.dim(`  No server found at ${host}:${port}, starting embedded server...\n`));

    const {
      APIServer,
      SSEManager,
      registerDashboardRoutes,
      registerSystemRoutes,
    } = await import("@inspect/api");

    const { DashboardOrchestrator } = await import("@inspect/core");

    const server = new APIServer({ logging: false });
    const sseManager = new SSEManager({ keepAliveMs: 30_000 });

    const orchestrator = new DashboardOrchestrator({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router: null as any,
      browserManager: null,
    });

    registerSystemRoutes(server, {
      api: async () => ({ status: "ok" as const, message: "Dashboard server running" }),
    });

    registerDashboardRoutes(server, orchestrator, sseManager);

    await server.start(port, host);

    console.log(chalk.blue(`  Dashboard API: http://${host}:${port}/api/dashboard`));
    console.log(chalk.dim(`  SSE stream:    http://${host}:${port}/api/dashboard/stream\n`));

    const { DashboardScreen } = await import("../tui/screens/DashboardScreen.js");

    const app = render(
      React.createElement(DashboardScreen, {
        orchestrator,
        onDone: async () => {
          app.unmount();
          sseManager.destroy();
          await server.stop();
          process.exit(0);
        },
      }),
    );

    await app.waitUntilExit();
  }
}

export function registerDashboardCommand(program: Command): void {
  program
    .command("dashboard")
    .description("Open live multi-agent test dashboard")
    .option("-p, --port <port>", "API server port", "4100")
    .option("--host <host>", "API server host", "127.0.0.1")
    .action(async (opts: DashboardOptions) => {
      try {
        await openDashboard(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
