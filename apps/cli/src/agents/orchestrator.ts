import type {
  TestPlan, TestStep, A11yReport, TestReport, ProgressCallback, LLMCall,
  SecurityReport, PerformanceReport, ResponsiveReport, SEOReport,
  SiteMap, FormTestResult, SiteAnalysis,
} from "./types.js";
import { planTests, generateTestData } from "./planner.js";
import { executeStep } from "./tester.js";
import { validateStep, createNetworkMonitor, createConsoleMonitor, trackUrlChanges } from "./validator.js";
import { checkAccessibility } from "./accessibility.js";
import { generateReport } from "./reporter.js";
import { withCache, withRetry } from "./cache.js";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface OrchestratorOptions {
  url: string;
  headed?: boolean;
  /** Max test steps to execute (default: 25) */
  maxSteps?: number;
  /** Max pages to crawl in discovery (default: 20) */
  maxPages?: number;
  llm: LLMCall;
  onProgress: ProgressCallback;
  /** Which quality tiers to run */
  tiers?: {
    discovery?: boolean;
    execution?: boolean;
    accessibility?: boolean;
    security?: boolean;
    performance?: boolean;
    responsive?: boolean;
    seo?: boolean;
  };
  /** Viewport for testing */
  viewport?: { width: number; height: number };
  /** Skip quality checks (fast mode) */
  fast?: boolean;
  /** Enable LLM response caching (default: true) */
  cache?: boolean;
  /** Max token budget (estimated). Test aborts if exceeded. 0 = unlimited */
  tokenBudget?: number;
}

// ---------------------------------------------------------------------------
// Main orchestrator — 3-tier pipeline
// ---------------------------------------------------------------------------

export async function runFullTest(options: OrchestratorOptions): Promise<TestReport> {
  const {
    url, headed = true, maxSteps = 25, llm, onProgress,
    viewport = { width: 1440, height: 900 },
    fast = false,
  } = options;

  const tiers = {
    discovery: options.tiers?.discovery ?? true,
    execution: options.tiers?.execution ?? true,
    accessibility: options.tiers?.accessibility ?? !fast,
    security: options.tiers?.security ?? !fast,
    performance: options.tiers?.performance ?? !fast,
    responsive: options.tiers?.responsive ?? !fast,
    seo: options.tiers?.seo ?? !fast,
  };

  const startTime = Date.now();
  const screenshots: string[] = [];
  const a11yReports: A11yReport[] = [];
  let securityReport: SecurityReport | undefined;
  let performanceReports: PerformanceReport[] | undefined;
  let responsiveReport: ResponsiveReport | undefined;
  let seoReport: SEOReport | undefined;
  let siteMap: SiteMap | undefined;
  let formResults: FormTestResult[] | undefined;
  let tokenUsage = 0;

  // Wrap LLM with retry + optional cache
  const retriedLlm = withRetry(llm, { maxRetries: 3, baseDelay: 1000 });
  const baseLlm = options.cache !== false ? withCache(retriedLlm) : retriedLlm;

  const tokenBudget = options.tokenBudget ?? 0;

  // Track LLM token usage with budget enforcement
  const trackedLlm: LLMCall = async (messages) => {
    // Budget check before calling LLM
    if (tokenBudget > 0 && tokenUsage > tokenBudget) {
      throw new Error(`Token budget exceeded (${tokenUsage.toLocaleString()} / ${tokenBudget.toLocaleString()}). Use --token-budget to increase.`);
    }

    const inputTokens = messages.reduce((sum, m) => sum + m.content.length / 4, 0);

    // Pre-flight estimate: warn if this call alone will be expensive
    if (tokenBudget > 0 && tokenUsage + inputTokens > tokenBudget * 0.9) {
      onProgress("warn", `Token usage at ${Math.round((tokenUsage / tokenBudget) * 100)}% of budget`);
    }

    const response = await baseLlm(messages);
    tokenUsage += Math.round(inputTokens + response.length / 4);
    return response;
  };

  // Print cost estimate upfront
  if (tokenBudget > 0) {
    onProgress("info", `Token budget: ${tokenBudget.toLocaleString()} (~$${(tokenBudget * 0.000003).toFixed(2)})`);
  }

  // 1. Launch browser
  onProgress("info", `Launching ${headed ? "headed" : "headless"} browser...`);
  const { BrowserManager } = await import("@inspect/browser");
  const browserMgr = new BrowserManager();
  await browserMgr.launchBrowser({
    headless: !headed,
    viewport,
  } as any);
  const page = await browserMgr.newPage();

  // Set up screenshot directory
  const screenshotDir = join(process.cwd(), ".inspect", "screenshots");
  if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });

  try {
    // =========================================================================
    // TIER 1: DISCOVERY — understand the website
    // =========================================================================
    onProgress("info", "");
    onProgress("info", "═══ TIER 1: DISCOVERY ═══════════════════════");

    // Navigate to initial URL
    onProgress("info", `Navigating to ${url}...`);

    // Set up navigation handling
    try {
      const { handleAlertDialogs } = await import("./navigator.js");
      await handleAlertDialogs(page);
    } catch { /* navigator not available */ }

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const title = await page.title();
    onProgress("pass", `Page loaded: ${title}`);

    // Handle popups and cookie consent
    try {
      const { handlePopups, dismissCookieConsent } = await import("./navigator.js");
      const handled = await handlePopups(page);
      if (handled.length > 0) onProgress("info", `Dismissed ${handled.length} popup(s)`);
      const consent = await dismissCookieConsent(page);
      if (consent) onProgress("info", "Dismissed cookie consent");
    } catch { /* navigator not available */ }

    // Initial screenshot
    const initialScreenshot = join(screenshotDir, `initial-${Date.now()}.png`);
    await page.screenshot({ path: initialScreenshot });
    screenshots.push(initialScreenshot);

    // ARIA snapshot
    onProgress("info", "Taking page snapshot...");
    const { AriaSnapshotBuilder } = await import("@inspect/browser");
    const snapshotBuilder = new AriaSnapshotBuilder();
    await snapshotBuilder.buildTree(page);
    let snapshotText = snapshotBuilder.getFormattedTree();
    const stats = snapshotBuilder.getStats();
    onProgress("info", `Snapshot: ${stats.refCount} elements, ~${stats.tokenEstimate} tokens`);

    // Site crawl (if discovery enabled and not in fast mode)
    if (tiers.discovery && !fast) {
      try {
        const { crawlSite } = await import("./crawler.js");
        onProgress("info", "Crawling site...");
        siteMap = await crawlSite(url, page, onProgress, {
          maxPages: options.maxPages ?? 20,
          maxDepth: 3,
        });
        onProgress("pass", `Crawled ${siteMap.pages.length} pages, found ${siteMap.brokenLinks.length} broken links`);

        // Navigate back to initial URL after crawl
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        // Re-snapshot
        const recoverBuilder = new AriaSnapshotBuilder();
        await recoverBuilder.buildTree(page);
        snapshotText = recoverBuilder.getFormattedTree();
      } catch (err: any) {
        onProgress("warn", `Crawl skipped: ${err.message}`);
      }
    }

    // Site analysis
    let siteAnalysis: SiteAnalysis | undefined;
    if (tiers.discovery && siteMap && !fast) {
      try {
        const { analyzeSite } = await import("./analyzer.js");
        onProgress("info", "Analyzing site features...");
        siteAnalysis = await analyzeSite(siteMap, page, trackedLlm, onProgress);
        onProgress("pass", `Found ${siteAnalysis.features.authFlows.length} auth flows, ${siteAnalysis.features.formPages.length} forms, ${siteAnalysis.techStack.length} tech stack items`);
      } catch (err: any) {
        onProgress("warn", `Analysis skipped: ${err.message}`);
      }
    }

    // =========================================================================
    // TIER 2: EXECUTION — interact with the website
    // =========================================================================
    onProgress("info", "");
    onProgress("info", "═══ TIER 2: EXECUTION ═══════════════════════");

    // PLANNER — create test plan
    const plan = await planTests(url, snapshotText, title, trackedLlm, onProgress);

    onProgress("info", "");
    onProgress("info", `Starting ${plan.steps.length} test steps...`);
    onProgress("info", "");

    // Set up monitoring
    const networkMonitor = createNetworkMonitor(page);
    const consoleMonitor = createConsoleMonitor(page);
    networkMonitor.start();
    consoleMonitor.start();
    const urlTracker = trackUrlChanges(page);

    // TESTER + VALIDATOR loop
    const results: TestStep[] = [];
    const stepsToRun = plan.steps.slice(0, maxSteps);
    let consecutiveFailures = 0;

    for (let i = 0; i < stepsToRun.length; i++) {
      const step = stepsToRun[i];
      const beforeSnapshot = snapshotText;
      const beforeUrl = page.url();

      // Clear monitoring state for this step
      networkMonitor.failures.length = 0;
      const prevConsoleErrors = [...consoleMonitor.errors];

      // TESTER — execute the step
      step.status = "running";
      const result = await executeStep(step, page, snapshotText, trackedLlm, onProgress);
      results.push(result);

      // Wait for page to settle
      await page.waitForTimeout(500);

      // Re-snapshot after action
      try {
        const newBuilder = new AriaSnapshotBuilder();
        await newBuilder.buildTree(page);
        snapshotText = newBuilder.getFormattedTree();
      } catch {
        // Page might be navigating, keep old snapshot
      }

      // New console errors since this step started
      const newConsoleErrors = consoleMonitor.errors.filter(e => !prevConsoleErrors.includes(e));

      // VALIDATOR — check if action succeeded
      if (result.status === "pass" && step.assertion) {
        await validateStep(result, beforeSnapshot, snapshotText, trackedLlm, onProgress, {
          networkMonitor,
          consoleErrors: newConsoleErrors,
          beforeUrl,
          afterUrl: page.url(),
          page,
        });
      }

      // Take screenshot after each step
      try {
        const stepScreenshot = join(screenshotDir, `step-${step.id}-${Date.now()}.png`);
        await page.screenshot({ path: stepScreenshot });
        screenshots.push(stepScreenshot);
        result.screenshot = stepScreenshot;
      } catch {}

      // Track consecutive failures for early exit
      if (result.status === "fail") {
        consecutiveFailures++;
        if (consecutiveFailures >= 5) {
          onProgress("warn", "5 consecutive failures — skipping remaining steps");
          for (let j = i + 1; j < stepsToRun.length; j++) {
            stepsToRun[j].status = "skip";
            stepsToRun[j].error = "Skipped due to consecutive failures";
            results.push(stepsToRun[j]);
          }
          break;
        }
      } else {
        consecutiveFailures = 0;
      }
    }

    // Stop monitoring
    networkMonitor.stop();
    consoleMonitor.stop();

    // Form testing
    if (tiers.execution && !fast) {
      try {
        const { detectForms, testFormValidation } = await import("./form-filler.js");
        const forms = await detectForms(page);
        if (forms.length > 0) {
          onProgress("info", `Found ${forms.length} form(s), testing validation...`);
          formResults = [];
          for (const form of forms.slice(0, 3)) {
            const fResults = await testFormValidation(page, form, trackedLlm, onProgress);
            formResults.push(...fResults);
          }
        }
      } catch (err: any) {
        onProgress("warn", `Form testing skipped: ${err.message}`);
      }
    }

    // =========================================================================
    // TIER 3: QUALITY — measure everything (run in parallel where possible)
    // =========================================================================
    onProgress("info", "");
    onProgress("info", "═══ TIER 3: QUALITY ═════════════════════════");

    // Run accessibility + security + SEO in parallel (they read-only the current page)
    const parallelQuality: Array<Promise<void>> = [];

    if (tiers.accessibility) {
      parallelQuality.push((async () => {
        try {
          onProgress("info", "Running accessibility audit...");
          const a11yReport = await checkAccessibility(page, page.url(), onProgress);
          a11yReports.push(a11yReport);
        } catch (err: any) {
          onProgress("warn", `Accessibility audit skipped: ${err.message}`);
        }
      })());
    }

    if (tiers.security) {
      parallelQuality.push((async () => {
        try {
          const { runSecurityAudit } = await import("./security-agent.js");
          onProgress("info", "Running security audit...");
          securityReport = await runSecurityAudit(page, url, onProgress);
          onProgress("pass", `Security: ${securityReport.score}/100 (${securityReport.issues.length} issues)`);
        } catch (err: any) {
          onProgress("warn", `Security audit skipped: ${err.message}`);
        }
      })());
    }

    if (tiers.seo) {
      parallelQuality.push((async () => {
        try {
          const { runSEOAudit } = await import("./seo.js");
          onProgress("info", "Running SEO audit...");
          seoReport = await runSEOAudit(page, url, onProgress);
          onProgress("pass", `SEO: ${seoReport.score}/100 (${seoReport.issues.length} issues)`);
        } catch (err: any) {
          onProgress("warn", `SEO audit skipped: ${err.message}`);
        }
      })());
    }

    await Promise.all(parallelQuality);

    // Performance needs a fresh navigation for accurate timing — run after parallel checks
    if (tiers.performance) {
      try {
        const { runPerformanceAudit } = await import("./performance-agent.js");
        onProgress("info", "Running performance audit...");
        const perfReport = await runPerformanceAudit(page, url, onProgress);
        performanceReports = [perfReport];
        onProgress("pass", `Performance: ${perfReport.score}/100 (LCP: ${perfReport.metrics.lcp}ms, CLS: ${perfReport.metrics.cls.toFixed(3)})`);
      } catch (err: any) {
        onProgress("warn", `Performance audit skipped: ${err.message}`);
      }
    }

    // Responsive runs last — it changes viewport size
    if (tiers.responsive) {
      try {
        const { runResponsiveAudit } = await import("./responsive.js");
        onProgress("info", "Running responsive audit...");
        responsiveReport = await runResponsiveAudit(page, url, onProgress);
        onProgress("pass", `Responsive: ${responsiveReport.score}/100 across ${responsiveReport.viewports.length} viewports`);
      } catch (err: any) {
        onProgress("warn", `Responsive audit skipped: ${err.message}`);
      }
    }

    // =========================================================================
    // REPORT — generate final report
    // =========================================================================
    onProgress("info", "");
    const report = generateReport(plan, results, a11yReports, screenshots, startTime, onProgress, {
      security: securityReport,
      performance: performanceReports,
      responsive: responsiveReport,
      seo: seoReport,
      siteMap,
      formResults,
      tokenUsage,
    });

    await browserMgr.closeBrowser();
    return report;

  } catch (err: any) {
    onProgress("fail", `Test failed: ${err.message}`);
    await browserMgr.closeBrowser();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Quick test — just execution tier, no quality checks
// ---------------------------------------------------------------------------

export async function runQuickTest(options: Omit<OrchestratorOptions, "tiers">): Promise<TestReport> {
  return runFullTest({
    ...options,
    fast: true,
    tiers: {
      discovery: false,
      execution: true,
      accessibility: false,
      security: false,
      performance: false,
      responsive: false,
      seo: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Multi-page test — crawl and test each page
// ---------------------------------------------------------------------------

export async function runMultiPageTest(options: OrchestratorOptions): Promise<TestReport> {
  return runFullTest({
    ...options,
    tiers: {
      discovery: true,
      execution: true,
      accessibility: true,
      security: true,
      performance: true,
      responsive: true,
      seo: true,
    },
  });
}
