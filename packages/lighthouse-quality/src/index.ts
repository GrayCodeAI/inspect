// ──────────────────────────────────────────────────────────────────────────────
// @inspect/lighthouse-quality - Lighthouse auditing
// ──────────────────────────────────────────────────────────────────────────────

export { LighthouseAuditor } from "./lighthouse/auditor.js";
export type { LighthouseOptions, LighthouseBudget } from "./lighthouse/auditor.js";
export { BudgetManager, BUDGET_PRESETS } from "./lighthouse/budgets.js";
export type { BudgetThreshold, BudgetAssertionResult, BudgetCheckResult } from "./lighthouse/budgets.js";
export { ScoreHistory } from "./lighthouse/history.js";
export type { ScoreEntry, ScoreTrend } from "./lighthouse/history.js";
export {
  CustomAuditRunner,
  BUILTIN_CUSTOM_AUDITS,
  formSubmissionLatencyAudit,
  animationSmoothnessAudit,
  memoryLeakDetectionAudit,
} from "./custom-audits.js";
export type { CustomAudit, CustomAuditResult } from "./custom-audits.js";
