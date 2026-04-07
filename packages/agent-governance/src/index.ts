// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent-governance - Agent governance and guardrails
// ──────────────────────────────────────────────────────────────────────────────

// Guardrails
export {
  GuardrailsFramework,
  createGuardrails,
  DEFAULT_GUARDRAILS_CONFIG,
  type GuardrailsConfig,
  type RiskyPattern,
  type ContentFilter,
  type Violation,
  type ViolationType,
  type ViolationAction,
  type InterventionContext,
  type ActionRequest,
  type GuardrailsDecision,
  type SessionStats,
} from "./guardrails/framework.js";

// Governance
export { PermissionManager, type AgentPermissions } from "./governance/permissions.js";
export { AutonomyManager, type AutonomyConfig, AutonomyLevel } from "./governance/autonomy.js";
export {
  AuditTrail,
  type AuditEntry,
  type AuditFilter,
  type ComplianceReport,
  type AuditAction,
  type ToolCall,
  type TokenUsage,
} from "./governance/audit-trail.js";
