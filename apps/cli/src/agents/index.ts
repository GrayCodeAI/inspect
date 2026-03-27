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

// --- PLAN-200: SPA & Modern Framework Support ---
export { discoverSPARoutes, waitForHydration, pierceShadowDOM, handleVirtualScroll, detectFramework, waitForSPANavigation, testBackForward } from "./spa.js";

// --- PLAN-200: Authentication & Session Management ---
export { injectCookies, injectStorage, saveSession, loadSession, detectAuthState, detectCaptcha, generateTOTP, testMultiRole } from "./auth.js";

// --- PLAN-200: Visual Regression Testing ---
export { captureBaseline, compareScreenshot, freezeAnimations, maskDynamicContent, updateBaseline, runVisualRegression } from "./visual-regression.js";
export type { VisualDiff, VisualRegressionReport } from "./visual-regression.js";

// --- PLAN-200: API & Network Testing ---
export { createNetworkLogger, createWebSocketLogger, validateResponseSchema, discoverAPIEndpoints, mockAPIResponse, simulateNetworkError, testCORS, runAPIAudit } from "./api-testing.js";

// --- PLAN-200: Application Logic Testing ---
export { testBehavior, testCRUD, testDragDrop, testNotifications, testDataPersistence, testConditionalUI, testUndoRedo, testGameLogic } from "./logic-testing.js";

// --- PLAN-200: Cross-Browser & i18n ---
export { runCrossBrowser, testLocale, testRTL, testTimezone } from "./cross-browser.js";

// --- PLAN-200: Load & Stress Testing ---
export { runLoadTest, detectMemoryLeak, stressTest, testWithThrottling, testServiceWorker } from "./load-testing.js";

// --- PLAN-200: Advanced Security ---
export { testCSRF, testSQLInjection, testClickjacking, testCORSConfig, testPathTraversal, testInfoDisclosure, scanDependencies, runAdvancedSecurityAudit } from "./advanced-security.js";

// --- PLAN-200: CI/CD & Reporting ---
export { generateGitHubActionsYAML, generateGitLabCIYAML, evaluateQualityGates, generatePRComment, generateSlackPayload, generateBadgeSVG, saveTrendEntry, loadTrend } from "./ci-integration.js";

// --- PLAN-200: Advanced Capabilities ---
export { testPDFDownload, checkEmailReceived, createScheduleConfig, generateCronExpression, selfHealSelector, selfHealPlan } from "./advanced.js";

// --- Utilities ---
export { withCache, withRetry, clearCache } from "./cache.js";
export { safeEvaluate, safeEvaluateVoid } from "./evaluate.js";
