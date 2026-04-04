// ============================================================================
// @inspect/api - Audit Routes (a11y, performance)
// ============================================================================

import type { APIServer, APIRequest, APIResponse } from "../server.js";
import { JsonStore } from "../storage/json-store.js";

/** Stored a11y audit result */
interface A11yAuditRecord {
  id: string;
  score: number;
  violations: Array<{ id: string; impact: string; description: string; nodes: number }>;
  passes: number;
  total: number;
  standard: string;
  url: string;
  timestamp: number;
}

/** Stored performance audit result */
interface PerfAuditRecord {
  id: string;
  scores: { performance: number; accessibility: number; bestPractices: number; seo: number };
  metrics: Record<string, { value: number; rating: string; displayValue?: string }>;
  url: string;
  timestamp: number;
}

/**
 * Register audit result routes on the API server.
 *
 * GET  /api/audits/a11y            - Get latest a11y audit result
 * POST /api/audits/a11y            - Store an a11y audit result
 * GET  /api/audits/performance     - Get latest performance audit result
 * POST /api/audits/performance     - Store a performance audit result
 */
export function registerAuditRoutes(server: APIServer, dataDir: string): void {
  const a11yStore = new JsonStore<A11yAuditRecord>(dataDir, "audits-a11y");
  const perfStore = new JsonStore<PerfAuditRecord>(dataDir, "audits-performance");

  // GET /api/audits/a11y - Get latest a11y audit
  server.get("/api/audits/a11y", (_req: APIRequest, res: APIResponse) => {
    const records = a11yStore.list();
    if (records.length === 0) {
      res.status(404).json({ error: "No a11y audit results available" });
      return;
    }
    // Return the most recent
    const latest = records.sort((a, b) => b.timestamp - a.timestamp)[0];
    res.json(latest);
  });

  // POST /api/audits/a11y - Store an a11y audit result
  server.post("/api/audits/a11y", (req: APIRequest, res: APIResponse) => {
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Request body must be a JSON object" });
      return;
    }

    const record: A11yAuditRecord = {
      id: `a11y_${Date.now()}`,
      score: (body.score as number) ?? 0,
      violations: (body.violations as A11yAuditRecord["violations"]) ?? [],
      passes: (body.passes as number) ?? 0,
      total: (body.total as number) ?? 0,
      standard: (body.standard as string) ?? "wcag2aa",
      url: (body.url as string) ?? "",
      timestamp: Date.now(),
    };

    a11yStore.set(record.id, record);
    res.status(201).json(record);
  });

  // GET /api/audits/performance - Get latest performance audit
  server.get("/api/audits/performance", (_req: APIRequest, res: APIResponse) => {
    const records = perfStore.list();
    if (records.length === 0) {
      res.status(404).json({ error: "No performance audit results available" });
      return;
    }
    const latest = records.sort((a, b) => b.timestamp - a.timestamp)[0];
    res.json(latest);
  });

  // POST /api/audits/performance - Store a performance audit result
  server.post("/api/audits/performance", (req: APIRequest, res: APIResponse) => {
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Request body must be a JSON object" });
      return;
    }

    const record: PerfAuditRecord = {
      id: `perf_${Date.now()}`,
      scores: (body.scores as PerfAuditRecord["scores"]) ?? {
        performance: 0,
        accessibility: 0,
        bestPractices: 0,
        seo: 0,
      },
      metrics: (body.metrics as PerfAuditRecord["metrics"]) ?? {},
      url: (body.url as string) ?? "",
      timestamp: Date.now(),
    };

    perfStore.set(record.id, record);
    res.status(201).json(record);
  });
}
