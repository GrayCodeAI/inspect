// ============================================================================
// Cross-Browser & i18n Testing Agent — Tests across browsers and locales
// ============================================================================

import type { ProgressCallback } from "./types.js";
import { safeEvaluate } from "./evaluate.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BrowserType = "chromium" | "firefox" | "webkit";

export interface CrossBrowserResult {
  browser: BrowserType;
  url: string;
  passed: boolean;
  issues: string[];
  screenshot?: string;
}

export interface LocaleTestResult {
  locale: string;
  rtl: boolean;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Cross-browser testing
// ---------------------------------------------------------------------------

/**
 * Launch each browser type via Playwright, navigate to URL,
 * and check for rendering differences (title, element count, JS errors).
 */
export async function runCrossBrowser(
  url: string,
  browsers: BrowserType[],
  onProgress: ProgressCallback,
): Promise<CrossBrowserResult[]> {
  onProgress("info", "Running cross-browser compatibility tests...");

  // Dynamically import playwright to avoid hard dependency at module level
  let playwright: any;
  try {
    // @ts-expect-error — playwright is an optional peer dependency
    playwright = await import("playwright");
  } catch {
    onProgress("fail", "  Playwright is not installed. Cannot run cross-browser tests.");
    return browsers.map((browser) => ({
      browser,
      url,
      passed: false,
      issues: ["Playwright is not installed"],
    }));
  }

  const results: CrossBrowserResult[] = [];
  const baselineData: {
    title: string;
    elementCount: number;
    headings: string[];
  } | null = null;

  // Collect baseline from the first browser, then compare subsequent browsers
  let baseline: { title: string; elementCount: number; headings: string[] } | null = null;

  for (const browserType of browsers) {
    onProgress("step", `  Testing ${browserType}...`);
    const result: CrossBrowserResult = {
      browser: browserType,
      url,
      passed: true,
      issues: [],
    };

    let browser: any = null;
    let context: any = null;
    let page: any = null;

    try {
      // Launch the browser
      const launchFn = playwright[browserType];
      if (!launchFn) {
        result.passed = false;
        result.issues.push(`Browser type "${browserType}" is not available in Playwright`);
        results.push(result);
        continue;
      }

      browser = await launchFn.launch({ headless: true });
      context = await browser.newContext();
      page = await context.newPage();

      // Collect JS errors during navigation
      const jsErrors: string[] = [];
      page.on("pageerror", (error: Error) => {
        jsErrors.push(error.message);
      });

      // Navigate to URL
      const navStart = Date.now();
      try {
        await page.goto(url, { waitUntil: "load", timeout: 30_000 });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        result.passed = false;
        result.issues.push(`Navigation failed: ${message}`);
        results.push(result);
        continue;
      }
      const loadTime = Date.now() - navStart;

      // Wait briefly for dynamic content
      try {
        await page.waitForTimeout(2_000);
      } catch {
        // Non-fatal
      }

      // Gather page data
      const pageData = await safeEvaluate<{
        title: string;
        elementCount: number;
        headings: string[];
        hasViewportMeta: boolean;
        bodyText: string;
      }>(page, `
        (() => {
          const headings = Array.from(document.querySelectorAll("h1, h2, h3")).map(
            (h) => (h.textContent || "").trim().slice(0, 80)
          );
          const viewportMeta = document.querySelector('meta[name="viewport"]');
          return {
            title: document.title || "",
            elementCount: document.querySelectorAll("*").length,
            headings: headings.slice(0, 20),
            hasViewportMeta: !!viewportMeta,
            bodyText: (document.body.textContent || "").trim().slice(0, 200),
          };
        })()
      `, {
        title: "",
        elementCount: 0,
        headings: [],
        hasViewportMeta: false,
        bodyText: "",
      });

      // Record JS errors
      if (jsErrors.length > 0) {
        result.passed = false;
        for (const jsError of jsErrors.slice(0, 5)) {
          result.issues.push(`JS error: ${jsError.slice(0, 150)}`);
        }
      }

      // Check for blank page
      if (pageData.elementCount < 5) {
        result.passed = false;
        result.issues.push(`Page rendered very few elements (${pageData.elementCount}) — may be broken`);
      }

      // Check for empty title
      if (!pageData.title) {
        result.issues.push("Page has no title");
      }

      // Check for empty body
      if (!pageData.bodyText) {
        result.passed = false;
        result.issues.push("Page body is empty — content may not have rendered");
      }

      // Compare with baseline (first browser)
      if (baseline === null) {
        baseline = {
          title: pageData.title,
          elementCount: pageData.elementCount,
          headings: pageData.headings,
        };
      } else {
        // Title mismatch
        if (pageData.title !== baseline.title) {
          result.issues.push(
            `Title differs from ${browsers[0]}: "${pageData.title}" vs "${baseline.title}"`,
          );
        }

        // Large element count discrepancy (> 30% difference)
        const elementDiff = Math.abs(pageData.elementCount - baseline.elementCount);
        const elementThreshold = Math.max(baseline.elementCount * 0.3, 10);
        if (elementDiff > elementThreshold) {
          result.passed = false;
          result.issues.push(
            `Element count differs significantly from ${browsers[0]}: ${pageData.elementCount} vs ${baseline.elementCount} (diff: ${elementDiff})`,
          );
        }

        // Heading mismatch
        const baselineHeadingSet = new Set(baseline.headings);
        const missingHeadings = baseline.headings.filter(
          (h) => !pageData.headings.includes(h),
        );
        if (missingHeadings.length > 0) {
          result.issues.push(
            `Missing headings compared to ${browsers[0]}: ${missingHeadings.slice(0, 3).join(", ")}`,
          );
        }
      }

      // Check for slow load time
      if (loadTime > 10_000) {
        result.issues.push(`Slow page load: ${loadTime}ms`);
      }

      // Take screenshot
      try {
        const { join } = await import("node:path");
        const { existsSync, mkdirSync } = await import("node:fs");

        const screenshotDir = join(process.cwd(), ".inspect", "screenshots");
        if (!existsSync(screenshotDir)) {
          mkdirSync(screenshotDir, { recursive: true });
        }
        const timestamp = Date.now();
        const screenshotPath = join(
          screenshotDir,
          `cross-browser-${browserType}-${timestamp}.png`,
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshot = screenshotPath;
      } catch {
        // Screenshot failed, non-fatal
      }

      if (result.issues.length === 0) {
        onProgress("pass", `    ${browserType}: No issues found`);
      } else {
        const severity = result.passed ? "warn" : "fail";
        onProgress(severity, `    ${browserType}: ${result.issues.length} issue(s)`);
        for (const issue of result.issues.slice(0, 3)) {
          onProgress("warn", `      ${issue}`);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result.passed = false;
      result.issues.push(`Browser test failed: ${message}`);
      onProgress("fail", `    ${browserType}: ${message}`);
    } finally {
      try {
        if (context) await context.close();
        if (browser) await browser.close();
      } catch {
        // Cleanup failure, non-fatal
      }
    }

    results.push(result);
  }

  const passCount = results.filter((r) => r.passed).length;
  onProgress(
    passCount === results.length ? "pass" : "warn",
    `Cross-browser testing complete: ${passCount}/${results.length} browsers passed`,
  );
  onProgress("done", "Cross-browser tests finished.");

  return results;
}

// ---------------------------------------------------------------------------
// Locale / i18n testing
// ---------------------------------------------------------------------------

/**
 * Set browser locale via context options, navigate, and check if content
 * adapts to the locale (e.g. language attribute, text direction, number formats).
 */
export async function testLocale(
  page: any,
  locale: string,
  url: string,
): Promise<LocaleTestResult> {
  const issues: string[] = [];

  // Determine if this locale should be RTL
  const rtlLocales = new Set([
    "ar", "ar-SA", "ar-EG", "ar-AE",
    "he", "he-IL",
    "fa", "fa-IR",
    "ur", "ur-PK",
    "ps", // Pashto
    "sd", // Sindhi
    "yi", // Yiddish
  ]);
  const baseLocale = locale.split("-")[0].toLowerCase();
  const expectRTL = rtlLocales.has(locale) || rtlLocales.has(baseLocale);

  // Navigate to the URL (assumes context was already created with the locale)
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    issues.push(`Navigation failed for locale "${locale}": ${message}`);
    return { locale, rtl: expectRTL, issues };
  }

  // Wait for dynamic content
  try {
    await page.waitForTimeout(1_500);
  } catch {
    // Non-fatal
  }

  // Check page language and direction attributes
  const localeData = await safeEvaluate<{
    htmlLang: string;
    htmlDir: string;
    bodyDir: string;
    computedDirection: string;
    hasLangAttribute: boolean;
    contentLength: number;
    numberFormats: string[];
    dateFormats: string[];
  }>(page, `
    (() => {
      const html = document.documentElement;
      const body = document.body;
      const computedDir = window.getComputedStyle(body).direction;

      // Look for numbers in the page to check formatting
      const bodyText = (body.textContent || "").slice(0, 5000);
      const numberPatterns = bodyText.match(/\\d{1,3}([.,]\\d{3})+([.,]\\d{1,2})?/g) || [];
      const datePatterns = bodyText.match(
        /\\d{1,4}[\\/-]\\d{1,2}[\\/-]\\d{1,4}|\\d{1,2}\\s+\\w+\\s+\\d{4}/g
      ) || [];

      return {
        htmlLang: html.getAttribute("lang") || "",
        htmlDir: html.getAttribute("dir") || "",
        bodyDir: body.getAttribute("dir") || "",
        computedDirection: computedDir,
        hasLangAttribute: html.hasAttribute("lang"),
        contentLength: bodyText.length,
        numberFormats: numberPatterns.slice(0, 5),
        dateFormats: datePatterns.slice(0, 5),
      };
    })()
  `, {
    htmlLang: "",
    htmlDir: "",
    bodyDir: "",
    computedDirection: "ltr",
    hasLangAttribute: false,
    contentLength: 0,
    numberFormats: [],
    dateFormats: [],
  });

  // Check if lang attribute is set
  if (!localeData.hasLangAttribute) {
    issues.push("Missing lang attribute on <html> element");
  } else if (
    localeData.htmlLang &&
    !localeData.htmlLang.toLowerCase().startsWith(baseLocale)
  ) {
    // Lang attribute does not match the requested locale — may not support i18n
    issues.push(
      `Page lang attribute "${localeData.htmlLang}" does not match requested locale "${locale}"`,
    );
  }

  // Check RTL direction for RTL locales
  const actualRTL = localeData.computedDirection === "rtl" ||
    localeData.htmlDir === "rtl" ||
    localeData.bodyDir === "rtl";

  if (expectRTL && !actualRTL) {
    issues.push(
      `Expected RTL direction for locale "${locale}" but page renders LTR`,
    );
  }

  // Check for empty content
  if (localeData.contentLength < 50) {
    issues.push(
      `Page content is very short (${localeData.contentLength} chars) — locale may not be supported`,
    );
  }

  // Check for encoding issues (replacement characters)
  const encodingIssues = await safeEvaluate<number>(page, `
    (() => {
      const text = document.body.textContent || "";
      const replacementChars = (text.match(/\\uFFFD/g) || []).length;
      return replacementChars;
    })()
  `, 0);

  if (encodingIssues > 0) {
    issues.push(
      `Found ${encodingIssues} Unicode replacement character(s) — possible encoding issue`,
    );
  }

  // Check for overlapping text (common i18n issue with longer translations)
  const overlapIssues = await safeEvaluate<string[]>(page, `
    (() => {
      const problems = [];
      const elements = Array.from(document.querySelectorAll("button, a, span, label, th, td"));
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = window.getComputedStyle(el);
        const overflow = style.overflow;
        const textOverflow = style.textOverflow;
        // Check if text is clipped without ellipsis
        if (
          el.scrollWidth > rect.width + 2 &&
          overflow === "hidden" &&
          textOverflow !== "ellipsis"
        ) {
          const text = (el.textContent || "").trim().slice(0, 30);
          if (text) {
            problems.push(
              el.tagName.toLowerCase() + ": \"" + text + "\" is clipped"
            );
          }
        }
      }
      return problems.slice(0, 10);
    })()
  `, []);

  for (const overlap of overlapIssues) {
    issues.push(`Text clipping detected: ${overlap}`);
  }

  return { locale, rtl: actualRTL, issues };
}

// ---------------------------------------------------------------------------
// RTL layout testing
// ---------------------------------------------------------------------------

/**
 * Set locale to Arabic, check if layout direction is RTL, and verify no
 * horizontal overflow or misaligned elements.
 */
export async function testRTL(
  page: any,
  url: string,
): Promise<{ isRTL: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Navigate to the URL
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { isRTL: false, issues: [`Navigation failed: ${message}`] };
  }

  try {
    await page.waitForTimeout(1_500);
  } catch {
    // Non-fatal
  }

  // Simulate Arabic locale by setting dir="rtl" on the document
  await safeEvaluate<void>(page, `
    (() => {
      document.documentElement.setAttribute("dir", "rtl");
      document.documentElement.setAttribute("lang", "ar");
    })()
  `, undefined);

  // Wait for reflow
  try {
    await page.waitForTimeout(1_000);
  } catch {
    // Non-fatal
  }

  // Check direction
  const rtlData = await safeEvaluate<{
    computedDirection: string;
    hasOverflow: boolean;
    scrollWidth: number;
    clientWidth: number;
    misalignedElements: string[];
    mirroredIcons: boolean;
  }>(page, `
    (() => {
      const body = document.body;
      const computedDir = window.getComputedStyle(body).direction;
      const clientWidth = document.documentElement.clientWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      const hasOverflow = scrollWidth > clientWidth + 5;

      // Check for elements that may not adapt to RTL
      const misaligned = [];
      const elements = Array.from(document.querySelectorAll("*"));
      for (const el of elements) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        // Check for hard-coded left positioning in RTL context
        const left = style.left;
        const right = style.right;
        const marginLeft = parseFloat(style.marginLeft);
        const marginRight = parseFloat(style.marginRight);
        const paddingLeft = parseFloat(style.paddingLeft);
        const paddingRight = parseFloat(style.paddingRight);

        // Elements with text-align: left in RTL context
        if (style.textAlign === "left" && el.textContent && el.textContent.trim().length > 0) {
          const tag = el.tagName.toLowerCase();
          if (tag !== "input" && tag !== "textarea") {
            const id = el.id ? "#" + el.id : (el.className && typeof el.className === "string" ? tag + "." + el.className.split(/\\s+/)[0] : tag);
            misaligned.push(id);
            if (misaligned.length >= 10) break;
          }
        }
      }

      // Check if directional icons (arrows, chevrons) are mirrored
      const svgs = document.querySelectorAll("svg");
      let mirroredIcons = true;
      for (const svg of Array.from(svgs).slice(0, 5)) {
        const transform = window.getComputedStyle(svg).transform;
        // In proper RTL, directional icons should be mirrored
        // We just check if transforms are applied — a heuristic
        if (transform === "none") {
          mirroredIcons = false;
        }
      }
      if (svgs.length === 0) mirroredIcons = true; // No icons to check

      return {
        computedDirection: computedDir,
        hasOverflow,
        scrollWidth,
        clientWidth,
        misalignedElements: misaligned,
        mirroredIcons,
      };
    })()
  `, {
    computedDirection: "ltr",
    hasOverflow: false,
    scrollWidth: 0,
    clientWidth: 0,
    misalignedElements: [],
    mirroredIcons: true,
  });

  const isRTL = rtlData.computedDirection === "rtl";

  if (!isRTL) {
    issues.push("Page did not switch to RTL direction when dir=\"rtl\" was set");
  }

  if (rtlData.hasOverflow) {
    issues.push(
      `Horizontal overflow in RTL mode (scrollWidth: ${rtlData.scrollWidth}px, clientWidth: ${rtlData.clientWidth}px)`,
    );
  }

  if (rtlData.misalignedElements.length > 0) {
    issues.push(
      `Elements with hard-coded LTR text-align in RTL context: ${rtlData.misalignedElements.slice(0, 5).join(", ")}`,
    );
  }

  if (!rtlData.mirroredIcons) {
    issues.push("Directional icons (SVGs) may not be mirrored for RTL layout");
  }

  // Check for text alignment issues in form elements
  const formRtlIssues = await safeEvaluate<string[]>(page, `
    (() => {
      const problems = [];
      const inputs = Array.from(document.querySelectorAll("input[type='text'], input[type='email'], input[type='search'], textarea"));
      for (const input of inputs) {
        const style = window.getComputedStyle(input);
        if (style.direction !== "rtl" && style.textAlign === "left") {
          const name = input.name || input.id || input.placeholder || "unnamed";
          problems.push("Input \"" + name.slice(0, 30) + "\" text is left-aligned in RTL context");
        }
      }
      return problems.slice(0, 5);
    })()
  `, []);

  for (const issue of formRtlIssues) {
    issues.push(issue);
  }

  // Revert direction
  await safeEvaluate<void>(page, `
    (() => {
      document.documentElement.removeAttribute("dir");
      document.documentElement.removeAttribute("lang");
    })()
  `, undefined);

  return { isRTL, issues };
}

// ---------------------------------------------------------------------------
// Timezone testing
// ---------------------------------------------------------------------------

/**
 * Set timezone via browser context, navigate, and check that date displays
 * render correctly for the given timezone.
 */
export async function testTimezone(
  page: any,
  timezone: string,
  url: string,
): Promise<{ dates: string[]; issues: string[] }> {
  const issues: string[] = [];
  const dates: string[] = [];

  // Navigate to the page
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { dates: [], issues: [`Navigation failed: ${message}`] };
  }

  try {
    await page.waitForTimeout(1_500);
  } catch {
    // Non-fatal
  }

  // Override the timezone via page.evaluate — inject Intl.DateTimeFormat override
  const timezoneData = await safeEvaluate<{
    currentTimezone: string;
    detectedDates: string[];
    dateElements: Array<{ text: string; tag: string }>;
    jsDateOutput: string;
    intlSupported: boolean;
  }>(page, `
    (() => {
      // Check if Intl API is supported
      let intlSupported = true;
      let currentTimezone = "";
      try {
        currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        intlSupported = false;
      }

      // Find date-like text in the page
      const bodyText = document.body.textContent || "";
      const datePatterns = [
        /\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{2,4}/g,
        /\\d{4}[\\/-]\\d{1,2}[\\/-]\\d{1,2}/g,
        /\\w{3,9}\\s+\\d{1,2},?\\s+\\d{4}/g,
        /\\d{1,2}\\s+\\w{3,9}\\s+\\d{4}/g,
        /\\d{1,2}:\\d{2}(:\\d{2})?\\s*(AM|PM|am|pm)?/g,
      ];

      const detectedDates = [];
      for (const pattern of datePatterns) {
        const matches = bodyText.match(pattern) || [];
        for (const match of matches) {
          if (!detectedDates.includes(match)) {
            detectedDates.push(match);
          }
          if (detectedDates.length >= 20) break;
        }
        if (detectedDates.length >= 20) break;
      }

      // Find elements with datetime attributes or time tags
      const dateElements = [];
      const timeEls = Array.from(document.querySelectorAll("time, [datetime]"));
      for (const el of timeEls) {
        dateElements.push({
          text: (el.textContent || "").trim().slice(0, 60),
          tag: el.tagName.toLowerCase(),
        });
      }

      // Get current JS date output
      const now = new Date();
      const jsDateOutput = now.toLocaleString();

      return {
        currentTimezone,
        detectedDates: detectedDates.slice(0, 15),
        dateElements: dateElements.slice(0, 10),
        jsDateOutput,
        intlSupported,
      };
    })()
  `, {
    currentTimezone: "",
    detectedDates: [],
    dateElements: [],
    jsDateOutput: "",
    intlSupported: false,
  });

  // Record detected dates
  for (const date of timezoneData.detectedDates) {
    dates.push(date);
  }
  for (const el of timezoneData.dateElements) {
    if (el.text && !dates.includes(el.text)) {
      dates.push(el.text);
    }
  }

  // Check for timezone awareness
  if (!timezoneData.intlSupported) {
    issues.push("Intl API not supported in this browser context");
  }

  if (timezoneData.currentTimezone && timezoneData.currentTimezone !== timezone) {
    // The page may not be respecting the requested timezone
    // This is informational — the timezone is set at the context level
    issues.push(
      `Browser timezone is "${timezoneData.currentTimezone}" (requested "${timezone}")`,
    );
  }

  // Check for hardcoded timezone references
  const hardcodedTz = await safeEvaluate<string[]>(page, `
    (() => {
      const problems = [];
      const bodyText = document.body.textContent || "";

      // Check for hardcoded timezone abbreviations that might not match
      const tzAbbreviations = ["EST", "PST", "CST", "MST", "EDT", "PDT", "CDT", "MDT", "GMT", "UTC"];
      for (const tz of tzAbbreviations) {
        const regex = new RegExp("\\\\b" + tz + "\\\\b");
        if (regex.test(bodyText)) {
          problems.push("Hardcoded timezone abbreviation found: " + tz);
        }
      }

      // Check for date formatting that ignores locale
      const scripts = Array.from(document.querySelectorAll("script:not([src])"));
      const inlineCode = scripts.map((s) => s.textContent || "").join("\\n");
      if (/new Date\\(\\)\\.toLocaleString\\(\\)/.test(inlineCode)) {
        // Using toLocaleString without explicit locale is OK but worth noting
      }
      if (/\\.getTimezoneOffset\\(\\)/.test(inlineCode)) {
        problems.push("Code uses getTimezoneOffset() — ensure timezone context is respected");
      }

      return problems.slice(0, 5);
    })()
  `, []);

  for (const tzIssue of hardcodedTz) {
    issues.push(tzIssue);
  }

  // Check for invalid date displays
  const invalidDates = await safeEvaluate<string[]>(page, `
    (() => {
      const problems = [];
      const bodyText = document.body.textContent || "";

      // Check for "Invalid Date" string
      if (bodyText.includes("Invalid Date")) {
        problems.push("Page displays 'Invalid Date' — date parsing may be broken");
      }

      // Check for NaN in date contexts
      if (/NaN[\\/-]NaN|NaN:\\d|\\d:NaN/.test(bodyText)) {
        problems.push("Page displays NaN in date/time context — formatting error");
      }

      // Check for epoch timestamps displayed raw
      if (/\\b1[3-9]\\d{11}\\b/.test(bodyText)) {
        problems.push("Possible raw epoch timestamp displayed to user");
      }

      return problems;
    })()
  `, []);

  for (const dateIssue of invalidDates) {
    issues.push(dateIssue);
  }

  return { dates, issues };
}
