// @inspect/supervisor — Test orchestration services
// Per .specs/supervisor-refactor.md

// Domain models
export {
  StepId,
  PlanId,
  TestPlanStepStatus,
  TestPlanStep,
  TestPlan,
  TestPlanDraft,
  ExecutedTestPlan,
  TestReportStep,
  TestReport,
  GitScope,
  WorkingTree,
  Branch,
  Commit,
  PullRequest,
  AgentProvider,
  BranchFilter,
  gitScopeDisplayName,
} from "@inspect/shared";

// Update content variants
export {
  UpdateContent,
  RunStarted,
  StepStarted,
  StepCompleted,
  StepFailed,
  ToolCall,
  ToolResult,
  AgentThinking,
  RunCompleted,
} from "@inspect/shared";

export type { ExecutionEvent } from "@inspect/shared";

// Services (re-exported from orchestrator)
export {
  Updates,
  SCREENSHOT_TOOL_NAMES,
  Planner,
  PlanningError,
  SupervisorExecutor,
  ExecutionError,
  Reporter,
  ReporterError,
} from "@inspect/orchestrator";
