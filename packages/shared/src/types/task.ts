// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Task & Flow System Types
// ──────────────────────────────────────────────────────────────────────────────

import type { ProxyConfig } from "./browser-config.js";
import type { TestResult } from "../models.js";

/** Task status */
export type TaskStatus =
  | "created"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

/** Task definition for browser automation */
export interface TaskDefinition {
  prompt: string;
  url: string;
  maxSteps: number;
  maxIterations: number;
  errorCodes?: Record<string, string>;
  extractionSchema?: Record<string, unknown>;
  navigationPayload?: Record<string, unknown>;
  webhookCallbackUrl?: string;
  proxy?: ProxyConfig;
  totpCredentialId?: string;
}

/** Task artifact */
export interface TaskArtifact {
  id: string;
  type: "screenshot" | "recording" | "har" | "pdf" | "json" | "html";
  path: string;
  size: number;
  createdAt: number;
}

/** Task instance */
export interface Task {
  id: string;
  status: TaskStatus;
  definition: TaskDefinition;
  result?: TestResult;
  extractedData?: unknown;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  artifacts?: TaskArtifact[];
}

/** Step within a reusable test flow */
export interface FlowStep {
  id: string;
  instruction: string;
  expectedOutcome: string;
  preconditions?: string[];
  variables?: Record<string, string>;
}

/** Reusable test flow */
export interface TestFlow {
  slug: string;
  title: string;
  description: string;
  version: number;
  targetScope: "unstaged" | "branch" | "changes";
  environment: {
    baseUrl: string;
    cookiesRequired: boolean;
  };
  steps: FlowStep[];
  createdAt: number;
  updatedAt: number;
}

/** Types of watchdog events */
export type WatchdogEventType =
  | "captcha_detected"
  | "captcha_solved"
  | "download_started"
  | "download_completed"
  | "popup_detected"
  | "popup_handled"
  | "crash_detected"
  | "crash_recovered"
  | "permission_requested"
  | "permission_handled"
  | "dom_changed"
  | "security_alert"
  | "storage_saved"
  | "about_blank_handled"
  | "action_loop_detected"
  | "screenshot_captured"
  | "har_entry_recorded"
  | "recording_started"
  | "recording_stopped";

/** Watchdog event */
export interface WatchdogEvent {
  type: WatchdogEventType;
  timestamp: number;
  data: Record<string, unknown>;
  source?: string;
  autoHandled?: boolean;
}
