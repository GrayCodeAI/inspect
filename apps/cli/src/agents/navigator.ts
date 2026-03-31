// ============================================================================
// Navigator Agent (Agent 4) — Advanced navigation with popup/cookie/modal handling
// ============================================================================

import type { Page, ConsoleMessage, Response, Dialog } from "./playwright-types.js";
import type { NavigationResult, ProgressCallback } from "./types.js";

// ---------------------------------------------------------------------------
// Common selectors for popups, modals, and cookie consent
// ---------------------------------------------------------------------------

const POPUP_SELECTORS = [
  '[role="dialog"]',
  ".modal",
  ".popup",
  ".overlay",
  ".lightbox",
  '[class*="modal"]',
  '[class*="popup"]',
  '[class*="overlay"]',
  '[class*="newsletter"]',
  '[class*="subscribe"]',
  '[data-testid="modal"]',
  '[data-testid="popup"]',
];

const CLOSE_BUTTON_SELECTORS = [
  'button[aria-label="close" i]',
  'button[aria-label="dismiss" i]',
  'button[aria-label="Close" i]',
  '[role="dialog"] button:has-text("Close")',
  '[role="dialog"] button:has-text("×")',
  '[role="dialog"] button:has-text("X")',
  ".modal-close",
  ".close-button",
  ".popup-close",
  '[class*="close"]',
  '[data-dismiss="modal"]',
  'button:has-text("No thanks")',
  'button:has-text("Not now")',
  'button:has-text("Dismiss")',
  'button:has-text("Maybe later")',
];

const COOKIE_CONSENT_SELECTORS = [
  "#cookie-consent",
  "#cookie-banner",
  "#cookieConsent",
  ".cookie-banner",
  ".cookie-consent",
  ".consent-banner",
  '[class*="cookie"]',
  '[class*="consent"]',
  '[data-testid="cookie"]',
  '[data-testid="cookie-banner"]',
  '[id*="cookie"]',
  '[id*="consent"]',
  // CookieBot
  "#CybotCookiebotDialog",
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
  // OneTrust
  "#onetrust-banner-sdk",
  "#onetrust-accept-btn-handler",
  // TrustArc
  "#truste-consent-track",
  ".truste-consent-button",
  // Osano
  ".osano-cm-window",
  ".osano-cm-accept-all",
];

const ACCEPT_BUTTON_TEXTS = [
  "Accept All",
  "Accept all",
  "Accept all cookies",
  "Accept All Cookies",
  "Accept",
  "I Agree",
  "I agree",
  "Agree",
  "Allow All",
  "Allow all",
  "Allow",
  "Got it",
  "Got It",
  "OK",
  "Ok",
  "Okay",
  "Continue",
  "Yes",
  "Understood",
];

// ---------------------------------------------------------------------------
// navigateTo — Navigate to a URL with full popup/cookie/dialog handling
// ---------------------------------------------------------------------------

export async function navigateTo(
  page: Page,
  url: string,
  onProgress: ProgressCallback,
): Promise<NavigationResult> {
  const startTime = Date.now();
  const consoleErrors: string[] = [];
  const redirectChain: string[] = [];
  let status: number;

  onProgress("info", `Navigating to ${url}`);

  // Capture console errors during navigation
  const consoleHandler = (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  };
  page.on("console", consoleHandler);

  // Set up dialog handler before navigating
  handleAlertDialogs(page);

  // Record the starting URL
  const urlBefore = page.url();
  if (urlBefore && urlBefore !== "about:blank") {
    redirectChain.push(urlBefore);
  }

  // Navigate
  let response: Response | null;
  try {
    response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    status = response?.status() ?? 200;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    onProgress("warn", `Navigation error: ${message}`);
    status = 0;
  }

  // Track redirect chain — if the final URL differs from the requested one
  const finalUrl = page.url();
  if (finalUrl !== url) {
    redirectChain.push(url);
    redirectChain.push(finalUrl);
  }

  // Wait for page readiness
  try {
    await waitForPageReady(page, 10_000);
  } catch {
    onProgress("warn", "Page readiness check timed out, proceeding anyway");
  }

  // Handle popups and overlays
  const popupsHandled = await handlePopups(page);
  if (popupsHandled.length > 0) {
    onProgress("info", `Dismissed ${popupsHandled.length} popup(s)`);
  }

  // Handle cookie consent
  const cookieConsentDismissed = await dismissCookieConsent(page);
  if (cookieConsentDismissed) {
    onProgress("info", "Dismissed cookie consent banner");
  }

  // Get page title
  let title: string;
  try {
    title = await page.title();
  } catch {
    title = "";
  }

  // Clean up console listener
  page.off("console", consoleHandler);

  const loadTime = Date.now() - startTime;

  onProgress("step", `Loaded in ${loadTime}ms — ${title || finalUrl}`);

  if (consoleErrors.length > 0) {
    onProgress("warn", `${consoleErrors.length} console error(s) detected`);
  }

  return {
    url,
    finalUrl,
    title,
    redirectChain,
    loadTime,
    consoleErrors,
    popupsHandled,
    cookieConsentDismissed,
    status,
  };
}

// ---------------------------------------------------------------------------
// handlePopups — Dismiss common popups and overlays
// ---------------------------------------------------------------------------

export async function handlePopups(page: Page): Promise<string[]> {
  const handled: string[] = [];

  for (const selector of POPUP_SELECTORS) {
    try {
      const popup = await page.$(selector);
      if (!popup) continue;

      const isVisible = await popup.isVisible().catch(() => false);
      if (!isVisible) continue;

      // Try to find a close button within the popup
      let closed = false;
      for (const closeSelector of CLOSE_BUTTON_SELECTORS) {
        try {
          const closeBtn = await popup.$(closeSelector);
          if (closeBtn) {
            const btnVisible = await closeBtn.isVisible().catch(() => false);
            if (btnVisible) {
              await closeBtn.click({ timeout: 2_000 });
              handled.push(`Closed popup: ${selector}`);
              closed = true;
              break;
            }
          }
        } catch {
          // Continue trying other close buttons
        }
      }

      // If no close button found inside the popup, try page-level close buttons
      if (!closed) {
        for (const closeSelector of CLOSE_BUTTON_SELECTORS) {
          try {
            const closeBtn = await page.$(closeSelector);
            if (closeBtn) {
              const btnVisible = await closeBtn.isVisible().catch(() => false);
              if (btnVisible) {
                await closeBtn.click({ timeout: 2_000 });
                handled.push(`Closed popup: ${selector} (page-level close)`);
                closed = true;
                break;
              }
            }
          } catch {
            // Continue trying other close buttons
          }
        }
      }

      // If still not closed, try pressing Escape
      if (!closed) {
        try {
          await page.keyboard.press("Escape");
          // Check if the popup was dismissed
          await page.waitForTimeout(300);
          const stillVisible = await popup.isVisible().catch(() => false);
          if (!stillVisible) {
            handled.push(`Closed popup via Escape: ${selector}`);
          }
        } catch {
          // Escape didn't work, move on
        }
      }
    } catch {
      // Selector not found or error — continue
    }
  }

  return handled;
}

// ---------------------------------------------------------------------------
// dismissCookieConsent — Handle cookie banners from various libraries
// ---------------------------------------------------------------------------

export async function dismissCookieConsent(page: Page): Promise<boolean> {
  // First, try well-known cookie consent library buttons directly
  const directButtons = [
    // CookieBot
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "#CybotCookiebotDialogBodyButtonAccept",
    // OneTrust
    "#onetrust-accept-btn-handler",
    // TrustArc
    ".truste-consent-button",
    '#truste-consent-button[value="true"]',
    // Osano
    ".osano-cm-accept-all",
    ".osano-cm-button--type_accept",
    // Quantcast
    '.qc-cmp2-summary-buttons button[mode="primary"]',
    // Didomi
    "#didomi-notice-agree-button",
    // Cookielaw
    ".optanon-allow-all",
  ];

  for (const selector of directButtons) {
    try {
      const btn = await page.$(selector);
      if (btn) {
        const visible = await btn.isVisible().catch(() => false);
        if (visible) {
          await btn.click({ timeout: 2_000 });
          await page.waitForTimeout(500);
          return true;
        }
      }
    } catch {
      // Continue trying other buttons
    }
  }

  // Look for cookie consent containers and find accept buttons within them
  for (const containerSelector of COOKIE_CONSENT_SELECTORS) {
    try {
      const container = await page.$(containerSelector);
      if (!container) continue;

      const isVisible = await container.isVisible().catch(() => false);
      if (!isVisible) continue;

      // Try each accept button text
      for (const text of ACCEPT_BUTTON_TEXTS) {
        try {
          const btn = await container.$(`button:has-text("${text}")`);
          if (btn) {
            const btnVisible = await btn.isVisible().catch(() => false);
            if (btnVisible) {
              await btn.click({ timeout: 2_000 });
              await page.waitForTimeout(500);
              return true;
            }
          }
        } catch {
          // Continue trying other button texts
        }

        // Also try links styled as buttons
        try {
          const link = await container.$(`a:has-text("${text}")`);
          if (link) {
            const linkVisible = await link.isVisible().catch(() => false);
            if (linkVisible) {
              await link.click({ timeout: 2_000 });
              await page.waitForTimeout(500);
              return true;
            }
          }
        } catch {
          // Continue
        }
      }

      // Try any primary/action button in the container as a last resort
      const fallbackSelectors = [
        'button[class*="accept"]',
        'button[class*="agree"]',
        'button[class*="allow"]',
        'button[class*="primary"]',
        'button[class*="cta"]',
        'button[data-action="accept"]',
      ];

      for (const fallback of fallbackSelectors) {
        try {
          const btn = await container.$(fallback);
          if (btn) {
            const btnVisible = await btn.isVisible().catch(() => false);
            if (btnVisible) {
              await btn.click({ timeout: 2_000 });
              await page.waitForTimeout(500);
              return true;
            }
          }
        } catch {
          // Continue
        }
      }
    } catch {
      // Container not found — continue
    }
  }

  // Final attempt: search the entire page for accept buttons by text
  for (const text of ACCEPT_BUTTON_TEXTS.slice(0, 5)) {
    try {
      const btn = await page.$(`button:has-text("${text}")`);
      if (btn) {
        const visible = await btn.isVisible().catch(() => false);
        if (visible) {
          // Verify the button is likely part of a cookie consent by checking
          // if it or a parent contains "cookie" or "consent" in its text/class
          const parentText: string = await btn
            .evaluate((el: Element) => {
              const parent = (el as HTMLElement).closest(
                '[class*="cookie"], [class*="consent"], [id*="cookie"], [id*="consent"], [class*="banner"]',
              );
              return parent ? parent.className : "";
            })
            .catch(() => "");

          if (parentText) {
            await btn.click({ timeout: 2_000 });
            await page.waitForTimeout(500);
            return true;
          }
        }
      }
    } catch {
      // Continue
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// handleAlertDialogs — Auto-accept native browser dialogs
// ---------------------------------------------------------------------------

const dialogMessages: string[] = [];

export async function handleAlertDialogs(page: Page): Promise<void> {
  page.on("dialog", async (dialog: Dialog) => {
    const message = dialog.message();
    dialogMessages.push(message);

    const type: string = dialog.type();
    try {
      if (type === "alert") {
        await dialog.accept();
      } else if (type === "confirm") {
        await dialog.accept();
      } else if (type === "prompt") {
        await dialog.accept("");
      } else if (type === "beforeunload") {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    } catch {
      // Dialog already handled or page navigated away
    }
  });
}

// ---------------------------------------------------------------------------
// waitForPageReady — Smart wait for full page readiness
// ---------------------------------------------------------------------------

export async function waitForPageReady(page: Page, timeout: number = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;

  // Wait for DOM content loaded
  try {
    await page.waitForLoadState("domcontentloaded", {
      timeout: Math.max(deadline - Date.now(), 1_000),
    });
  } catch {
    // Already loaded or timed out
  }

  // Wait for network idle — all pending requests resolved
  try {
    await page.waitForLoadState("networkidle", {
      timeout: Math.min(Math.max(deadline - Date.now(), 1_000), 5_000),
    });
  } catch {
    // Network still active — proceed anyway after timeout
  }

  // Wait for no layout shifts for 500ms
  if (Date.now() < deadline) {
    try {
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          let lastShiftTime = Date.now();

          // PerformanceObserver with layout-shift is a browser API —
          // we use string casts here because this runs in the browser context,
          // not in Node where TypeScript checks the types.
          const observer = new PerformanceObserver(
            (list: { getEntries(): { entryType: string }[] }) => {
              for (const entry of list.getEntries()) {
                if ((entry as { entryType: string }).entryType === "layout-shift") {
                  lastShiftTime = Date.now();
                }
              }
            },
          );

          observer.observe({ type: "layout-shift" as unknown as string, buffered: false });

          const check = () => {
            if (Date.now() - lastShiftTime >= 500) {
              observer.disconnect();
              resolve();
            } else {
              setTimeout(check, 100);
            }
          };

          // Start checking after a brief delay
          setTimeout(check, 200);

          // Hard timeout — don't wait more than 3 seconds for layout stability
          setTimeout(() => {
            observer.disconnect();
            resolve();
          }, 3_000);
        });
      });
    } catch {
      // Layout shift observation failed — proceed
    }
  }

  // Wait for main content to be visible
  if (Date.now() < deadline) {
    const contentSelectors = [
      "main",
      '[role="main"]',
      "#content",
      "#app",
      "#root",
      ".content",
      "article",
      "body",
    ];

    for (const selector of contentSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.waitForElementState("visible", {
            timeout: Math.min(Math.max(deadline - Date.now(), 500), 2_000),
          });
          break;
        }
      } catch {
        // Element not found or not visible — try next
      }
    }
  }
}

// ---------------------------------------------------------------------------
// detectRedirectLoop — Check URL history for redirect loops
// ---------------------------------------------------------------------------

export function detectRedirectLoop(urlHistory: string[]): boolean {
  if (urlHistory.length < 3) return false;

  // Check if the same URL appears 3 or more times
  const counts = new Map<string, number>();
  for (const url of urlHistory) {
    const count = (counts.get(url) ?? 0) + 1;
    counts.set(url, count);
    if (count >= 3) return true;
  }

  // Check for alternating pattern (A -> B -> A -> B)
  if (urlHistory.length >= 4) {
    for (let i = 0; i <= urlHistory.length - 4; i++) {
      if (
        urlHistory[i] === urlHistory[i + 2] &&
        urlHistory[i + 1] === urlHistory[i + 3] &&
        urlHistory[i] !== urlHistory[i + 1]
      ) {
        return true;
      }
    }
  }

  return false;
}
