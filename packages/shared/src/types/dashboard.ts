/**
 * Dashboard types for multi-agent test monitoring.
 *
 * Shared contract between backend (DashboardOrchestrator) and
 * frontend consumers (TUI DashboardScreen, Web Live Dashboard).
 */

import type { DashboardRunState } from "../models.js";

// ---------------------------------------------------------------------------
// Agent activity — what an agent is doing right now
// ---------------------------------------------------------------------------

export type AgentActivityType =
  | "navigating"
  | "clicking"
  | "typing"
  | "scrolling"
  | "waiting"
  | "thinking"
  | "verifying"
  | "capturing";

export interface DashboardAgentActivity {
  type: AgentActivityType;
  target?: string;
  description: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Per-run state snapshot
// ---------------------------------------------------------------------------

export type DashboardRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type DashboardRunPhase = "planning" | "executing" | "verifying" | "done";

export interface DashboardStepSnapshot {
  index: number;
  description: string;
  status: "pending" | "running" | "pass" | "fail" | "skipped";
  duration?: number;
  toolCall?: string;
}

// DashboardRunState is defined as Schema.Class in models.ts
// Import from there to avoid duplication

// ---------------------------------------------------------------------------
// Aggregate summary
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  totalRuns: number;
  completed: number;
  passed: number;
  failed: number;
  running: number;
  queued: number;
  elapsed: number;
}

// ---------------------------------------------------------------------------
// Log entries
// ---------------------------------------------------------------------------

export type DashboardLogLevel = "debug" | "info" | "warn" | "error";

export interface DashboardLogEntry {
  runId: string;
  level: DashboardLogLevel;
  message: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Events — discriminated union sent over SSE / event bus
// ---------------------------------------------------------------------------

export type DashboardEvent =
  | { type: "run:started"; data: DashboardRunState }
  | {
      type: "run:progress";
      data: {
        runId: string;
        phase: DashboardRunPhase;
        currentStep: number;
        totalSteps: number;
        tokenCount: number;
        elapsed: number;
        agentActivity?: DashboardAgentActivity;
      };
    }
  | { type: "run:step_completed"; data: { runId: string; step: DashboardStepSnapshot } }
  | { type: "run:screenshot"; data: { runId: string; screenshot: string; timestamp: number } }
  | { type: "run:log"; data: DashboardLogEntry }
  | {
      type: "run:completed";
      data: {
        runId: string;
        status: "completed" | "failed" | "cancelled";
        duration: number;
        passed: boolean;
      };
    }
  | { type: "summary:updated"; data: DashboardSummary }
  | { type: "flakiness:updated"; data: DashboardFlakinessReport };

// ---------------------------------------------------------------------------
// Commands — sent from UI back to orchestrator
// ---------------------------------------------------------------------------

export interface DashboardSpawnConfig {
  instruction: string;
  url?: string;
  agent?: string;
  mode?: "dom" | "hybrid" | "cua";
  browser?: "chromium" | "firefox" | "webkit";
  devices: string[];
  headed?: boolean;
  a11y?: boolean;
  lighthouse?: boolean;
}

export type DashboardCommand =
  | { type: "spawn_run"; config: DashboardSpawnConfig }
  | { type: "cancel_run"; runId: string }
  | { type: "cancel_all" };

// ---------------------------------------------------------------------------
// Flakiness data
// ---------------------------------------------------------------------------

export interface DashboardFlakinessEntry {
  testName: string;
  score: number;
  passRate: number;
  totalRuns: number;
  recommendation: "stable" | "flaky" | "broken" | "needs-investigation";
}

export interface DashboardFlakinessReport {
  totalTests: number;
  stableTests: number;
  flakyTests: number;
  brokenTests: number;
  entries: DashboardFlakinessEntry[];
}

// DashboardSnapshot is defined as Schema.Class in models.ts
// Import from there to avoid duplication
