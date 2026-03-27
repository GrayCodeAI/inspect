// ============================================================================
// Authentication & Session Management Agent — Cookie injection, session
// persistence, auth-state detection, CAPTCHA detection, TOTP, multi-role testing
// ============================================================================

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { ProgressCallback } from "./types.js";
import { safeEvaluate, safeEvaluateVoid } from "./evaluate.js";

// ---------------------------------------------------------------------------
// injectCookies — Add cookies to the browser context
// ---------------------------------------------------------------------------

export async function injectCookies(
  page: any,
  cookies: Array<{ name: string; value: string; domain: string; path?: string }>,
): Promise<void> {
  if (cookies.length === 0) return;

  const context = page.context();
  const mapped = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path ?? "/",
  }));

  await context.addCookies(mapped);
}

// ---------------------------------------------------------------------------
// injectStorage — Set localStorage and sessionStorage items via evaluate
// ---------------------------------------------------------------------------

export async function injectStorage(
  page: any,
  storage: {
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
  },
): Promise<void> {
  if (storage.localStorage && Object.keys(storage.localStorage).length > 0) {
    const entries = JSON.stringify(storage.localStorage);
    await safeEvaluateVoid(
      page,
      `(() => {
        const entries = ${entries};
        for (const [k, v] of Object.entries(entries)) {
          try { localStorage.setItem(k, v); } catch {}
        }
      })()`,
    );
  }

  if (storage.sessionStorage && Object.keys(storage.sessionStorage).length > 0) {
    const entries = JSON.stringify(storage.sessionStorage);
    await safeEvaluateVoid(
      page,
      `(() => {
        const entries = ${entries};
        for (const [k, v] of Object.entries(entries)) {
          try { sessionStorage.setItem(k, v); } catch {}
        }
      })()`,
    );
  }
}

// ---------------------------------------------------------------------------
// saveSession — Export cookies + localStorage + sessionStorage to a JSON file
// ---------------------------------------------------------------------------

export async function saveSession(page: any, filePath: string): Promise<void> {
  const context = page.context();
  const cookies = await context.cookies();

  const localStorageData: Record<string, string> = await safeEvaluate(
    page,
    `(() => {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key !== null) {
          data[key] = localStorage.getItem(key) ?? "";
        }
      }
      return data;
    })()`,
    {} as Record<string, string>,
  );

  const sessionStorageData: Record<string, string> = await safeEvaluate(
    page,
    `(() => {
      const data = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key !== null) {
          data[key] = sessionStorage.getItem(key) ?? "";
        }
      }
      return data;
    })()`,
    {} as Record<string, string>,
  );

  const session = {
    cookies,
    localStorage: localStorageData,
    sessionStorage: sessionStorageData,
    savedAt: new Date().toISOString(),
    url: page.url(),
  };

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// loadSession — Read a session JSON file and inject cookies + storage
// ---------------------------------------------------------------------------

export async function loadSession(page: any, filePath: string): Promise<void> {
  const raw = fs.readFileSync(filePath, "utf-8");
  const session = JSON.parse(raw) as {
    cookies?: any[];
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
  };

  if (session.cookies && session.cookies.length > 0) {
    await injectCookies(page, session.cookies);
  }

  await injectStorage(page, {
    localStorage: session.localStorage ?? {},
    sessionStorage: session.sessionStorage ?? {},
  });
}

// ---------------------------------------------------------------------------
// detectAuthState — Check for common logged-in indicators
// ---------------------------------------------------------------------------

const AUTH_INDICATORS_SCRIPT = `(() => {
  const indicators = [];

  // Check for avatar images
  const avatarSelectors = [
    'img[class*="avatar"]', 'img[class*="profile"]', 'img[alt*="avatar" i]',
    'img[alt*="profile" i]', '[class*="avatar"]', '[class*="user-icon"]',
    '[data-testid*="avatar"]', '[data-testid*="profile"]',
  ];
  for (const sel of avatarSelectors) {
    const el = document.querySelector(sel);
    if (el) { indicators.push("avatar:" + sel); break; }
  }

  // Check for username display
  const usernameSelectors = [
    '[class*="username"]', '[class*="user-name"]', '[class*="display-name"]',
    '[data-testid*="username"]', '[data-testid*="user-name"]',
    '[class*="account-name"]',
  ];
  for (const sel of usernameSelectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent && el.textContent.trim().length > 0) {
      indicators.push("username:" + sel);
      break;
    }
  }

  // Check for logout/sign-out buttons or links
  const logoutTexts = ["log out", "logout", "sign out", "signout", "log off"];
  const allLinks = Array.from(document.querySelectorAll("a, button"));
  for (const el of allLinks) {
    const text = (el.textContent || "").toLowerCase().trim();
    if (logoutTexts.some((t) => text.includes(t))) {
      indicators.push("logout-button:" + text);
      break;
    }
  }

  // Check for dashboard link
  const dashLinks = Array.from(document.querySelectorAll('a[href*="dashboard"], a[href*="account"], a[href*="profile"], a[href*="settings"]'));
  if (dashLinks.length > 0) {
    indicators.push("dashboard-link:" + dashLinks[0].getAttribute("href"));
  }

  // Check for auth-related cookies
  const cookieStr = document.cookie;
  const authCookiePatterns = ["session", "token", "auth", "jwt", "sid", "logged_in", "user_id"];
  for (const pattern of authCookiePatterns) {
    if (cookieStr.toLowerCase().includes(pattern)) {
      indicators.push("auth-cookie:" + pattern);
      break;
    }
  }

  // Check localStorage for auth tokens
  const authStorageKeys = ["token", "access_token", "auth_token", "jwt", "id_token", "refresh_token", "user", "session"];
  for (const key of authStorageKeys) {
    try {
      const val = localStorage.getItem(key);
      if (val && val.length > 0) {
        indicators.push("storage-token:" + key);
        break;
      }
    } catch {}
  }

  // Check for login/sign-in forms (absence indicates logged in if other indicators present)
  const loginForms = document.querySelectorAll('form[action*="login"], form[action*="signin"], form[action*="sign-in"], input[type="password"]');
  if (loginForms.length > 0) {
    indicators.push("login-form-present");
  }

  return indicators;
})()`;

export async function detectAuthState(
  page: any,
): Promise<{ loggedIn: boolean; indicators: string[] }> {
  const indicators: string[] = await safeEvaluate(page, AUTH_INDICATORS_SCRIPT, [] as string[]);

  // Determine if logged in: must have at least one positive indicator
  // and should NOT have a login form present (unless other strong signals exist)
  const positiveIndicators = indicators.filter((i) => !i.startsWith("login-form-present"));
  const hasLoginForm = indicators.includes("login-form-present");

  let loggedIn: boolean;
  if (positiveIndicators.length >= 2) {
    // Strong signal: multiple indicators present
    loggedIn = true;
  } else if (positiveIndicators.length === 1 && !hasLoginForm) {
    // Moderate signal: one indicator, no login form
    loggedIn = true;
  } else {
    loggedIn = false;
  }

  return { loggedIn, indicators };
}

// ---------------------------------------------------------------------------
// detectCaptcha — Detect reCAPTCHA, hCaptcha, Turnstile, and custom CAPTCHAs
// ---------------------------------------------------------------------------

const CAPTCHA_DETECT_SCRIPT = `(() => {
  // reCAPTCHA v2 widget
  const recaptchaV2 = document.querySelector('.g-recaptcha, [data-sitekey], #g-recaptcha, iframe[src*="recaptcha"]');
  if (recaptchaV2) {
    const sel = recaptchaV2.tagName.toLowerCase() +
      (recaptchaV2.id ? "#" + recaptchaV2.id : "") +
      (recaptchaV2.className ? "." + recaptchaV2.className.split(" ").join(".") : "");
    return { found: true, type: "reCAPTCHA-v2", element: sel };
  }

  // reCAPTCHA v3 (invisible, loaded as script)
  const recaptchaV3Script = document.querySelector('script[src*="recaptcha/api.js?render="], script[src*="recaptcha/enterprise.js"]');
  if (recaptchaV3Script) {
    return { found: true, type: "reCAPTCHA-v3", element: "script[src*=recaptcha]" };
  }

  // hCaptcha
  const hcaptcha = document.querySelector('.h-captcha, [data-hcaptcha-sitekey], iframe[src*="hcaptcha"]');
  if (hcaptcha) {
    const sel = hcaptcha.tagName.toLowerCase() +
      (hcaptcha.id ? "#" + hcaptcha.id : "") +
      (hcaptcha.className ? "." + hcaptcha.className.split(" ").join(".") : "");
    return { found: true, type: "hCaptcha", element: sel };
  }

  // Cloudflare Turnstile
  const turnstile = document.querySelector('.cf-turnstile, [data-turnstile-sitekey], iframe[src*="challenges.cloudflare.com"]');
  if (turnstile) {
    const sel = turnstile.tagName.toLowerCase() +
      (turnstile.id ? "#" + turnstile.id : "") +
      (turnstile.className ? "." + turnstile.className.split(" ").join(".") : "");
    return { found: true, type: "cloudflare-turnstile", element: sel };
  }

  // Generic CAPTCHA detection by common patterns
  const captchaSelectors = [
    '[class*="captcha" i]', '[id*="captcha" i]', '[name*="captcha" i]',
    'img[src*="captcha" i]', 'img[alt*="captcha" i]',
    '[data-testid*="captcha" i]', '[aria-label*="captcha" i]',
  ];
  for (const sel of captchaSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const elSel = el.tagName.toLowerCase() +
        (el.id ? "#" + el.id : "") +
        (el.className ? "." + String(el.className).split(" ").join(".") : "");
      return { found: true, type: "custom-captcha", element: elSel };
    }
  }

  return { found: false, type: null, element: null };
})()`;

export async function detectCaptcha(
  page: any,
): Promise<{ found: boolean; type: string | null; element: string | null }> {
  const result = await safeEvaluate(
    page,
    CAPTCHA_DETECT_SCRIPT,
    { found: false, type: null, element: null } as { found: boolean; type: string | null; element: string | null },
  );

  return result;
}

// ---------------------------------------------------------------------------
// generateTOTP — RFC 6238 TOTP using HMAC-SHA1 from a base32 secret
// ---------------------------------------------------------------------------

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.replace(/[\s=-]+/g, "").toUpperCase();

  let bits = "";
  for (const char of cleaned) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    bits += idx.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

export async function generateTOTP(secret: string): Promise<string> {
  const key = base32Decode(secret);

  // Current time step (30-second window, per RFC 6238)
  const timeStep = 30;
  const counter = Math.floor(Date.now() / 1000 / timeStep);

  // Encode counter as 8-byte big-endian buffer
  const counterBuffer = Buffer.alloc(8);
  let remaining = counter;
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }

  // HMAC-SHA1
  const hmac = crypto.createHmac("sha1", key);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  // Dynamic truncation (RFC 4226 section 5.4)
  const offset = hash[hash.length - 1]! & 0x0f;
  const binary =
    ((hash[offset]! & 0x7f) << 24) |
    ((hash[offset + 1]! & 0xff) << 16) |
    ((hash[offset + 2]! & 0xff) << 8) |
    (hash[offset + 3]! & 0xff);

  // 6-digit code
  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, "0");
}

// ---------------------------------------------------------------------------
// testMultiRole — Test URL access under different role credentials
// ---------------------------------------------------------------------------

export async function testMultiRole(
  page: any,
  roles: Array<{ name: string; cookies?: any[]; storage?: any }>,
  url: string,
  onProgress: ProgressCallback,
): Promise<Array<{ role: string; accessible: boolean; redirected: boolean; finalUrl: string }>> {
  const results: Array<{ role: string; accessible: boolean; redirected: boolean; finalUrl: string }> = [];

  onProgress("info", `Testing ${roles.length} role(s) against ${url}`);

  for (const role of roles) {
    onProgress("step", `  Testing role: ${role.name}`);

    // Clear existing cookies and storage before each role
    const context = page.context();
    await context.clearCookies();
    await safeEvaluateVoid(
      page,
      `(() => {
        try { localStorage.clear(); } catch {}
        try { sessionStorage.clear(); } catch {}
      })()`,
    );

    // Inject role-specific cookies
    if (role.cookies && role.cookies.length > 0) {
      await injectCookies(page, role.cookies);
    }

    // Inject role-specific storage
    if (role.storage) {
      await injectStorage(page, role.storage);
    }

    // Navigate to the target URL
    let finalUrl = url;
    let accessible = false;
    let redirected = false;

    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });

      finalUrl = page.url();
      const status = response?.status() ?? 0;

      // Determine if the page was accessible
      redirected = finalUrl !== url;
      accessible = status >= 200 && status < 400;

      // If redirected to a login page, mark as inaccessible
      if (redirected) {
        const lowerFinal = finalUrl.toLowerCase();
        if (
          lowerFinal.includes("/login") ||
          lowerFinal.includes("/signin") ||
          lowerFinal.includes("/sign-in") ||
          lowerFinal.includes("/auth") ||
          lowerFinal.includes("/sso") ||
          lowerFinal.includes("/unauthorized") ||
          lowerFinal.includes("/403")
        ) {
          accessible = false;
        }
      }

      // Check for 401/403 status codes
      if (status === 401 || status === 403) {
        accessible = false;
      }

      // Check page content for access-denied indicators
      const accessDenied: boolean = await safeEvaluate(
        page,
        `(() => {
          const text = document.body ? document.body.innerText.toLowerCase() : "";
          const deniedPhrases = [
            "access denied", "forbidden", "unauthorized", "not authorized",
            "permission denied", "login required", "sign in required",
            "you do not have permission", "403", "401",
          ];
          return deniedPhrases.some((phrase) => text.includes(phrase));
        })()`,
        false,
      );

      if (accessDenied) {
        accessible = false;
      }
    } catch {
      // Navigation failed — not accessible
      accessible = false;
      finalUrl = url;
    }

    const status = accessible ? "pass" : "fail";
    onProgress(status, `    ${role.name}: ${accessible ? "accessible" : "blocked"} -> ${finalUrl}`);

    results.push({
      role: role.name,
      accessible,
      redirected,
      finalUrl,
    });
  }

  onProgress("done", `Multi-role test complete: ${results.filter((r) => r.accessible).length}/${results.length} roles have access`);

  return results;
}
