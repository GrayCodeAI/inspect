// Agent system barrel exports
// ============================================================================

// --- Core types ---
export * from "./types.js";

// --- Orchestrator (main entry point) ---
export { runFullTest, runQuickTest, runMultiPageTest } from "./orchestrator.js";
export type { OrchestratorOptions } from "./orchestrator.js";

// --- Tier 1: Discovery ---
export { crawlSite } from "./crawler.js";
export { analyzeSite } from "./analyzer.js";

// --- Tier 2: Execution ---
export { planTests, detectPageType, generateTestData } from "./planner.js";
export { executeStep } from "./tester.js";
export { validateStep, createNetworkMonitor, createConsoleMonitor, trackUrlChanges } from "./validator.js";
export { navigateTo, handlePopups, dismissCookieConsent, handleAlertDialogs, waitForPageReady, detectRedirectLoop } from "./navigator.js";
export { fillForm, detectForms, testFormValidation } from "./form-filler.js";

// --- Tier 3: Quality ---
export { checkAccessibility } from "./accessibility.js";
export { runSecurityAudit, checkSecurityHeaders, checkHttps, auditCookies, testXss, scanExposedData } from "./security-agent.js";
export { runPerformanceAudit, measureCoreWebVitals, analyzeResources, captureJsErrors, monitorApiCalls, detectMixedContent } from "./performance-agent.js";
export { runResponsiveAudit, testViewport, checkHorizontalOverflow, checkTouchTargets, checkFontReadability, checkImageScaling, checkStickyElements, testMobileMenu } from "./responsive.js";
export { runSEOAudit, auditMetaTags, auditRobotsTxt, auditSitemap, auditStructuredData, auditCanonicals } from "./seo.js";

// --- Reporter ---
export { generateReport, generateGitHubAnnotations } from "./reporter.js";
export type { ReportOptions } from "./reporter.js";

// --- Utilities ---
export { withCache, withRetry, clearCache } from "./cache.js";
export { safeEvaluate, safeEvaluateVoid } from "./evaluate.js";
