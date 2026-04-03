// @inspect/lighthouse-quality — Performance auditing
// Split from @inspect/quality to follow Single Responsibility Principle

export {
  LighthouseAuditor,
  type LighthouseOptions,
  type LighthouseBudget,
} from "./lighthouse/auditor.js";
export {
  BudgetManager,
  BUDGET_PRESETS,
  type BudgetThreshold,
  type BudgetAssertionResult,
  type BudgetCheckResult,
} from "./lighthouse/budgets.js";
export { ScoreHistory, type ScoreEntry, type ScoreTrend } from "./lighthouse/history.js";
export {
  CustomAuditRunner,
  type CustomAudit,
  type CustomAuditResult,
  BUILTIN_CUSTOM_AUDITS,
} from "./custom-audits.js";
