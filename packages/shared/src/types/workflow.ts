// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Workflow System Types
// ──────────────────────────────────────────────────────────────────────────────

/** Types of workflow blocks */
export type WorkflowBlockType =
  | "task"
  | "for_loop"
  | "code"
  | "text_prompt"
  | "data_extraction"
  | "validation"
  | "file_download"
  | "file_upload"
  | "file_parser"
  | "send_email"
  | "http_request"
  | "wait"
  | "human_interaction"
  | "conditional"
  | "pdf_parser"
  | "crawl"
  | "track"
  | "proxy"
  | "benchmark";

/** Single block within a workflow */
export interface WorkflowBlock {
  id: string;
  type: WorkflowBlockType;
  label: string;
  parameters: Record<string, unknown>;
  nextBlockId?: string;
  errorBlockId?: string;
  maxRetries?: number;
  timeout?: number;
  continueOnFailure?: boolean;
}

/** Workflow status */
export type WorkflowStatus = "draft" | "active" | "paused" | "archived";

/** Workflow parameter definition */
export interface WorkflowParameter {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  default?: unknown;
  required?: boolean;
}

/** Complete workflow definition */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  status: WorkflowStatus;
  blocks: WorkflowBlock[];
  parameters?: Record<string, WorkflowParameter>;
  cronSchedule?: string;
  webhookUrl?: string;
  templateEngine: "handlebars";
  strictMode: boolean;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
}

/** Workflow run status */
export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused_for_input";

/** Result of a single block execution */
export interface WorkflowBlockResult {
  blockId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output?: unknown;
  error?: string;
  duration?: number;
  retryCount?: number;
}

/** Single workflow run instance */
export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  parameters: Record<string, unknown>;
  blockResults: Record<string, WorkflowBlockResult>;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  error?: string;
  currentBlockId?: string;
  output?: Record<string, unknown>;
}
