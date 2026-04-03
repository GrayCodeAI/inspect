// @inspect/a11y — Accessibility auditing
// Split from @inspect/quality to follow Single Responsibility Principle

export { AccessibilityAuditor, type A11yAuditOptions } from "./a11y/auditor.js";
export {
  A11Y_RULES,
  ALL_A11Y_RULES,
  getRulesByTag,
  getRulesByImpact,
  getRulesByCategory,
  getRuleById,
  type A11yRuleDefinition,
} from "./a11y/rules.js";
export {
  SitemapAuditor,
  type SitemapAuditOptions,
  type SitemapAuditResult,
} from "./a11y/sitemap.js";
export {
  CustomA11yRuleEngine,
  type CustomA11yRule,
  type CustomA11yViolation,
  BUILTIN_CUSTOM_A11Y_RULES,
} from "./custom-rules.js";
