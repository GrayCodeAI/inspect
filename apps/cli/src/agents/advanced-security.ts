// ============================================================================
// Advanced Security Agent — Extended security testing beyond basic audit
// For AUTHORIZED security testing only (defensive/educational)
// ============================================================================

import type { Page } from "@inspect/browser";
import { safeEvaluate } from "./evaluate.js";
import type { ProgressCallback } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SecurityTestResult {
  test: string;
  passed: boolean;
  severity: string;
  details: string;
  fix?: string;
}

// ---------------------------------------------------------------------------
// 1. CSRF token detection
// ---------------------------------------------------------------------------

export async function testCSRF(page: Page, url: string): Promise<SecurityTestResult> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  } catch {
    return {
      test: "CSRF Protection",
      passed: false,
      severity: "high",
      details: `Failed to navigate to ${url} for CSRF check.`,
      fix: "Ensure the page is accessible for security testing.",
    };
  }

  const csrfInfo = await safeEvaluate<{
    formsCount: number;
    formsWithToken: number;
    hasMetaToken: boolean;
  }>(
    page,
    `(() => {
      const forms = Array.from(document.querySelectorAll("form"));
      let formsWithToken = 0;

      for (const form of forms) {
        const hiddenInputs = Array.from(form.querySelectorAll("input[type='hidden']"));
        const hasHiddenToken = hiddenInputs.some((input) => {
          const name = (input.getAttribute("name") || "").toLowerCase();
          return (
            name.includes("csrf") ||
            name.includes("_token") ||
            name === "token" ||
            name.includes("xsrf") ||
            name.includes("authenticity_token")
          );
        });

        if (hasHiddenToken) {
          formsWithToken++;
        }
      }

      const metaCsrf = document.querySelector(
        'meta[name="csrf-token"], meta[name="csrf_token"], meta[name="_csrf"]'
      );

      return {
        formsCount: forms.length,
        formsWithToken,
        hasMetaToken: !!metaCsrf,
      };
    })()`,
    { formsCount: 0, formsWithToken: 0, hasMetaToken: false },
  );

  // If there are no forms, CSRF is not applicable
  if (csrfInfo.formsCount === 0) {
    return {
      test: "CSRF Protection",
      passed: true,
      severity: "info",
      details: "No forms found on the page. CSRF protection check not applicable.",
    };
  }

  const hasGlobalToken = csrfInfo.hasMetaToken;
  const allFormsProtected = csrfInfo.formsWithToken === csrfInfo.formsCount || hasGlobalToken;

  if (allFormsProtected) {
    return {
      test: "CSRF Protection",
      passed: true,
      severity: "info",
      details:
        `CSRF protection detected. ${csrfInfo.formsWithToken}/${csrfInfo.formsCount} forms have hidden tokens.` +
        (hasGlobalToken ? " Meta CSRF token tag found." : ""),
    };
  }

  const unprotectedCount = csrfInfo.formsCount - csrfInfo.formsWithToken;
  return {
    test: "CSRF Protection",
    passed: false,
    severity: "high",
    details:
      `${unprotectedCount} of ${csrfInfo.formsCount} form(s) lack CSRF tokens. ` +
      `No hidden input named csrf/token/_token found and no meta csrf-token tag present.`,
    fix:
      "Add CSRF tokens to all state-changing forms. Include a hidden input with a unique " +
      "per-session token, or set a meta csrf-token tag and send it via the X-CSRF-TOKEN header.",
  };
}

// ---------------------------------------------------------------------------
// 2. SQL Injection testing
// ---------------------------------------------------------------------------

const SQL_PAYLOADS = ["' OR 1=1--", "'; DROP TABLE--", "UNION SELECT NULL--"];

const SQL_ERROR_PATTERNS = [
  "mysql",
  "syntax error",
  "ora-",
  "postgresql",
  "sqlite",
  "sql syntax",
  "unclosed quotation mark",
  "quoted string not properly terminated",
  "you have an error in your sql",
  "warning: mysql",
  "pg_query",
  "microsoft ole db provider for sql server",
];

export async function testSQLInjection(page: Page, url: string): Promise<SecurityTestResult[]> {
  const results: SecurityTestResult[] = [];

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  } catch {
    results.push({
      test: "SQL Injection",
      passed: false,
      severity: "critical",
      details: `Failed to navigate to ${url} for SQL injection testing.`,
    });
    return results;
  }

  // Find text input fields
  const inputSelectors = await safeEvaluate<string[]>(
    page,
    `(() => {
      const inputs = Array.from(document.querySelectorAll(
        'input[type="text"], input[type="search"], input[type="email"], input[type="url"], input:not([type]), textarea'
      ));
      return inputs.slice(0, 5).map((el, i) => {
        if (el.id) return "#" + el.id;
        if (el.name) return el.tagName.toLowerCase() + "[name='" + el.name + "']";
        return el.tagName.toLowerCase() + ":nth-of-type(" + (i + 1) + ")";
      });
    })()`,
    [],
  );

  if (inputSelectors.length === 0) {
    results.push({
      test: "SQL Injection",
      passed: true,
      severity: "info",
      details: "No text input fields found on the page. SQL injection test not applicable.",
    });
    return results;
  }

  for (const selector of inputSelectors) {
    for (const payload of SQL_PAYLOADS) {
      try {
        // Navigate back to clean state
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });

        const input = await page.$(selector);
        if (!input) continue;

        await input.fill(payload);

        // Try to submit
        try {
          await input.press("Enter");
        } catch {
          try {
            const submitBtn = await page.$(
              'button[type="submit"], input[type="submit"], button:not([type])',
            );
            if (submitBtn) await submitBtn.click();
          } catch {
            // No submit mechanism available
          }
        }

        await page.waitForTimeout(1_500);

        // Check for SQL error messages in the response
        const pageContent = await safeEvaluate<string>(
          page,
          `(() => {
            return (document.body.innerText || "").toLowerCase();
          })()`,
          "",
        );

        const matchedErrors: string[] = [];
        for (const pattern of SQL_ERROR_PATTERNS) {
          if (pageContent.includes(pattern.toLowerCase())) {
            matchedErrors.push(pattern);
          }
        }

        if (matchedErrors.length > 0) {
          results.push({
            test: "SQL Injection",
            passed: false,
            severity: "critical",
            details:
              `SQL error reflected for input "${selector}" with payload "${payload}". ` +
              `Detected error keywords: ${matchedErrors.join(", ")}. ` +
              `This indicates the application may be vulnerable to SQL injection.`,
            fix:
              "Use parameterized queries or prepared statements for all database operations. " +
              "Never concatenate user input directly into SQL queries. " +
              "Suppress detailed database error messages in production.",
          });
        }
      } catch {
        // Skip on error
      }
    }
  }

  if (results.length === 0) {
    results.push({
      test: "SQL Injection",
      passed: true,
      severity: "info",
      details:
        `Tested ${inputSelectors.length} input field(s) with ${SQL_PAYLOADS.length} SQL payloads. ` +
        "No SQL error messages detected in responses.",
    });
  }

  // Navigate back
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  } catch {
    // Non-fatal
  }

  return results;
}

// ---------------------------------------------------------------------------
// 3. Clickjacking protection
// ---------------------------------------------------------------------------

export async function testClickjacking(page: Page, url: string): Promise<SecurityTestResult> {
  let xFrameOptions: string | null = null;
  let cspFrameAncestors: string | null = null;

  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    if (response) {
      const allHeaders = await response.allHeaders();
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(allHeaders)) {
        normalized[key.toLowerCase()] = value as string;
      }

      xFrameOptions = normalized["x-frame-options"] ?? null;

      const csp = normalized["content-security-policy"] ?? "";
      const frameAncestorsMatch = csp.match(/frame-ancestors\s+([^;]+)/i);
      if (frameAncestorsMatch) {
        cspFrameAncestors = frameAncestorsMatch[1].trim();
      }
    }
  } catch {
    return {
      test: "Clickjacking Protection",
      passed: false,
      severity: "medium",
      details: `Failed to navigate to ${url} to check clickjacking protection.`,
      fix: "Ensure the page is accessible for security testing.",
    };
  }

  const hasXFrameOptions =
    xFrameOptions !== null &&
    (xFrameOptions.toUpperCase() === "DENY" || xFrameOptions.toUpperCase() === "SAMEORIGIN");

  const hasFrameAncestors = cspFrameAncestors !== null;

  if (hasXFrameOptions || hasFrameAncestors) {
    const protections: string[] = [];
    if (hasXFrameOptions) {
      protections.push(`X-Frame-Options: ${xFrameOptions}`);
    }
    if (hasFrameAncestors) {
      protections.push(`CSP frame-ancestors: ${cspFrameAncestors}`);
    }
    return {
      test: "Clickjacking Protection",
      passed: true,
      severity: "info",
      details: `Clickjacking protection is in place. ${protections.join("; ")}.`,
    };
  }

  return {
    test: "Clickjacking Protection",
    passed: false,
    severity: "medium",
    details:
      "No clickjacking protection found. Neither X-Frame-Options (DENY/SAMEORIGIN) " +
      "nor CSP frame-ancestors directive is set. The page can be embedded in iframes on any origin.",
    fix:
      "Add the X-Frame-Options header set to DENY or SAMEORIGIN, and/or add a " +
      "Content-Security-Policy header with frame-ancestors 'self'.",
  };
}

// ---------------------------------------------------------------------------
// 4. CORS configuration check
// ---------------------------------------------------------------------------

export async function testCORSConfig(page: Page, url: string): Promise<SecurityTestResult> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  } catch {
    return {
      test: "CORS Configuration",
      passed: false,
      severity: "medium",
      details: `Failed to navigate to ${url} for CORS configuration check.`,
      fix: "Ensure the page is accessible for security testing.",
    };
  }

  const corsResult = await safeEvaluate<{
    allowOrigin: string | null;
    allowCredentials: string | null;
    error: string | null;
  }>(
    page,
    `(async () => {
      try {
        const response = await fetch(window.location.href, {
          method: "GET",
          headers: {
            "Origin": "https://evil-attacker-origin.example.com"
          },
          credentials: "omit"
        });
        const allowOrigin = response.headers.get("Access-Control-Allow-Origin");
        const allowCredentials = response.headers.get("Access-Control-Allow-Credentials");
        return { allowOrigin, allowCredentials, error: null };
      } catch (e) {
        return { allowOrigin: null, allowCredentials: null, error: String(e) };
      }
    })()`,
    { allowOrigin: null, allowCredentials: null, error: "evaluate failed" },
    15_000,
  );

  if (corsResult.error && corsResult.allowOrigin === null) {
    return {
      test: "CORS Configuration",
      passed: true,
      severity: "info",
      details:
        "Could not determine CORS configuration via fetch. " +
        "The server may not include CORS headers for same-origin requests.",
    };
  }

  if (corsResult.allowOrigin === "*") {
    const hasCredentials = corsResult.allowCredentials?.toLowerCase() === "true";

    if (hasCredentials) {
      return {
        test: "CORS Configuration",
        passed: false,
        severity: "critical",
        details:
          "CORS is configured with Access-Control-Allow-Origin: * and " +
          "Access-Control-Allow-Credentials: true. This is an extremely dangerous " +
          "combination that allows any origin to make authenticated requests.",
        fix:
          "Never combine wildcard origin (*) with Allow-Credentials: true. " +
          "Whitelist specific trusted origins instead.",
      };
    }

    return {
      test: "CORS Configuration",
      passed: false,
      severity: "medium",
      details:
        "CORS is configured with Access-Control-Allow-Origin: *. " +
        "Any website can make cross-origin requests to this endpoint. " +
        "This is acceptable for public APIs but not for authenticated endpoints.",
      fix:
        "Restrict Access-Control-Allow-Origin to specific trusted origins " +
        "instead of using the wildcard (*). Validate the Origin header server-side.",
    };
  }

  if (corsResult.allowOrigin !== null) {
    return {
      test: "CORS Configuration",
      passed: true,
      severity: "info",
      details:
        `CORS Access-Control-Allow-Origin is set to: ${corsResult.allowOrigin}. ` +
        "The server restricts cross-origin access to specific origins.",
    };
  }

  return {
    test: "CORS Configuration",
    passed: true,
    severity: "info",
    details:
      "No Access-Control-Allow-Origin header detected. " +
      "Cross-origin requests are blocked by default browser same-origin policy.",
  };
}

// ---------------------------------------------------------------------------
// 5. Path traversal testing
// ---------------------------------------------------------------------------

const PATH_TRAVERSAL_PAYLOADS = [
  { payload: "../../etc/passwd", indicator: "root:" },
  { payload: "..\\..\\windows\\system32", indicator: "[boot loader]" },
  { payload: "../../../etc/passwd", indicator: "root:" },
  { payload: "..%2F..%2Fetc%2Fpasswd", indicator: "root:" },
  { payload: "....//....//etc/passwd", indicator: "root:" },
];

export async function testPathTraversal(page: Page, url: string): Promise<SecurityTestResult[]> {
  const results: SecurityTestResult[] = [];
  const parsedUrl = new URL(url);

  // Collect existing query params and also try common param names
  const paramNames = Array.from(parsedUrl.searchParams.keys());
  const commonParams = [
    "file",
    "path",
    "page",
    "doc",
    "document",
    "folder",
    "dir",
    "template",
    "include",
    "src",
  ];
  const allParams = [...new Set([...paramNames, ...commonParams])];

  if (allParams.length === 0) {
    results.push({
      test: "Path Traversal",
      passed: true,
      severity: "info",
      details: "No URL parameters found to test for path traversal.",
    });
    return results;
  }

  for (const paramName of allParams) {
    for (const { payload, indicator } of PATH_TRAVERSAL_PAYLOADS) {
      try {
        const testUrl = new URL(url);
        testUrl.searchParams.set(paramName, payload);

        const response = await page.goto(testUrl.toString(), {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        });

        let statusCode = 200;
        if (response) {
          statusCode = response.status();
        }

        // Only check 200 responses
        if (statusCode !== 200) continue;

        const pageContent = await safeEvaluate<string>(
          page,
          `(() => {
            return document.body.innerText || "";
          })()`,
          "",
        );

        if (pageContent.includes(indicator)) {
          results.push({
            test: "Path Traversal",
            passed: false,
            severity: "critical",
            details:
              `Path traversal vulnerability found! Parameter "${paramName}" with payload ` +
              `"${payload}" returned content containing "${indicator}". ` +
              `The application appears to allow reading arbitrary files from the server filesystem.`,
            fix:
              "Validate and sanitize all file path inputs. Use a whitelist of allowed files or " +
              "directories. Never pass user input directly to filesystem operations. " +
              "Use path canonicalization and ensure resolved paths stay within the intended directory.",
          });
          // One positive result per param is enough
          break;
        }
      } catch {
        // Skip on navigation errors
      }
    }
  }

  if (results.length === 0) {
    results.push({
      test: "Path Traversal",
      passed: true,
      severity: "info",
      details:
        `Tested ${allParams.length} parameter(s) with ${PATH_TRAVERSAL_PAYLOADS.length} path traversal payloads. ` +
        "No file disclosure detected.",
    });
  }

  // Navigate back
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  } catch {
    // Non-fatal
  }

  return results;
}

// ---------------------------------------------------------------------------
// 6. Information disclosure
// ---------------------------------------------------------------------------

export async function testInfoDisclosure(page: Page, url: string): Promise<SecurityTestResult[]> {
  const results: SecurityTestResult[] = [];

  // --- Check response headers for server version info ---
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    if (response) {
      const allHeaders = await response.allHeaders();
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(allHeaders)) {
        normalized[key.toLowerCase()] = value as string;
      }

      // Server header with version
      const serverHeader = normalized["server"] ?? null;
      if (serverHeader && /\d+\.\d+/.test(serverHeader)) {
        results.push({
          test: "Information Disclosure — Server Header",
          passed: false,
          severity: "low",
          details:
            `Server header reveals version information: "${serverHeader}". ` +
            "Attackers can use this to look up known vulnerabilities for this specific server version.",
          fix:
            "Remove or obfuscate the Server header version. " +
            "Configure your web server to return a generic Server header without version details.",
        });
      }

      // X-Powered-By header
      const poweredBy = normalized["x-powered-by"] ?? null;
      if (poweredBy) {
        results.push({
          test: "Information Disclosure — X-Powered-By",
          passed: false,
          severity: "low",
          details:
            `X-Powered-By header reveals technology stack: "${poweredBy}". ` +
            "This helps attackers fingerprint the application and target known framework vulnerabilities.",
          fix:
            "Remove the X-Powered-By header. In Express.js, use app.disable('x-powered-by') " +
            "or use helmet middleware.",
        });
      }
    }
  } catch {
    // Non-fatal
  }

  // --- Check error page for stack traces ---
  try {
    const parsedUrl = new URL(url);
    parsedUrl.pathname = "/nonexistent-path-test-" + Date.now();
    await page.goto(parsedUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    const errorPageContent = await safeEvaluate<string>(
      page,
      `(() => {
        return document.body.innerText || "";
      })()`,
      "",
    );

    const stackTracePatterns = [
      /at\s+\w+\s+\(.*:\d+:\d+\)/,
      /Traceback \(most recent call last\)/i,
      /Exception in thread/i,
      /Stack trace:/i,
      /Fatal error:/i,
      /line \d+ in .*\.php/i,
      /SQLSTATE\[/,
      /vendor\/.*\.php/i,
      /node_modules\//,
    ];

    const detectedTraces: string[] = [];
    for (const pattern of stackTracePatterns) {
      if (pattern.test(errorPageContent)) {
        detectedTraces.push(pattern.source);
      }
    }

    if (detectedTraces.length > 0) {
      results.push({
        test: "Information Disclosure — Error Page Stack Traces",
        passed: false,
        severity: "medium",
        details:
          `Error page at 404 URL exposes stack traces or internal paths. ` +
          `Detected patterns: ${detectedTraces.join(", ")}. ` +
          "This reveals internal application structure and can help attackers craft targeted exploits.",
        fix:
          "Configure custom error pages that do not reveal stack traces, file paths, or " +
          "internal application details. Use generic error messages in production.",
      });
    }
  } catch {
    // Non-fatal
  }

  // --- Check for .env file exposure ---
  try {
    const parsedUrl = new URL(url);
    parsedUrl.pathname = "/.env";
    const envResponse = await page.goto(parsedUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    let envStatus = 404;
    if (envResponse) {
      envStatus = envResponse.status();
    }

    if (envStatus === 200) {
      const envContent = await safeEvaluate<string>(
        page,
        `(() => {
          return (document.body.innerText || "").substring(0, 500);
        })()`,
        "",
      );

      // Check if it looks like an actual .env file
      const looksLikeEnv =
        /[A-Z_]+=/.test(envContent) ||
        /DB_/.test(envContent) ||
        /API_KEY/.test(envContent) ||
        /SECRET/.test(envContent) ||
        /PASSWORD/.test(envContent);

      if (looksLikeEnv) {
        results.push({
          test: "Information Disclosure — .env File Exposed",
          passed: false,
          severity: "critical",
          details:
            "The /.env file is publicly accessible and appears to contain environment variables. " +
            "This likely exposes database credentials, API keys, and other secrets.",
          fix:
            "Block access to .env files in your web server configuration. " +
            "Add rules to deny access to dotfiles (e.g., in nginx: location ~ /\\. { deny all; }).",
        });
      }
    }
  } catch {
    // Non-fatal
  }

  // --- Check for .git/HEAD exposure ---
  try {
    const parsedUrl = new URL(url);
    parsedUrl.pathname = "/.git/HEAD";
    const gitResponse = await page.goto(parsedUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    let gitStatus = 404;
    if (gitResponse) {
      gitStatus = gitResponse.status();
    }

    if (gitStatus === 200) {
      const gitContent = await safeEvaluate<string>(
        page,
        `(() => {
          return (document.body.innerText || "").substring(0, 200);
        })()`,
        "",
      );

      if (gitContent.includes("ref:") || gitContent.includes("refs/heads/")) {
        results.push({
          test: "Information Disclosure — .git Directory Exposed",
          passed: false,
          severity: "critical",
          details:
            "The /.git/HEAD file is publicly accessible. This means the entire Git repository " +
            "can potentially be downloaded, exposing source code, commit history, and possibly secrets.",
          fix:
            "Block access to the .git directory in your web server configuration. " +
            "In nginx: location ~ /\\.git { deny all; }. In Apache: RedirectMatch 404 /\\.git.",
        });
      }
    }
  } catch {
    // Non-fatal
  }

  if (results.length === 0) {
    results.push({
      test: "Information Disclosure",
      passed: true,
      severity: "info",
      details:
        "No information disclosure issues detected. Server headers do not leak version info, " +
        "error pages do not expose stack traces, and .env/.git files are not publicly accessible.",
    });
  }

  // Navigate back
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  } catch {
    // Non-fatal
  }

  return results;
}

// ---------------------------------------------------------------------------
// 7. Dependency scanning
// ---------------------------------------------------------------------------

interface LibraryInfo {
  name: string;
  version: string;
}

interface VulnerableLibrary {
  name: string;
  maxSafe: string;
  severity: string;
  reason: string;
}

const VULNERABLE_LIBRARIES: VulnerableLibrary[] = [
  {
    name: "jquery",
    maxSafe: "3.5.0",
    severity: "medium",
    reason:
      "jQuery versions before 3.5.0 are vulnerable to XSS via cross-site scripting in jQuery.htmlPrefilter.",
  },
  {
    name: "lodash",
    maxSafe: "4.17.21",
    severity: "high",
    reason: "Lodash versions before 4.17.21 are vulnerable to prototype pollution.",
  },
  {
    name: "moment",
    maxSafe: "999.0.0",
    severity: "low",
    reason:
      "Moment.js is deprecated and no longer maintained. " +
      "It has known ReDoS vulnerabilities and a large bundle size. Migrate to date-fns, Luxon, or Day.js.",
  },
  {
    name: "angular",
    maxSafe: "1.8.0",
    severity: "high",
    reason: "AngularJS versions before 1.8.0 have known XSS and sandbox escape vulnerabilities.",
  },
  {
    name: "bootstrap",
    maxSafe: "5.0.0",
    severity: "medium",
    reason:
      "Bootstrap versions before 5.0.0 have known XSS vulnerabilities in tooltip and popover components.",
  },
];

function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

export async function scanDependencies(page: Page): Promise<SecurityTestResult[]> {
  const results: SecurityTestResult[] = [];

  const libraries = await safeEvaluate<LibraryInfo[]>(
    page,
    `(() => {
      const libs = [];

      // jQuery
      if (typeof jQuery !== "undefined" && jQuery.fn && jQuery.fn.jquery) {
        libs.push({ name: "jquery", version: jQuery.fn.jquery });
      } else if (typeof $ !== "undefined" && $.fn && $.fn.jquery) {
        libs.push({ name: "jquery", version: $.fn.jquery });
      }

      // Lodash
      if (typeof _ !== "undefined" && _.VERSION) {
        libs.push({ name: "lodash", version: _.VERSION });
      }

      // Moment.js
      if (typeof moment !== "undefined" && moment.version) {
        libs.push({ name: "moment", version: moment.version });
      }

      // AngularJS
      if (typeof angular !== "undefined" && angular.version && angular.version.full) {
        libs.push({ name: "angular", version: angular.version.full });
      }

      // Bootstrap
      if (typeof bootstrap !== "undefined" && bootstrap.Alert && bootstrap.Alert.VERSION) {
        libs.push({ name: "bootstrap", version: bootstrap.Alert.VERSION });
      }

      // Also try to detect from script tags
      const scripts = Array.from(document.querySelectorAll("script[src]"));
      for (const script of scripts) {
        const src = script.getAttribute("src") || "";
        const lowerSrc = src.toLowerCase();

        // jQuery from CDN
        const jqueryMatch = lowerSrc.match(/jquery[.-]?(\\d+\\.\\d+\\.\\d+)/);
        if (jqueryMatch && !libs.some(l => l.name === "jquery")) {
          libs.push({ name: "jquery", version: jqueryMatch[1] });
        }

        // Lodash from CDN
        const lodashMatch = lowerSrc.match(/lodash[.-]?(\\d+\\.\\d+\\.\\d+)/);
        if (lodashMatch && !libs.some(l => l.name === "lodash")) {
          libs.push({ name: "lodash", version: lodashMatch[1] });
        }

        // Moment from CDN
        const momentMatch = lowerSrc.match(/moment[.-]?(\\d+\\.\\d+\\.\\d+)/);
        if (momentMatch && !libs.some(l => l.name === "moment")) {
          libs.push({ name: "moment", version: momentMatch[1] });
        }

        // AngularJS from CDN
        const angularMatch = lowerSrc.match(/angular[.-]?(\\d+\\.\\d+\\.\\d+)/);
        if (angularMatch && !libs.some(l => l.name === "angular")) {
          libs.push({ name: "angular", version: angularMatch[1] });
        }

        // Bootstrap from CDN
        const bootstrapMatch = lowerSrc.match(/bootstrap[.-]?(\\d+\\.\\d+\\.\\d+)/);
        if (bootstrapMatch && !libs.some(l => l.name === "bootstrap")) {
          libs.push({ name: "bootstrap", version: bootstrapMatch[1] });
        }
      }

      return libs;
    })()`,
    [],
  );

  if (libraries.length === 0) {
    results.push({
      test: "Dependency Scan",
      passed: true,
      severity: "info",
      details:
        "No known JavaScript libraries detected on the page. " +
        "The application may use bundled/minified code that obscures library versions.",
    });
    return results;
  }

  for (const lib of libraries) {
    const vuln = VULNERABLE_LIBRARIES.find((v) => v.name === lib.name);

    if (!vuln) continue;

    // Special handling for moment.js — always flag as deprecated
    if (vuln.name === "moment") {
      results.push({
        test: `Dependency Scan — ${lib.name} ${lib.version}`,
        passed: false,
        severity: vuln.severity,
        details: `Detected moment.js v${lib.version}. ${vuln.reason}`,
        fix: "Replace moment.js with a modern, maintained date library such as date-fns, Luxon, or Day.js.",
      });
      continue;
    }

    if (compareVersions(lib.version, vuln.maxSafe) < 0) {
      results.push({
        test: `Dependency Scan — ${lib.name} ${lib.version}`,
        passed: false,
        severity: vuln.severity,
        details:
          `Detected ${lib.name} v${lib.version}, which is older than the safe version ` +
          `(${vuln.maxSafe}). ${vuln.reason}`,
        fix: `Update ${lib.name} to version ${vuln.maxSafe} or later.`,
      });
    } else {
      results.push({
        test: `Dependency Scan — ${lib.name} ${lib.version}`,
        passed: true,
        severity: "info",
        details: `Detected ${lib.name} v${lib.version}. This version is at or above the known safe threshold (${vuln.maxSafe}).`,
      });
    }
  }

  if (results.length === 0) {
    results.push({
      test: "Dependency Scan",
      passed: true,
      severity: "info",
      details:
        `Detected ${libraries.length} library(ies): ` +
        libraries.map((l) => `${l.name} v${l.version}`).join(", ") +
        ". No known vulnerabilities found for the detected versions.",
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 8. WAF (Web Application Firewall) detection
// ---------------------------------------------------------------------------

export async function detectWAF(
  page: Page,
  url: string,
): Promise<{ detected: boolean; provider: string | null; recommendations: string[] }> {
  const recommendations: string[] = [];
  let provider: string | null = null;
  let detected = false;

  try {
    // Send a mildly suspicious request to trigger WAF responses
    const testUrl = new URL(url);
    testUrl.searchParams.set("test", "<script>");
    const response = await page.goto(testUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    if (response) {
      const status = response.status();
      const allHeaders = await response.allHeaders();
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(allHeaders)) {
        normalized[key.toLowerCase()] = value as string;
      }

      // Check response headers for WAF signatures
      if (normalized["cf-ray"]) {
        detected = true;
        provider = "Cloudflare";
      } else if (normalized["x-amz-cf-id"]) {
        detected = true;
        provider = "CloudFront";
      } else if (normalized["x-sucuri-id"]) {
        detected = true;
        provider = "Sucuri";
      } else if (normalized["x-akamai-transformed"]) {
        detected = true;
        provider = "Akamai";
      } else if (
        normalized["server"] &&
        normalized["server"].toLowerCase().includes("akamaighost")
      ) {
        detected = true;
        provider = "Akamai";
      }

      // Check for 403/406 status codes with challenge pages (common WAF behavior)
      if (!detected && (status === 403 || status === 406)) {
        const bodyText = await safeEvaluate<string>(
          page,
          `(() => { return (document.body.textContent || "").substring(0, 1000); })()`,
          "",
          3_000,
        );

        const challengeIndicators = [
          /challenge/i,
          /captcha/i,
          /blocked/i,
          /firewall/i,
          /security check/i,
          /ray id/i,
          /attention required/i,
          /access denied/i,
          /automated/i,
          /bot detection/i,
        ];

        for (const pattern of challengeIndicators) {
          if (pattern.test(bodyText)) {
            detected = true;
            provider = provider || "Unknown WAF";
            break;
          }
        }
      }
    }
  } catch {
    // WAF detection probe failed — non-fatal
  }

  // Navigate back to the original URL
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  } catch {
    // Best effort
  }

  if (detected) {
    recommendations.push(
      `WAF detected (${provider}) — throttle security payloads to avoid IP bans`,
    );
    recommendations.push("Use --skip-security to bypass security tests if WAF blocks probes");
    recommendations.push("Add 2-second delays between security test payloads");
    recommendations.push(
      "Consider allowlisting your IP in the WAF dashboard for authorized testing",
    );
  }

  return { detected, provider, recommendations };
}

// ---------------------------------------------------------------------------
// 9. Main orchestrator — Run all advanced security tests
// ---------------------------------------------------------------------------

export async function runAdvancedSecurityAudit(
  page: Page,
  url: string,
  onProgress: ProgressCallback,
): Promise<SecurityTestResult[]> {
  const allResults: SecurityTestResult[] = [];

  onProgress("info", "Starting advanced security audit...");

  // 0. WAF Detection — run before any security tests
  onProgress("step", "  Detecting Web Application Firewall (WAF)...");
  let wafDetected = false;
  let wafProvider: string | null = null;
  try {
    const wafResult = await detectWAF(page, url);
    wafDetected = wafResult.detected;
    wafProvider = wafResult.provider;

    if (wafDetected) {
      onProgress("warn", `  WAF detected: ${wafProvider}. Adjusting security test strategy.`);
      for (const rec of wafResult.recommendations) {
        onProgress("warn", `    - ${rec}`);
      }
      allResults.push({
        test: "WAF Detection",
        passed: true,
        severity: "info",
        details:
          `Web Application Firewall detected: ${wafProvider}. ` +
          "Security test payloads will be throttled. SQL injection testing skipped to avoid IP bans.",
      });
    } else {
      onProgress("pass", "  No WAF detected — proceeding with full security tests.");
    }
  } catch {
    onProgress("warn", "  WAF detection failed — proceeding with default security tests.");
  }

  // Helper: add delay between security payloads when WAF is detected
  const wafDelay = async (): Promise<void> => {
    if (wafDetected) {
      await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
    }
  };

  // 1. CSRF
  onProgress("step", "  Testing CSRF protection...");
  try {
    await wafDelay();
    const csrfResult = await testCSRF(page, url);
    allResults.push(csrfResult);
    onProgress(
      csrfResult.passed ? "pass" : "fail",
      `  ${csrfResult.passed ? "PASS" : "FAIL"} CSRF: ${csrfResult.details.slice(0, 100)}`,
    );
  } catch {
    allResults.push({
      test: "CSRF Protection",
      passed: false,
      severity: "high",
      details: "CSRF test threw an unexpected error.",
    });
    onProgress("fail", "  FAIL CSRF: Test threw an unexpected error.");
  }

  // 2. SQL Injection — skip when WAF is detected (high risk of IP ban)
  if (wafDetected) {
    onProgress("warn", "  SKIP SQL Injection: Skipped due to WAF detection (high risk of IP ban).");
    allResults.push({
      test: "SQL Injection",
      passed: true,
      severity: "info",
      details:
        `SQL injection testing skipped — WAF detected (${wafProvider}). ` +
        "Running SQL injection probes against a WAF risks IP bans and false positives. " +
        "Allowlist your testing IP in the WAF dashboard and re-run without WAF to get accurate results.",
    });
  } else {
    onProgress("step", "  Testing for SQL injection...");
    try {
      const sqlResults = await testSQLInjection(page, url);
      allResults.push(...sqlResults);
      const sqlFails = sqlResults.filter((r) => !r.passed);
      if (sqlFails.length > 0) {
        onProgress("fail", `  FAIL SQL Injection: ${sqlFails.length} vulnerability(ies) found.`);
      } else {
        onProgress("pass", "  PASS SQL Injection: No vulnerabilities detected.");
      }
    } catch {
      allResults.push({
        test: "SQL Injection",
        passed: false,
        severity: "critical",
        details: "SQL injection test threw an unexpected error.",
      });
      onProgress("fail", "  FAIL SQL Injection: Test threw an unexpected error.");
    }
  }

  // 3. Clickjacking
  onProgress("step", "  Testing clickjacking protection...");
  try {
    await wafDelay();
    const clickjackResult = await testClickjacking(page, url);
    allResults.push(clickjackResult);
    onProgress(
      clickjackResult.passed ? "pass" : "fail",
      `  ${clickjackResult.passed ? "PASS" : "FAIL"} Clickjacking: ${clickjackResult.details.slice(0, 100)}`,
    );
  } catch {
    allResults.push({
      test: "Clickjacking Protection",
      passed: false,
      severity: "medium",
      details: "Clickjacking test threw an unexpected error.",
    });
    onProgress("fail", "  FAIL Clickjacking: Test threw an unexpected error.");
  }

  // 4. CORS
  onProgress("step", "  Checking CORS configuration...");
  try {
    await wafDelay();
    const corsResult = await testCORSConfig(page, url);
    allResults.push(corsResult);
    onProgress(
      corsResult.passed ? "pass" : "fail",
      `  ${corsResult.passed ? "PASS" : "FAIL"} CORS: ${corsResult.details.slice(0, 100)}`,
    );
  } catch {
    allResults.push({
      test: "CORS Configuration",
      passed: false,
      severity: "medium",
      details: "CORS configuration test threw an unexpected error.",
    });
    onProgress("fail", "  FAIL CORS: Test threw an unexpected error.");
  }

  // 5. Path Traversal
  onProgress("step", "  Testing for path traversal...");
  try {
    await wafDelay();
    const pathResults = await testPathTraversal(page, url);
    allResults.push(...pathResults);
    const pathFails = pathResults.filter((r) => !r.passed);
    if (pathFails.length > 0) {
      onProgress("fail", `  FAIL Path Traversal: ${pathFails.length} vulnerability(ies) found.`);
    } else {
      onProgress("pass", "  PASS Path Traversal: No vulnerabilities detected.");
    }
  } catch {
    allResults.push({
      test: "Path Traversal",
      passed: false,
      severity: "critical",
      details: "Path traversal test threw an unexpected error.",
    });
    onProgress("fail", "  FAIL Path Traversal: Test threw an unexpected error.");
  }

  // 6. Information Disclosure
  onProgress("step", "  Checking for information disclosure...");
  try {
    await wafDelay();
    const infoResults = await testInfoDisclosure(page, url);
    allResults.push(...infoResults);
    const infoFails = infoResults.filter((r) => !r.passed);
    if (infoFails.length > 0) {
      onProgress("fail", `  FAIL Info Disclosure: ${infoFails.length} issue(s) found.`);
    } else {
      onProgress("pass", "  PASS Info Disclosure: No issues detected.");
    }
  } catch {
    allResults.push({
      test: "Information Disclosure",
      passed: false,
      severity: "medium",
      details: "Information disclosure test threw an unexpected error.",
    });
    onProgress("fail", "  FAIL Info Disclosure: Test threw an unexpected error.");
  }

  // 7. Dependency Scan
  onProgress("step", "  Scanning client-side dependencies...");
  try {
    await wafDelay();
    // Navigate back to original URL for dependency scan
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const depResults = await scanDependencies(page);
    allResults.push(...depResults);
    const depFails = depResults.filter((r) => !r.passed);
    if (depFails.length > 0) {
      onProgress("fail", `  FAIL Dependencies: ${depFails.length} vulnerable library(ies) found.`);
    } else {
      onProgress("pass", "  PASS Dependencies: No vulnerable libraries detected.");
    }
  } catch {
    allResults.push({
      test: "Dependency Scan",
      passed: false,
      severity: "medium",
      details: "Dependency scan threw an unexpected error.",
    });
    onProgress("fail", "  FAIL Dependencies: Scan threw an unexpected error.");
  }

  // Summary
  const totalTests = allResults.length;
  const passed = allResults.filter((r) => r.passed).length;
  const failed = totalTests - passed;

  const criticals = allResults.filter((r) => !r.passed && r.severity === "critical").length;
  const highs = allResults.filter((r) => !r.passed && r.severity === "high").length;
  const mediums = allResults.filter((r) => !r.passed && r.severity === "medium").length;

  if (failed === 0) {
    onProgress(
      "done",
      `Advanced security audit complete. ${totalTests} test(s) passed, no vulnerabilities found.`,
    );
  } else {
    onProgress(
      "done",
      `Advanced security audit complete. ${passed}/${totalTests} passed, ${failed} failed ` +
        `(${criticals} critical, ${highs} high, ${mediums} medium).`,
    );
  }

  return allResults;
}
