import type {
  TestPlan, TestStep, A11yReport, TestReport, ProgressCallback, LLMCall,
  SecurityReport, PerformanceReport, ResponsiveReport, SEOReport,
  SiteMap, FormTestResult, SiteAnalysis,
} from "./types.js";
import { planTests, generateTestData } from "./planner.js";
import { executeStep } from "./tester.js";
import { validateStep, createNetworkMonitor, createConsoleMonitor, trackUrlChanges } from "./validator.js";
import { runAgentLoop } from "./agent-loop.js";
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
  /** Which tiers/agents to run */
  tiers?: {
    discovery?: boolean;
    execution?: boolean;
    accessibility?: boolean;
    security?: boolean;
    advancedSecurity?: boolean;
    performance?: boolean;
    responsive?: boolean;
    seo?: boolean;
    spa?: boolean;
    visualRegression?: boolean;
    apiTesting?: boolean;
    logicTesting?: boolean;
    crossBrowser?: boolean;
    loadTesting?: boolean;
  };
  /** Pre-authenticated cookies to inject before testing */
  cookies?: Array<{ name: string; value: string; domain: string; path?: string }>;
  /** Pre-authenticated storage to inject */
  storage?: { localStorage?: Record<string, string>; sessionStorage?: Record<string, string> };
  /** Visual regression baseline directory */
  baselineDir?: string;
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
    advancedSecurity: options.tiers?.advancedSecurity ?? false,
    performance: options.tiers?.performance ?? !fast,
    responsive: options.tiers?.responsive ?? !fast,
    seo: options.tiers?.seo ?? !fast,
    spa: options.tiers?.spa ?? true,
    visualRegression: options.tiers?.visualRegression ?? false,
    apiTesting: options.tiers?.apiTesting ?? false,
    logicTesting: options.tiers?.logicTesting ?? false,
    crossBrowser: options.tiers?.crossBrowser ?? false,
    loadTesting: options.tiers?.loadTesting ?? false,
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
  let discoveredSPARoutes: string[] = [];

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
    // PRE-FLIGHT: Auth injection (if credentials provided)
    // =========================================================================
    if (options.cookies || options.storage) {
      try {
        const { injectCookies, injectStorage } = await import("./auth.js");
        if (options.cookies) {
          await injectCookies(page, options.cookies);
          onProgress("info", `Injected ${options.cookies.length} cookie(s) for auth`);
        }
        if (options.storage) {
          // Navigate first so storage can be set on the right origin
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
          await injectStorage(page, options.storage);
          onProgress("info", "Injected storage tokens for auth");
        }
      } catch (err: unknown) {
        onProgress("warn", `Auth injection failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

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
      } catch (err: unknown) {
        onProgress("warn", `Crawl skipped: ${err instanceof Error ? err.message : String(err)}`);
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
      } catch (err: unknown) {
        onProgress("warn", `Analysis skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // SPA detection & hydration
    if (tiers.spa !== false) {
      try {
        const { detectFramework, waitForHydration, discoverSPARoutes } = await import("./spa.js");
        const framework = await detectFramework(page);
        if (framework) {
          onProgress("info", `SPA detected: ${framework}`);
          await waitForHydration(page, 5000);
          onProgress("pass", "Framework hydration complete");

          if (tiers.discovery) {
            const spaRoutes = await discoverSPARoutes(page, url);
            if (spaRoutes.length > 0) {
              discoveredSPARoutes = spaRoutes;
              onProgress("info", `Discovered ${spaRoutes.length} SPA route(s)`);
            }
          }

          // Re-navigate and re-snapshot after SPA discovery
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
          try {
            const rebuildSnap = new AriaSnapshotBuilder();
            await rebuildSnap.buildTree(page);
            snapshotText = rebuildSnap.getFormattedTree();
          } catch {}
        }
      } catch (err: unknown) {
        onProgress("warn", `SPA detection skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // =========================================================================
    // TIER 2: EXECUTION — AI agent explores and tests the website
    // =========================================================================
    onProgress("info", "");
    onProgress("info", "═══ TIER 2: EXECUTION ═══════════════════════");

    // Set up monitoring
    const networkMonitor = createNetworkMonitor(page);
    const consoleMonitor = createConsoleMonitor(page);
    networkMonitor.start();
    consoleMonitor.start();
    const urlTracker = trackUrlChanges(page);

    // Run the autonomous agent loop — LLM decides each action in real-time
    onProgress("info", "Agent starting autonomous exploration...");
    onProgress("info", "");

    const agentResult = await runAgentLoop({
      page,
      url,
      snapshot: snapshotText,
      title,
      llm: trackedLlm,
      onProgress,
      maxSteps,
      spaRoutes: discoveredSPARoutes,
      executeStep,
      validateStep,
      screenshotDir,
      AriaSnapshotBuilder,
      networkMonitor,
      consoleMonitor,
    });

    const plan = agentResult.plan;
    const results = agentResult.steps;

    // Update snapshot to whatever the agent left the page on
    try {
      const finalBuilder = new AriaSnapshotBuilder();
      await finalBuilder.buildTree(page);
      snapshotText = finalBuilder.getFormattedTree();
    } catch {}

    // Collect screenshots from results
    for (const r of results) {
      if (r.screenshot) screenshots.push(r.screenshot);
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
      } catch (err: unknown) {
        onProgress("warn", `Form testing skipped: ${err instanceof Error ? err.message : String(err)}`);
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
        } catch (err: unknown) {
          onProgress("warn", `Accessibility audit skipped: ${err instanceof Error ? err.message : String(err)}`);
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
        } catch (err: unknown) {
          onProgress("warn", `Security audit skipped: ${err instanceof Error ? err.message : String(err)}`);
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
        } catch (err: unknown) {
          onProgress("warn", `SEO audit skipped: ${err instanceof Error ? err.message : String(err)}`);
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
      } catch (err: unknown) {
        onProgress("warn", `Performance audit skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Advanced security (CSRF, SQL injection, clickjacking, etc.)
    if (tiers.advancedSecurity) {
      try {
        const { runAdvancedSecurityAudit } = await import("./advanced-security.js");
        onProgress("info", "Running advanced security audit...");
        const advSecResults = await runAdvancedSecurityAudit(page, url, onProgress);
        const advSecFailed = advSecResults.filter(r => !r.passed).length;
        onProgress("pass", `Advanced security: ${advSecResults.length} tests, ${advSecFailed} failed`);
      } catch (err: unknown) {
        onProgress("warn", `Advanced security skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Visual regression
    if (tiers.visualRegression) {
      try {
        const { runVisualRegression } = await import("./visual-regression.js");
        const baselineDir = options.baselineDir ?? join(process.cwd(), ".inspect", "baselines");
        onProgress("info", "Running visual regression...");
        const vrReports = await runVisualRegression(
          page, [url],
          [{ width: 1440, height: 900, label: "Desktop" }, { width: 375, height: 667, label: "Mobile" }],
          baselineDir, onProgress,
        );
        const totalDiffs = vrReports.reduce((s, r) => s + r.diffs.filter(d => !d.match).length, 0);
        onProgress("pass", `Visual regression: ${totalDiffs} diff(s) across ${vrReports.length} report(s)`);
      } catch (err: unknown) {
        onProgress("warn", `Visual regression skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // API testing
    if (tiers.apiTesting) {
      try {
        const { runAPIAudit } = await import("./api-testing.js");
        onProgress("info", "Running API audit...");
        const apiResult = await runAPIAudit(page, url, onProgress);
        onProgress("pass", `API: ${apiResult.endpoints} endpoints, avg ${Math.round(apiResult.avgResponseTime)}ms, ${apiResult.failures} failures`);
      } catch (err: unknown) {
        onProgress("warn", `API audit skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Responsive runs last — it changes viewport size
    if (tiers.responsive) {
      try {
        const { runResponsiveAudit } = await import("./responsive.js");
        onProgress("info", "Running responsive audit...");
        responsiveReport = await runResponsiveAudit(page, url, onProgress);
        onProgress("pass", `Responsive: ${responsiveReport.score}/100 across ${responsiveReport.viewports.length} viewports`);
      } catch (err: unknown) {
        onProgress("warn", `Responsive audit skipped: ${err instanceof Error ? err.message : String(err)}`);
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

    // AI failure analysis (if there are failures and LLM is available)
    if (report.summary.failed > 0) {
      try {
        const { analyzeFailures } = await import("./failure-analysis.js");
        onProgress("info", "");
        const analysis = await analyzeFailures(report, trackedLlm, onProgress);
        if (analysis.topIssues.length > 0) {
          onProgress("done", "");
          onProgress("done", "Top issues:");
          for (const issue of analysis.topIssues) {
            onProgress("warn", `  ${issue}`);
          }
        }
      } catch {
        // Failure analysis is non-critical
      }
    }

    // Record results for flake detection
    try {
      const { recordResults } = await import("./flake-detection.js");
      recordResults(report);
    } catch {
      // Non-critical
    }

    await browserMgr.closeBrowser();
    return report;

  } catch (err: unknown) {
    onProgress("fail", `Test failed: ${err instanceof Error ? err.message : String(err)}`);
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
      advancedSecurity: true,
      performance: true,
      responsive: true,
      seo: true,
      spa: true,
      visualRegression: true,
      apiTesting: true,
      logicTesting: false, // requires LLM — opt-in only
      crossBrowser: false, // requires playwright installed — opt-in only
      loadTesting: false, // resource-heavy — opt-in only
    },
  });
}
