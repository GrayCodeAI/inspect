// ============================================================================
// @inspect/api - Dashboard Routes
// ============================================================================

import type {
  DashboardSpawnConfig,
  DashboardEvent,
  DashboardSnapshot,
  Unsubscribe,
} from "@inspect/core";
import { SpawnRunSchema, validateBody } from "@inspect/core";
import type { APIServer, APIRequest, APIResponse } from "../server.js";
import type { SSEManager } from "../streaming/sse.js";
import type { WebSocketManager, WSMessage } from "../streaming/websocket.js";

/**
 * Interface consumed by the routes — matches DashboardOrchestrator from
 * @inspect/core but defined here to avoid a cross-package dependency.
 */
export interface DashboardOrchestratorAPI {
  getSnapshot(): DashboardSnapshot;
  onEvent(handler: (event: DashboardEvent) => void): Unsubscribe;
  spawnRuns(config: DashboardSpawnConfig): Promise<string[]>;
  cancelRun(runId: string): boolean;
  cancelAll(): void;
  clearCompleted(): void;
}

/**
 * Register dashboard routes on the API server.
 *
 * GET  /api/dashboard          - Full state snapshot (hydration)
 * GET  /api/dashboard/stream   - SSE real-time event stream
 * POST /api/dashboard/run      - Spawn new test run(s)
 * POST /api/dashboard/run/:id/cancel - Cancel a specific run
 * POST /api/dashboard/cancel-all     - Cancel all active runs
 * POST /api/dashboard/clear          - Clear completed runs
 */
export function registerDashboardRoutes(
  server: APIServer,
  orchestrator: DashboardOrchestratorAPI,
  sseManager: SSEManager,
  wsManager?: WebSocketManager,
): void {
  // Wire orchestrator events to SSE broadcast
  orchestrator.onEvent((event: DashboardEvent) => {
    sseManager.broadcast(event.type, event.data, "dashboard");
    // Also broadcast via WebSocket if available
    wsManager?.broadcast({ type: event.type, data: event.data, channel: "dashboard" }, "dashboard");
  });

  // Wire WebSocket commands if available
  if (wsManager) {
    wsManager.onMessage(async (clientId: string, message: WSMessage) => {
      if (message.channel !== "dashboard" && message.type !== "dashboard:command") return;

      const cmd = message.data as Record<string, unknown> | null;
      if (!cmd || typeof cmd !== "object") return;

      switch (cmd.type) {
        case "spawn_run": {
          const config = cmd.config as DashboardSpawnConfig | undefined;
          if (config?.instruction && Array.isArray(config.devices)) {
            try {
              const runIds = await orchestrator.spawnRuns(config);
              wsManager.send(clientId, {
                type: "dashboard:spawn_result",
                data: { runIds, count: runIds.length },
              });
            } catch (err) {
              wsManager.send(clientId, {
                type: "dashboard:error",
                data: { error: err instanceof Error ? err.message : String(err) },
              });
            }
          }
          break;
        }
        case "cancel_run": {
          const runId = cmd.runId as string | undefined;
          if (runId) {
            const cancelled = orchestrator.cancelRun(runId);
            wsManager.send(clientId, {
              type: "dashboard:cancel_result",
              data: { runId, cancelled },
            });
          }
          break;
        }
        case "cancel_all":
          orchestrator.cancelAll();
          wsManager.send(clientId, {
            type: "dashboard:cancel_all_result",
            data: { cancelled: true },
          });
          break;
        case "clear":
          orchestrator.clearCompleted();
          wsManager.send(clientId, { type: "dashboard:clear_result", data: { cleared: true } });
          break;
      }
    });
  }

  // GET /api/dashboard — full snapshot for initial hydration
  server.get("/api/dashboard", (_req: APIRequest, res: APIResponse) => {
    res.json(orchestrator.getSnapshot());
  });

  // GET /api/dashboard/stream — SSE event stream
  server.get("/api/dashboard/stream", (req: APIRequest, res: APIResponse) => {
    const clientId = sseManager.addClient(res.raw, ["dashboard"]);

    // Send initial snapshot as the first event
    const snapshot = orchestrator.getSnapshot();
    sseManager.sendToClient(clientId, "snapshot", snapshot);

    // Cleanup on disconnect
    req.raw.on("close", () => {
      sseManager.removeClient(clientId);
    });
  });

  // POST /api/dashboard/run — spawn new test run(s)
  server.post("/api/dashboard/run", async (req: APIRequest, res: APIResponse) => {
    const validation = validateBody(SpawnRunSchema, req.body);
    if (!validation.success) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { data } = validation;
    const config: DashboardSpawnConfig = {
      instruction: data.instruction,
      url: data.url,
      agent: data.agent,
      mode: data.mode,
      browser: data.browser,
      devices: data.devices,
      headed: data.headed,
      a11y: data.a11y,
      lighthouse: data.lighthouse,
    };

    try {
      const runIds = await orchestrator.spawnRuns(config);
      res.status(201).json({ runIds, count: runIds.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  // POST /api/dashboard/run/:id/cancel — cancel a specific run
  server.post("/api/dashboard/run/:id/cancel", (req: APIRequest, res: APIResponse) => {
    const cancelled = orchestrator.cancelRun(req.params.id);
    if (!cancelled) {
      res.status(404).json({ error: "Run not found or already completed" });
      return;
    }
    res.json({ cancelled: true, runId: req.params.id });
  });

  // POST /api/dashboard/cancel-all — cancel all active runs
  server.post("/api/dashboard/cancel-all", (_req: APIRequest, res: APIResponse) => {
    orchestrator.cancelAll();
    res.json({ cancelled: true });
  });

  // POST /api/dashboard/clear — clear completed runs from state
  server.post("/api/dashboard/clear", (_req: APIRequest, res: APIResponse) => {
    orchestrator.clearCompleted();
    res.json({ cleared: true });
  });
}
