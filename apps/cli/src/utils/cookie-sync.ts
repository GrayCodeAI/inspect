import type { Page } from "playwright";
import type { CookieData } from "@inspect/shared";
import chalk from "chalk";

export interface SyncResult {
  success: boolean;
  cookieCount: number;
  browser: string;
  domain?: string;
  error?: string;
}

/**
 * Sync cookies from local browser to a Playwright browser context.
 * Extracts cookies from the user's installed Chrome/Firefox and injects
 * them into the test browser for authenticated testing.
 */
export async function syncCookies(
  page: Page,
  options?: {
    browser?: string;
    domain?: string;
    profile?: string;
  },
): Promise<SyncResult> {
  const browserName = options?.browser ?? "Chrome";
  const domain = options?.domain;

  try {
    const { CookieExtractor } = await import("@inspect/browser");
    const extractor = new CookieExtractor();

    // Check which browsers are available
    const available = extractor.listAvailableBrowsers();
    if (available.length === 0) {
      return {
        success: false,
        cookieCount: 0,
        browser: browserName,
        error: "No browsers with extractable cookies found on this system",
      };
    }

    // Use requested browser or first available
    const targetBrowser = available.includes(browserName) ? browserName : available[0];

    console.log(chalk.dim(`  Extracting cookies from ${targetBrowser}...`));

    const cookies = await extractor.extractCookies(targetBrowser, options?.profile, domain);

    if (cookies.length === 0) {
      return {
        success: true,
        cookieCount: 0,
        browser: targetBrowser,
        domain,
        error: domain
          ? `No cookies found for domain "${domain}" in ${targetBrowser}`
          : `No cookies found in ${targetBrowser}`,
      };
    }

    // Deduplicate
    const deduped = extractor.deduplicate(cookies);

    // Convert to Playwright format and inject
    const playwrightCookies = extractor.toPlaywrightFormat(deduped);

    // Filter out cookies with empty values (encrypted Chromium cookies)
    const usable = playwrightCookies.filter((c: CookieData) => c.value && c.value.length > 0);

    if (usable.length > 0) {
      await page.context().addCookies(usable);
    }

    return {
      success: true,
      cookieCount: usable.length,
      browser: targetBrowser,
      domain,
    };
  } catch (err) {
    return {
      success: false,
      cookieCount: 0,
      browser: browserName,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check if cookie confirmation is needed for a given URL.
 * Returns true if no cookies are found (user needs to confirm/login),
 * false if cookies already exist for the target domain.
 */
export async function needsCookieConfirmation(
  url: string,
  options?: {
    browser?: string;
    profile?: string;
  },
): Promise<boolean> {
  try {
    const { CookieExtractor } = await import("@inspect/browser");
    const extractor = new CookieExtractor();

    const available = extractor.listAvailableBrowsers();
    if (available.length === 0) {
      return true;
    }

    const targetBrowser = options?.browser
      ? available.includes(options.browser)
        ? options.browser
        : available[0]
      : available[0];

    const domain = extractDomain(url);
    const cookies = await extractor.extractCookies(targetBrowser, options?.profile, domain);

    const usable = cookies.filter((c: CookieData) => c.value && c.value.length > 0);
    return usable.length === 0;
  } catch {
    return true;
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * List available browsers for cookie extraction.
 */
export async function listCookieBrowsers(): Promise<string[]> {
  try {
    const { CookieExtractor } = await import("@inspect/browser");
    const extractor = new CookieExtractor();
    return extractor.listAvailableBrowsers();
  } catch {
    return [];
  }
}
