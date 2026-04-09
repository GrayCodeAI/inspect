// ──────────────────────────────────────────────────────────────────────────────
// Recovery Playbook
// Defines recovery strategies for common failures
// ──────────────────────────────────────────────────────────────────────────────

import type { RecoveryPlaybookEntry, RecoveryAction, PageSnapshot } from "./types.js";

/**
 * Default recovery playbook entries
 */
export const defaultRecoveryPlaybook: RecoveryPlaybookEntry[] = [
  // Element not found errors
  {
    errorPattern: /element.*not found|could not find|unable to locate/i,
    strategy: "alternative-selector",
    priority: 100,
    description: "Element not found - try alternative selectors",
  },
  {
    errorPattern: /element.*not visible|not displayed/i,
    strategy: "scroll-into-view",
    priority: 90,
    description: "Element not visible - scroll into view",
  },
  {
    errorPattern: /element.*not interactable|not enabled|disabled/i,
    strategy: "wait-and-retry",
    priority: 80,
    description: "Element not interactable - wait and retry",
  },

  // Network/timing errors
  {
    errorPattern: /timeout|timed out|slow|taking too long/i,
    strategy: "wait-and-retry",
    priority: 100,
    description: "Timeout error - wait and retry with longer timeout",
  },
  {
    errorPattern: /network|connection|failed to fetch|xhr failed/i,
    strategy: "retry",
    priority: 90,
    description: "Network error - retry",
  },

  // Page state errors
  {
    errorPattern: /stale element|detached|no longer attached/i,
    strategy: "refresh",
    priority: 100,
    description: "Stale element - refresh page",
  },
  {
    errorPattern: /unexpected alert|dialog|confirm|prompt/i,
    strategy: "dismiss-overlay",
    priority: 100,
    description: "Unexpected dialog - dismiss it",
  },
  {
    errorPattern: /frame.*not found|iframe|frame.*detached/i,
    strategy: "refresh",
    priority: 80,
    description: "Frame error - refresh page",
  },

  // Cookie/redirect errors
  {
    errorPattern: /redirect|redirected|302|301/i,
    strategy: "login-redirect",
    priority: 90,
    description: "Redirect detected - handle authentication",
  },
  {
    errorPattern: /consent|cookie|gdpr|accept.*cookies/i,
    strategy: "accept-consent",
    priority: 100,
    description: "Cookie consent dialog - accept it",
  },

  // Overlay errors
  {
    errorPattern: /intercepted.*click|overlay|modal|popup/i,
    strategy: "dismiss-overlay",
    priority: 100,
    description: "Overlay blocking click - dismiss it",
  },

  // Generic fallback
  {
    errorPattern: /.*/,
    strategy: "retry",
    priority: 0,
    description: "Generic error - retry once",
  },
];

/**
 * Get recovery strategy for an error
 */
export function getRecoveryStrategy(
  error: string | Error,
  playbook: RecoveryPlaybookEntry[] = defaultRecoveryPlaybook,
): RecoveryAction | undefined {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Sort by priority (highest first)
  const sortedEntries = [...playbook].sort((a, b) => b.priority - a.priority);

  for (const entry of sortedEntries) {
    if (entry.errorPattern.test(errorMessage)) {
      return entry.strategy;
    }
  }

  return undefined;
}

/**
 * Execute recovery strategy
 */
export async function executeRecovery(
  strategy: RecoveryAction,
  context: {
    page: {
      reload: () => Promise<void>;
      waitForTimeout: (ms: number) => Promise<void>;
      evaluate: (fn: () => void) => Promise<void>;
      locator: (selector: string) => {
        isVisible: () => Promise<boolean>;
        click: () => Promise<void>;
      };
    };
    originalSelector: string;
    alternativeSelectors: string[];
    snapshot: PageSnapshot;
  },
): Promise<{ success: boolean; actionTaken: string }> {
  switch (strategy) {
    case "retry": {
      await context.page.waitForTimeout(500);
      return { success: true, actionTaken: "Waited 500ms and retrying" };
    }

    case "refresh": {
      await context.page.reload();
      await context.page.waitForTimeout(1000);
      return { success: true, actionTaken: "Refreshed page" };
    }

    case "wait-and-retry": {
      await context.page.waitForTimeout(2000);
      return { success: true, actionTaken: "Waited 2s for stability" };
    }

    case "scroll-into-view": {
      await context.page.evaluate(() => {
        // Scroll to center of page
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await context.page.waitForTimeout(500);
      return { success: true, actionTaken: "Scrolled into view" };
    }

    case "alternative-selector": {
      // Try alternative selectors
      for (const selector of context.alternativeSelectors) {
        try {
          const visible = await context.page.locator(selector).isVisible();
          if (visible) {
            return { success: true, actionTaken: `Found alternative selector: ${selector}` };
          }
        } catch {
          // Continue to next alternative
        }
      }
      return { success: false, actionTaken: "No alternative selector worked" };
    }

    case "dismiss-overlay": {
      // Try common dismiss patterns
      const dismissSelectors = [
        "[data-testid='close']",
        "[aria-label='Close']",
        ".modal-close",
        ".overlay-close",
        "button:has-text('Close')",
        "button:has-text('Dismiss')",
        "button:has-text('×')",
      ];

      for (const selector of dismissSelectors) {
        try {
          const visible = await context.page.locator(selector).isVisible();
          if (visible) {
            await context.page.locator(selector).click();
            await context.page.waitForTimeout(300);
            return { success: true, actionTaken: `Dismissed overlay with: ${selector}` };
          }
        } catch {
          // Continue to next selector
        }
      }
      return { success: false, actionTaken: "Could not dismiss overlay" };
    }

    case "accept-consent": {
      const consentSelectors = [
        "[data-testid='accept-cookies']",
        "[data-testid='cookie-accept']",
        "button:has-text('Accept')",
        "button:has-text('Accept All')",
        "button:has-text('I Agree')",
        "button:has-text('OK')",
        "#accept-cookies",
        ".cookie-banner button",
      ];

      for (const selector of consentSelectors) {
        try {
          const visible = await context.page.locator(selector).isVisible();
          if (visible) {
            await context.page.locator(selector).click();
            await context.page.waitForTimeout(300);
            return { success: true, actionTaken: `Accepted consent with: ${selector}` };
          }
        } catch {
          // Continue to next selector
        }
      }
      return { success: false, actionTaken: "Could not accept consent" };
    }

    case "login-redirect": {
      // Check if we're on a login page
      const currentUrl = context.snapshot.url;
      if (currentUrl.includes("login") || currentUrl.includes("signin")) {
        return { success: false, actionTaken: "Detected login redirect - requires authentication" };
      }
      return { success: true, actionTaken: "Handled redirect" };
    }

    default:
      return { success: false, actionTaken: `Unknown strategy: ${strategy}` };
  }
}

/**
 * Add custom recovery entries
 */
export function createCustomPlaybook(
  customEntries: RecoveryPlaybookEntry[],
  basePlaybook: RecoveryPlaybookEntry[] = defaultRecoveryPlaybook,
): RecoveryPlaybookEntry[] {
  return [...customEntries, ...basePlaybook];
}
