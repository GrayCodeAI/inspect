// ============================================================================
// @inspect/api - Session Routes
// ============================================================================

import { generateId } from "@inspect/core";
import type { APIServer, APIRequest, APIResponse } from "../server.js";

/** Browser session */
export interface BrowserSession {
  id: string;
  status: "active" | "idle" | "closed";
  browserType: string;
  createdAt: number;
  lastActivityAt: number;
  metadata?: Record<string, unknown>;
}

/** Session manager interface */
export interface SessionManager {
  create(options?: Record<string, unknown>): Promise<BrowserSession>;
  get(id: string): BrowserSession | undefined;
  list(): BrowserSession[];
  close(id: string): Promise<boolean>;
}

/**
 * Register session routes on the API server.
 *
 * POST   /api/sessions        - Create a browser session
 * GET    /api/sessions        - List sessions
 * GET    /api/sessions/:id    - Get session
 * DELETE /api/sessions/:id    - Close session
 */
export function registerSessionRoutes(
  server: APIServer,
  sessionManager: SessionManager,
): void {
  // POST /api/sessions
  server.post(
    "/api/sessions",
    async (req: APIRequest, res: APIResponse) => {
      try {
        const options = (req.body as Record<string, unknown>) ?? {};
        const session = await sessionManager.create(options);
        res.status(201).json(session);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to create session",
        });
      }
    },
  );

  // GET /api/sessions
  server.get(
    "/api/sessions",
    (req: APIRequest, res: APIResponse) => {
      const sessions = sessionManager.list();
      const status = req.query.status;
      const filtered = status
        ? sessions.filter((s) => s.status === status)
        : sessions;
      res.json({ sessions: filtered, total: filtered.length });
    },
  );

  // GET /api/sessions/:id
  server.get(
    "/api/sessions/:id",
    (req: APIRequest, res: APIResponse) => {
      const session = sessionManager.get(req.params.id);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.json(session);
    },
  );

  // DELETE /api/sessions/:id
  server.delete(
    "/api/sessions/:id",
    async (req: APIRequest, res: APIResponse) => {
      try {
        const closed = await sessionManager.close(req.params.id);
        if (!closed) {
          res.status(404).json({ error: "Session not found" });
          return;
        }
        res.json({ closed: true, id: req.params.id });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to close session",
        });
      }
    },
  );
}

/**
 * In-memory session manager implementation.
 */
export class InMemorySessionManager implements SessionManager {
  private sessions: Map<string, BrowserSession> = new Map();

  async create(
    options?: Record<string, unknown>,
  ): Promise<BrowserSession> {
    const session: BrowserSession = {
      id: generateId(),
      status: "active",
      browserType: (options?.browserType as string) ?? "chromium",
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      metadata: options,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): BrowserSession | undefined {
    return this.sessions.get(id);
  }

  list(): BrowserSession[] {
    return Array.from(this.sessions.values());
  }

  async close(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.status = "closed";
    return true;
  }
}
