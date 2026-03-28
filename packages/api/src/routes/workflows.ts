// ============================================================================
// @inspect/api - Workflow Routes
// ============================================================================

import {
  generateId,
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  validateBody,
} from "@inspect/shared";
import type { WorkflowDefinition, WorkflowRun, WorkflowStatus } from "@inspect/shared";
import type { APIServer, APIRequest, APIResponse } from "../server.js";

/** Workflow store interface */
export interface WorkflowStore {
  getWorkflow(id: string): WorkflowDefinition | undefined;
  setWorkflow(id: string, workflow: WorkflowDefinition): void;
  deleteWorkflow(id: string): boolean;
  listWorkflows(): WorkflowDefinition[];
  getRun(id: string): WorkflowRun | undefined;
  setRun(id: string, run: WorkflowRun): void;
  listRuns(workflowId?: string): WorkflowRun[];
  executeWorkflow(id: string, params?: Record<string, unknown>): Promise<WorkflowRun>;
  cancelRun(runId: string): void;
  continueRun(runId: string, data?: unknown): void;
}

/**
 * Register workflow routes on the API server.
 *
 * POST   /api/workflows            - Create a workflow
 * GET    /api/workflows            - List workflows
 * GET    /api/workflows/:id        - Get a workflow
 * PUT    /api/workflows/:id        - Update a workflow
 * DELETE /api/workflows/:id        - Delete a workflow
 * POST   /api/workflows/:id/run    - Run a workflow
 * GET    /api/workflows/runs/:id   - Get run status
 * POST   /api/workflows/runs/:id/cancel   - Cancel a run
 * POST   /api/workflows/runs/:id/continue - Continue paused run
 */
export function registerWorkflowRoutes(server: APIServer, store: WorkflowStore): void {
  // POST /api/workflows - Create a workflow
  server.post("/api/workflows", (req: APIRequest, res: APIResponse) => {
    const validation = validateBody(CreateWorkflowSchema, req.body);
    if (!validation.success) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { data } = validation;
    const now = Date.now();
    const workflow: WorkflowDefinition = {
      id: generateId(),
      name: data.name,
      description: data.description,
      version: 1,
      status: data.status,
      blocks: data.blocks as WorkflowDefinition["blocks"],
      parameters: data.parameters as WorkflowDefinition["parameters"],
      cronSchedule: data.cronSchedule,
      templateEngine: "handlebars",
      strictMode: data.strictMode,
      createdAt: now,
      updatedAt: now,
      tags: data.tags,
    };

    store.setWorkflow(workflow.id, workflow);
    res.status(201).json(workflow);
  });

  // GET /api/workflows - List workflows
  server.get("/api/workflows", (req: APIRequest, res: APIResponse) => {
    const workflows = store.listWorkflows();
    const status = req.query.status as WorkflowStatus | undefined;

    const filtered = status ? workflows.filter((w) => w.status === status) : workflows;

    res.json({
      workflows: filtered.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        status: w.status,
        version: w.version,
        blockCount: w.blocks.length,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        tags: w.tags,
      })),
      total: filtered.length,
    });
  });

  // GET /api/workflows/:id - Get a workflow
  server.get("/api/workflows/:id", (req: APIRequest, res: APIResponse) => {
    const workflow = store.getWorkflow(req.params.id);
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }
    res.json(workflow);
  });

  // PUT /api/workflows/:id - Update a workflow
  server.put("/api/workflows/:id", (req: APIRequest, res: APIResponse) => {
    const workflow = store.getWorkflow(req.params.id);
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    const validation = validateBody(UpdateWorkflowSchema, req.body);
    if (!validation.success) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { data } = validation;
    if (data.name !== undefined) workflow.name = data.name;
    if (data.description !== undefined) workflow.description = data.description;
    if (data.status !== undefined) workflow.status = data.status;
    if (data.blocks !== undefined) workflow.blocks = data.blocks as WorkflowDefinition["blocks"];
    if (data.parameters !== undefined)
      workflow.parameters = data.parameters as WorkflowDefinition["parameters"];
    if (data.cronSchedule !== undefined) workflow.cronSchedule = data.cronSchedule;
    if (data.tags !== undefined) workflow.tags = data.tags;
    if (data.strictMode !== undefined) workflow.strictMode = data.strictMode;

    workflow.version += 1;
    workflow.updatedAt = Date.now();

    store.setWorkflow(workflow.id, workflow);
    res.json(workflow);
  });

  // DELETE /api/workflows/:id - Delete a workflow
  server.delete("/api/workflows/:id", (req: APIRequest, res: APIResponse) => {
    const deleted = store.deleteWorkflow(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }
    res.json({ deleted: true, id: req.params.id });
  });

  // POST /api/workflows/:id/run - Run a workflow
  server.post("/api/workflows/:id/run", async (req: APIRequest, res: APIResponse) => {
    const workflow = store.getWorkflow(req.params.id);
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    if (workflow.status !== "active" && workflow.status !== "draft") {
      res.status(400).json({
        error: `Cannot run workflow in '${workflow.status}' state`,
      });
      return;
    }

    const params = (req.body as Record<string, unknown>) ?? {};

    try {
      const run = await store.executeWorkflow(req.params.id, params);
      res.status(202).json({
        runId: run.id,
        workflowId: run.workflowId,
        status: run.status,
        startedAt: run.startedAt,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Execution failed",
      });
    }
  });

  // GET /api/workflows/runs/:id - Get run status
  server.get("/api/workflows/runs/:id", (req: APIRequest, res: APIResponse) => {
    const run = store.getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Workflow run not found" });
      return;
    }
    res.json(run);
  });

  // POST /api/workflows/runs/:id/cancel - Cancel a run
  server.post("/api/workflows/runs/:id/cancel", (req: APIRequest, res: APIResponse) => {
    const run = store.getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Workflow run not found" });
      return;
    }
    store.cancelRun(req.params.id);
    res.json({ runId: run.id, status: "cancelled" });
  });

  // POST /api/workflows/runs/:id/continue - Continue paused run
  server.post("/api/workflows/runs/:id/continue", (req: APIRequest, res: APIResponse) => {
    const run = store.getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Workflow run not found" });
      return;
    }
    if (run.status !== "paused_for_input") {
      res.status(400).json({ error: "Run is not paused for input" });
      return;
    }
    store.continueRun(req.params.id, req.body);
    res.json({ runId: run.id, status: "running" });
  });
}
