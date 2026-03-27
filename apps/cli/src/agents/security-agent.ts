// ============================================================================
// Security Agent (Agent 10) — Tests for common security vulnerabilities
// For AUTHORIZED security testing only (defensive/educational)
// ============================================================================

import type {
  SecurityReport,
  SecurityIssue,
  SecurityHeaders,
  HttpsStatus,
  CookieAudit,
  XssTestResult,
  ExposedData,
  ProgressCallback,
} from "./types.js";

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runSecurityAudit(
  page: any,
  url: string,
  onProgress: ProgressCallback,
): Promise<SecurityReport> {
  onProgress("info", "Running security audit...");

  const issues: SecurityIssue[] = [];

  // 1. Security headers
  onProgress("step", "  Checking security headers...");
  const headers = await checkSecurityHeaders(page, url);
  issues.push(...collectHeaderIssues(headers, url));

  // 2. HTTPS enforcement
  onProgress("step", "  Checking HTTPS enforcement...");
  const https = await checkHttps(page, url);
  issues.push(...collectHttpsIssues(https, url));

  // 3. Cookie audit
  onProgress("step", "  Auditing cookies...");
  const cookies = await auditCookies(page);
  issues.push(...collectCookieIssues(cookies, url));

  // 4. XSS testing
  onProgress("step", "  Testing for reflected XSS...");
  const xssResults = await testXss(page, url);
  issues.push(...collectXssIssues(xssResults));

  // 5. Exposed data scan
  onProgress("step", "  Scanning for exposed sensitive data...");
  const exposedData = await scanExposedData(page);
  issues.push(...collectExposureIssues(exposedData, url));

  // Calculate score
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const highCount = issues.filter((i) => i.severity === "high").length;
  const mediumCount = issues.filter((i) => i.severity === "medium").length;
  const lowCount = issues.filter((i) => i.severity === "low").length;
  const score = Math.max(
    0,
    100 - criticalCount * 20 - highCount * 10 - mediumCount * 5 - lowCount * 2,
  );

  const report: SecurityReport = {
    url,
    issues,
    headers,
    https,
    cookies,
    xssResults,
    exposedData,
    score,
  };

  if (issues.length === 0) {
    onProgress("pass", `  ✓ Security: No issues found (${score}/100)`);
  } else {
    onProgress(
      "warn",
      `  ⚠ Security: ${issues.length} issue(s) found (${score}/100)`,
    );
    for (const issue of issues.slice(0, 8)) {
      onProgress("warn", `    [${issue.severity}] ${issue.title}`);
    }
  }

  onProgress("done", "Security audit complete.");
  return report;
}

// ---------------------------------------------------------------------------
// 1. Security headers
// ---------------------------------------------------------------------------

export async function checkSecurityHeaders(
  page: any,
  url: string,
): Promise<SecurityHeaders> {
  let responseHeaders: Record<string, string> = {};

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    if (response) {
      const allHeaders = await response.allHeaders();
      // Normalize header names to lowercase for reliable lookup
      for (const [key, value] of Object.entries(allHeaders)) {
        responseHeaders[key.toLowerCase()] = value as string;
      }
    }
  } catch {
    // If navigation fails, work with empty headers
  }

  const headers: SecurityHeaders = {
    hsts: !!responseHeaders["strict-transport-security"],
    csp: responseHeaders["content-security-policy"] ?? null,
    xFrameOptions: responseHeaders["x-frame-options"] ?? null,
    xContentTypeOptions:
      responseHeaders["x-content-type-options"]?.toLowerCase() === "nosniff",
    referrerPolicy: responseHeaders["referrer-policy"] ?? null,
    permissionsPolicy: responseHeaders["permissions-policy"] ?? null,
  };

  return headers;
}

function collectHeaderIssues(
  headers: SecurityHeaders,
  url: string,
): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  if (!headers.hsts) {
    issues.push({
      severity: "high",
      category: "headers",
      title: "Missing Strict-Transport-Security header",
      description:
        "The server does not send the HSTS header. Browsers will not enforce HTTPS, making the site vulnerable to protocol downgrade and cookie hijacking attacks.",
      url,
      fix: 'Add header: Strict-Transport-Security: max-age=63072000; includeSubDomains; preload',
    });
  }

  if (!headers.csp) {
    issues.push({
      severity: "medium",
      category: "headers",
      title: "Missing Content-Security-Policy header",
      description:
        "No CSP header is set. This makes the site more vulnerable to XSS and data injection attacks by allowing unrestricted resource loading.",
      url,
      fix: "Add a Content-Security-Policy header that restricts script-src and object-src at minimum.",
    });
  }

  if (!headers.xFrameOptions) {
    issues.push({
      severity: "medium",
      category: "headers",
      title: "Missing X-Frame-Options header",
      description:
        "The page can be embedded in iframes on any origin, making it vulnerable to clickjacking attacks.",
      url,
      fix: 'Add header: X-Frame-Options: DENY (or SAMEORIGIN if embedding is needed).',
    });
  }

  if (!headers.xContentTypeOptions) {
    issues.push({
      severity: "low",
      category: "headers",
      title: "Missing X-Content-Type-Options: nosniff",
      description:
        "Without this header, browsers may MIME-sniff responses, potentially executing content as a different type than declared.",
      url,
      fix: 'Add header: X-Content-Type-Options: nosniff',
    });
  }

  if (!headers.referrerPolicy) {
    issues.push({
      severity: "low",
      category: "headers",
      title: "Missing Referrer-Policy header",
      description:
        "Without a Referrer-Policy, the full URL (including query params) may be leaked to third-party sites via the Referer header.",
      url,
      fix: 'Add header: Referrer-Policy: strict-origin-when-cross-origin',
    });
  }

  if (!headers.permissionsPolicy) {
    issues.push({
      severity: "low",
      category: "headers",
      title: "Missing Permissions-Policy header",
      description:
        "Without a Permissions-Policy, the page does not restrict access to browser features like camera, microphone, or geolocation.",
      url,
      fix: 'Add header: Permissions-Policy: camera=(), microphone=(), geolocation=()',
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 2. HTTPS enforcement
// ---------------------------------------------------------------------------

export async function checkHttps(
  page: any,
  url: string,
): Promise<HttpsStatus> {
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === "https:";

  let httpRedirects = false;

  // Check if HTTP redirects to HTTPS
  if (isHttps) {
    try {
      const httpUrl = url.replace(/^https:/, "http:");
      const response = await page.goto(httpUrl, {
        waitUntil: "domcontentloaded",
        timeout: 10_000,
      });
      const finalUrl = page.url() as string;
      httpRedirects = finalUrl.startsWith("https://");

      // Navigate back to the original URL
      await page.goto(url, { waitUntil: "domcontentloaded" });
    } catch {
      // Connection refused or timeout for HTTP is actually good (HTTPS-only)
      httpRedirects = true;
    }
  }

  // Scan for mixed content (HTTP resources on an HTTPS page)
  let mixedContent: string[] = [];
  if (isHttps) {
    try {
      mixedContent = (await page.evaluate(`
        (() => {
          const mixed = [];
          const elements = document.querySelectorAll("[src], [href]");
          for (const el of Array.from(elements)) {
            const src = el.getAttribute("src") || "";
            const href = el.getAttribute("href") || "";
            const tag = el.tagName.toLowerCase();
            // Only flag resource-loading attributes, not anchor links
            if (src.startsWith("http://")) {
              mixed.push(tag + "[src]: " + src.slice(0, 100));
            }
            if (
              href.startsWith("http://") &&
              (tag === "link" || tag === "script")
            ) {
              mixed.push(tag + "[href]: " + href.slice(0, 100));
            }
          }
          return mixed.slice(0, 20);
        })()
      `)) as string[];
    } catch {
      // page.evaluate can fail if page navigated away
    }
  }

  return {
    enforced: isHttps,
    httpRedirects,
    mixedContent,
  };
}

function collectHttpsIssues(
  https: HttpsStatus,
  url: string,
): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  if (!https.enforced) {
    issues.push({
      severity: "critical",
      category: "https",
      title: "Site does not use HTTPS",
      description:
        "The site is served over plain HTTP. All traffic including credentials and session tokens can be intercepted by network attackers.",
      url,
      fix: "Enable HTTPS with a valid TLS certificate and redirect all HTTP traffic to HTTPS.",
    });
  }

  if (https.enforced && !https.httpRedirects) {
    issues.push({
      severity: "high",
      category: "redirect",
      title: "HTTP does not redirect to HTTPS",
      description:
        "The HTTP version of the site does not redirect to HTTPS. Users who visit via HTTP will have their first request sent in plain text.",
      url,
      fix: "Configure the server to return a 301 redirect from HTTP to HTTPS.",
    });
  }

  if (https.mixedContent.length > 0) {
    issues.push({
      severity: "medium",
      category: "mixed-content",
      title: `Mixed content: ${https.mixedContent.length} HTTP resource(s) on HTTPS page`,
      description:
        "The HTTPS page loads resources over insecure HTTP. Browsers may block these or show security warnings. Resources: " +
        https.mixedContent.slice(0, 5).join("; "),
      url,
      fix: "Change all resource URLs to use HTTPS or protocol-relative URLs.",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 3. Cookie audit
// ---------------------------------------------------------------------------

export async function auditCookies(page: any): Promise<CookieAudit[]> {
  let rawCookies: Array<{
    name: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: string;
    domain: string;
  }> = [];

  try {
    const ctx = page.context();
    rawCookies = await ctx.cookies();
  } catch {
    // Context may not support .cookies() in some setups
    return [];
  }

  const pageUrl = page.url() as string;
  const isHttps = pageUrl.startsWith("https://");

  const SESSION_PATTERNS = /session|auth|token|sid|jwt|login|user/i;

  const audits: CookieAudit[] = rawCookies.map((cookie) => {
    const cookieIssues: string[] = [];
    const isSessionCookie = SESSION_PATTERNS.test(cookie.name);

    if (isHttps && !cookie.secure) {
      cookieIssues.push("Missing Secure flag (cookie sent over HTTP)");
    }

    if (isSessionCookie && !cookie.httpOnly) {
      cookieIssues.push(
        "Session cookie missing HttpOnly flag (accessible to JavaScript)",
      );
    }

    const sameSite = (cookie.sameSite || "").toLowerCase();
    if (sameSite !== "strict" && sameSite !== "lax") {
      cookieIssues.push(
        `SameSite=${cookie.sameSite || "None"} — should be Strict or Lax to prevent CSRF`,
      );
    }

    return {
      name: cookie.name,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite || null,
      domain: cookie.domain,
      issues: cookieIssues,
    };
  });

  return audits;
}

function collectCookieIssues(
  cookies: CookieAudit[],
  url: string,
): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const SESSION_PATTERNS = /session|auth|token|sid|jwt|login|user/i;

  for (const cookie of cookies) {
    if (cookie.issues.length === 0) continue;

    const isSessionCookie = SESSION_PATTERNS.test(cookie.name);
    const severity = isSessionCookie ? "high" : "medium";

    issues.push({
      severity,
      category: "cookies",
      title: `Insecure cookie: ${cookie.name}`,
      description: cookie.issues.join(". "),
      url,
      fix: `Set cookie "${cookie.name}" with: Secure; HttpOnly; SameSite=Lax`,
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 4. XSS testing (reflected)
// ---------------------------------------------------------------------------

// Multiple XSS payloads to test different injection vectors
const XSS_PAYLOADS = [
  { payload: '<img src=x onerror=alert(1)>', check: '<img src=x onerror=alert(1)>', name: "img-onerror" },
  { payload: '"><script>alert(1)</script>', check: '<script>alert(1)</script>', name: "script-inject" },
  { payload: "javascript:alert(1)", check: "javascript:alert(1)", name: "js-protocol" },
  { payload: "'-alert(1)-'", check: "'-alert(1)-'", name: "attr-break" },
  { payload: '<svg onload=alert(1)>', check: '<svg onload=alert(1)>', name: "svg-onload" },
];

export async function testXss(
  page: any,
  url: string,
): Promise<XssTestResult[]> {
  const results: XssTestResult[] = [];

  // Find text input fields
  let inputFields: Array<{ selector: string; name: string; formAction: string | null }> = [];
  try {
    inputFields = (await page.evaluate(`
      (() => {
        const inputs = Array.from(document.querySelectorAll(
          'input[type="text"], input[type="search"], input[type="url"], input[type="email"], input:not([type]), textarea'
        ));
        return inputs.slice(0, 5).map((el, i) => {
          const name = el.name || el.id || el.placeholder || ("input-" + i);
          const form = el.closest("form");
          const formAction = form ? (form.action || null) : null;
          let selector;
          if (el.id) selector = "#" + el.id;
          else if (el.name) selector = el.tagName.toLowerCase() + "[name='" + el.name + "']";
          else selector = el.tagName.toLowerCase() + ":nth-of-type(" + (i + 1) + ")";
          return { selector, name, formAction };
        });
      })()
    `)) as Array<{ selector: string; name: string; formAction: string | null }>;
  } catch {
    return results;
  }

  for (const field of inputFields) {
    for (const xss of XSS_PAYLOADS) {
      const result: XssTestResult = {
        url,
        field: field.name,
        payload: xss.payload,
        reflected: false,
        executed: false,
      };

      try {
        // Fresh page for each test
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 });

        const input = await page.$(field.selector);
        if (!input) continue;

        await input.fill(xss.payload);

        // Submit: try Enter, then look for submit button
        try {
          await input.press("Enter");
        } catch {
          try {
            const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:not([type])');
            if (submitBtn) await submitBtn.click();
          } catch {}
        }

        await page.waitForTimeout(1_000);

        // Check reflected XSS — payload appears unescaped in DOM
        const checkStr = xss.check.replace(/'/g, "\\'");
        const reflected = (await page.evaluate(`
          (() => {
            const html = document.body.innerHTML;
            return html.includes('${checkStr}');
          })()
        `)) as boolean;

        result.reflected = reflected;

        // Check stored XSS — reload and check if payload persists
        if (reflected) {
          try {
            await page.reload({ waitUntil: "domcontentloaded", timeout: 10_000 });
            await page.waitForTimeout(500);
            const storedReflected = (await page.evaluate(`
              (() => document.body.innerHTML.includes('${checkStr}'))()
            `)) as boolean;
            if (storedReflected) {
              result.executed = true; // stored XSS is more severe
            }
          } catch {}
        }
      } catch {
        // Skip on error
      }

      if (result.reflected) {
        results.push(result);
        break; // One reflected payload per field is enough
      }
    }
  }

  // Check DOM-based XSS: test URL hash/query parameter injection
  try {
    const testUrl = new URL(url);
    testUrl.searchParams.set("q", '<img src=x onerror=alert(1)>');
    testUrl.hash = '<img src=x onerror=alert(1)>';
    await page.goto(testUrl.toString(), { waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.waitForTimeout(500);

    const domXss = (await page.evaluate(`
      (() => {
        const html = document.body.innerHTML;
        return html.includes('<img src=x onerror=alert(1)>');
      })()
    `)) as boolean;

    if (domXss) {
      results.push({
        url: testUrl.toString(),
        field: "url-parameter",
        payload: '<img src=x onerror=alert(1)>',
        reflected: true,
        executed: false,
      });
    }
  } catch {}

  // Navigate back
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 });
  } catch {}

  return results;
}

function collectXssIssues(xssResults: XssTestResult[]): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  for (const result of xssResults) {
    if (result.reflected) {
      issues.push({
        severity: "critical",
        category: "xss",
        title: `Reflected XSS in field "${result.field}"`,
        description:
          `The input field "${result.field}" reflects unescaped HTML content back into the page. ` +
          `An attacker could inject malicious scripts via crafted URLs or form submissions.`,
        url: result.url,
        fix: "Sanitize and HTML-encode all user input before rendering it in the page. Use a Content-Security-Policy to mitigate impact.",
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 5. Exposed data scan
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS: Array<{
  type: ExposedData["type"];
  label: string;
  regex: RegExp;
}> = [
  {
    type: "api-key",
    label: "API key",
    regex: /api[_-]?key['":\s=]+['"]?[a-zA-Z0-9_-]{20,}/i,
  },
  {
    type: "api-key",
    label: "AWS access key",
    regex: /AKIA[A-Z0-9]{16}/,
  },
  {
    type: "token",
    label: "Private key block",
    regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
  },
  {
    type: "password",
    label: "Hardcoded password",
    regex: /password['":\s=]+['"][^'"]{3,}/i,
  },
  {
    type: "token",
    label: "JWT token",
    regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+/,
  },
  {
    type: "internal-url",
    label: "Internal/localhost URL",
    regex: /https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d|10\.\d)/,
  },
];

export async function scanExposedData(page: any): Promise<ExposedData[]> {
  const findings: ExposedData[] = [];
  let html = "";

  try {
    html = (await page.content()) as string;
  } catch {
    return findings;
  }

  // Scan page source for sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    const match = pattern.regex.exec(html);
    if (match) {
      // Exclude matches inside <input type="password"> value attributes —
      // those are legitimate password fields, not exposed secrets
      const surroundingContext = html.slice(
        Math.max(0, match.index - 60),
        match.index + match[0].length + 20,
      );
      if (
        pattern.type === "password" &&
        /type\s*=\s*['"]password['"]/i.test(surroundingContext)
      ) {
        continue;
      }

      // Truncate the matched value for safety
      const rawValue = match[0];
      const truncated =
        rawValue.length > 40
          ? rawValue.slice(0, 20) + "..." + rawValue.slice(-8)
          : rawValue;

      findings.push({
        type: pattern.type,
        value: truncated,
        location: `Page source (${pattern.label})`,
      });
    }
  }

  // Also check console messages for leaked data
  try {
    const consoleLogs: string[] = [];

    // Collect console messages that were emitted during page load
    // We use page.evaluate to check for common debug patterns in scripts
    const debugPatterns = (await page.evaluate(`
      (() => {
        const scripts = Array.from(document.querySelectorAll("script:not([src])"));
        const inlineCode = scripts.map(s => s.textContent || "").join("\\n");
        const findings = [];
        if (/console\\.log\\(.*(?:password|secret|token|apiKey|api_key)/i.test(inlineCode)) {
          findings.push("Console logging of sensitive data detected in inline scripts");
        }
        if (/console\\.log\\(.*(?:localStorage|sessionStorage)/i.test(inlineCode)) {
          findings.push("Console logging of storage data detected in inline scripts");
        }
        return findings;
      })()
    `)) as string[];

    for (const msg of debugPatterns) {
      findings.push({
        type: "debug-info",
        value: msg,
        location: "Inline script analysis",
      });
    }
  } catch {
    // Best effort
  }

  return findings;
}

function collectExposureIssues(
  exposedData: ExposedData[],
  url: string,
): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  for (const data of exposedData) {
    let severity: SecurityIssue["severity"];
    switch (data.type) {
      case "api-key":
      case "password":
      case "token":
        severity = "critical";
        break;
      case "internal-url":
      case "debug-info":
        severity = "medium";
        break;
      default:
        severity = "high";
        break;
    }

    issues.push({
      severity,
      category: "exposure",
      title: `Exposed ${data.type}: ${data.value.slice(0, 50)}`,
      description: `Sensitive data found in ${data.location}. This data could be harvested by attackers or automated scanners.`,
      url,
      fix: "Remove sensitive data from client-side code. Use environment variables and server-side configuration instead.",
    });
  }

  return issues;
}
