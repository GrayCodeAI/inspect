// ──────────────────────────────────────────────────────────────────────────────
// @inspect/dashboard - Shared Types
// ──────────────────────────────────────────────────────────────────────────────

/** WebSocket message types */
export type DashboardMessage =
  | TestStartedMessage
  | TestCompletedMessage
  | StepStartedMessage
  | StepCompletedMessage
  | AgentThinkingMessage
  | AgentActionMessage
  | ErrorMessage
  | StatsUpdateMessage;

/** Base message interface */
export interface BaseMessage {
  type: string;
  timestamp: number;
  sessionId: string;
}

/** Test execution started */
export interface TestStartedMessage extends BaseMessage {
  type: "test:started";
  testId: string;
  testName: string;
  url: string;
  startTime: number;
}

/** Test execution completed */
export interface TestCompletedMessage extends BaseMessage {
  type: "test:completed";
  testId: string;
  success: boolean;
  duration: number;
  stepCount: number;
  error?: string;
}

/** Step execution started */
export interface StepStartedMessage extends BaseMessage {
  type: "step:started";
  stepId: string;
  stepNumber: number;
  totalSteps: number;
  instruction: string;
}

/** Step execution completed */
export interface StepCompletedMessage extends BaseMessage {
  type: "step:completed";
  stepId: string;
  success: boolean;
  duration: number;
  action?: AgentAction;
  error?: string;
}

/** Agent is thinking/planning */
export interface AgentThinkingMessage extends BaseMessage {
  type: "agent:thinking";
  thought: string;
  context?: Record<string, unknown>;
}

/** Agent performed an action */
export interface AgentActionMessage extends BaseMessage {
  type: "agent:action";
  action: AgentAction;
  result: ActionResult;
}

/** Error occurred */
export interface ErrorMessage extends BaseMessage {
  type: "error";
  error: string;
  stack?: string;
  stepId?: string;
}

/** Stats update */
export interface StatsUpdateMessage extends BaseMessage {
  type: "stats:update";
  stats: DashboardStats;
}

/** Agent action details */
export interface AgentAction {
  type: string;
  selector?: string;
  value?: string;
  description: string;
  timestamp: number;
}

/** Action result */
export interface ActionResult {
  success: boolean;
  duration: number;
  screenshot?: string; // base64 encoded
  error?: string;
}

/** Dashboard statistics */
export interface DashboardStats {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageDuration: number;
  activeTests: number;
  cacheHitRate: number;
  lastUpdated: number;
}

/** Test execution record */
export interface TestExecution {
  id: string;
  name: string;
  url: string;
  status: "running" | "completed" | "failed";
  startTime: number;
  endTime?: number;
  duration?: number;
  steps: StepExecution[];
  error?: string;
  sessionId: string;
}

/** Step execution record */
export interface StepExecution {
  id: string;
  number: number;
  instruction: string;
  status: "pending" | "running" | "completed" | "failed";
  startTime?: number;
  endTime?: number;
  duration?: number;
  action?: AgentAction;
  error?: string;
  screenshot?: string;
}

/** Filter options for test history */
export interface TestFilter {
  status?: ("passed" | "failed")[];
  startDate?: number;
  endDate?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Paginated test results */
export interface PaginatedTests {
  tests: TestExecution[];
  total: number;
  hasMore: boolean;
}

/** Dashboard configuration */
export interface DashboardConfig {
  port: number;
  host: string;
  maxConnections: number;
  enableCors: boolean;
  historyRetention: number; // days
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  port: 3001,
  host: "localhost",
  maxConnections: 100,
  enableCors: true,
  historyRetention: 30,
};
