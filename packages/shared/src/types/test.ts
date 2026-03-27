// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Test Result Types
// ──────────────────────────────────────────────────────────────────────────────

import type { TokenMetrics } from "./agent.js";
import type { GitScope } from "./git.js";

/** Status of a test step */
export type TestStepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'error';

/** Error information from a test step */
export interface TestError {
  message: string;
  stack?: string;
  type?: string;
  screenshot?: string;
  pageUrl?: string;
  elementRef?: string;
}

/** Single step within a test execution */
export interface TestStep {
  id: string;
  instruction: string;
  expectedOutcome: string;
  result?: string;
  status: TestStepStatus;
  duration: number;
  screenshot?: string;
  consoleErrors?: string[];
  targetRef?: string;
  action?: string;
  error?: TestError;
  startedAt: number;
  completedAt?: number;
}

/** Aggregate result of a full test run */
export interface TestResult {
  passed: boolean;
  steps: TestStep[];
  duration: number;
  errors: TestError[];
  screenshots: string[];
  metadata?: TestRunMetadata;
  startedAt: number;
  completedAt: number;
  summary?: string;
  agentMode?: 'dom' | 'hybrid' | 'cua';
  device?: string;
  tokenUsage?: TokenMetrics;
}

/** Metadata about a test run */
export interface TestRunMetadata {
  runId: string;
  planId?: string;
  flowSlug?: string;
  targetUrl?: string;
  gitScope?: GitScope;
  device?: string;
  model?: string;
  triggeredBy?: 'cli' | 'api' | 'schedule' | 'pr';
}
