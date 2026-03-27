// Agent system barrel exports
// ============================================================================

// --- Core types ---
export * from "./types.js";

// --- Orchestrator (main entry point) ---
export { runFullTest, runQuickTest, runMultiPageTest } from "./orchestrator.js";
export type { OrchestratorOptions } from "./orchestrator.js";

// --- Discovery ---
export { crawlSite } from "./crawler.js";
export { analyzeSite } from "./analyzer.js";
export { discoverSPARoutes, waitForHydration, pierceShadowDOM, handleVirtualScroll, detectFramework, waitForSPANavigation, testBackForward } from "./spa.js";

// --- Execution ---
export { planTests, detectPageType, generateTestData } from "./planner.js";
export { executeStep } from "./tester.js";
export { validateStep, createNetworkMonitor, createConsoleMonitor, trackUrlChanges } from "./validator.js";
export { navigateTo, handlePopups, dismissCookieConsent, handleAlertDialogs, waitForPageReady, detectRedirectLoop } from "./navigator.js";
export { fillForm, detectForms, testFormValidation } from "./form-filler.js";

// --- Authentication & Sessions ---
export { injectCookies, injectStorage, saveSession, loadSession, detectAuthState, detectCaptcha, generateTOTP, testMultiRole } from "./auth.js";

// --- Quality: Accessibility ---
export { checkAccessibility } from "./accessibility.js";

// --- Quality: Security ---
export { runSecurityAudit, checkSecurityHeaders, checkHttps, auditCookies, testXss, scanExposedData } from "./security-agent.js";
export { testCSRF, testSQLInjection, testClickjacking, testCORSConfig, testPathTraversal, testInfoDisclosure, scanDependencies, runAdvancedSecurityAudit } from "./advanced-security.js";

// --- Quality: Performance ---
export { runPerformanceAudit, measureCoreWebVitals, analyzeResources, captureJsErrors, monitorApiCalls, detectMixedContent } from "./performance-agent.js";
export { runLoadTest, detectMemoryLeak, stressTest, testWithThrottling, testServiceWorker } from "./load-testing.js";

// --- Quality: Visual ---
export { runResponsiveAudit, testViewport, checkHorizontalOverflow, checkTouchTargets, checkFontReadability, checkImageScaling, checkStickyElements, testMobileMenu } from "./responsive.js";
export { captureBaseline, compareScreenshot, freezeAnimations, maskDynamicContent, updateBaseline, runVisualRegression } from "./visual-regression.js";
export type { VisualDiff, VisualRegressionReport } from "./visual-regression.js";

// --- Quality: SEO ---
export { runSEOAudit, auditMetaTags, auditRobotsTxt, auditSitemap, auditStructuredData, auditCanonicals } from "./seo.js";

// --- Quality: Cross-Browser & i18n ---
export { runCrossBrowser, testLocale, testRTL, testTimezone } from "./cross-browser.js";

// --- API & Network Testing ---
export { createNetworkLogger, createWebSocketLogger, validateResponseSchema, discoverAPIEndpoints, mockAPIResponse, simulateNetworkError, testCORS, runAPIAudit } from "./api-testing.js";

// --- Application Logic Testing ---
export { testBehavior, testCRUD, testDragDrop, testNotifications, testDataPersistence, testConditionalUI, testUndoRedo, testGameLogic } from "./logic-testing.js";

// --- Reporter ---
export { generateReport, generateGitHubAnnotations } from "./reporter.js";
export type { ReportOptions } from "./reporter.js";

// --- CI/CD Integration ---
export { generateGitHubActionsYAML, generateGitLabCIYAML, evaluateQualityGates, generatePRComment, generateSlackPayload, generateBadgeSVG, saveTrendEntry, loadTrend } from "./ci-integration.js";

// --- Advanced Capabilities ---
export { testPDFDownload, checkEmailReceived, createScheduleConfig, generateCronExpression, selfHealSelector, selfHealPlan } from "./advanced.js";

// --- AI Failure Analysis ---
export { analyzeFailures, classifyFailure } from "./failure-analysis.js";
export type { FailureAnalysis, AnalysisReport } from "./failure-analysis.js";

// --- Record & Playback ---
export { startRecording, actionsToTestSteps, actionsToYAML, recordSession } from "./recorder.js";

// --- Flake Detection ---
export { recordResults, getFlakeReport, isFlaky, getStepHistory, clearHistory } from "./flake-detection.js";

// --- Smart Dynamic Masking ---
export { detectDynamicContent, applySmartMasks, learnMasks } from "./smart-masking.js";

// --- Synthetic Monitoring ---
export { startMonitor, saveMonitorResult, loadMonitorHistory, detectRegression, sendAlert, generateMonitorHTML } from "./monitoring.js";

// --- API Security Scanning ---
export { fetchOpenAPISpec, testGraphQLIntrospection, scanOpenAPIEndpoints, scanGraphQLSecurity, runAPIScan } from "./api-scanning.js";

// --- Utilities ---
export { withCache, withRetry, clearCache } from "./cache.js";
export { safeEvaluate, safeEvaluateVoid } from "./evaluate.js";
