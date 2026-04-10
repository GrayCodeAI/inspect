// ============================================================================
// @inspect/testing - Assertion Retry
// ============================================================================
// Based on Cypress's verifyUpcomingAssertions pattern

import type { Page, Locator } from "playwright";

export interface AssertionRetryOptions {
  timeout?: number;
  interval?: number;
  onRetry?: (attempt: number) => void;
}

/**
 * Retry assertion until it passes or timeout.
 * Based on Cypress's verifyUpcomingAssertions pattern.
 */
export async function retryAssertion<T>(
  page: Page,
  assertion: () => Promise<T>,
  options: AssertionRetryOptions = {},
): Promise<T> {
  const { timeout = 5000, interval = 100, onRetry } = options;
  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    attempt++;
    try {
      const result = await assertion();
      return result;
    } catch (err) {
      if (Date.now() - startTime >= timeout) {
        throw err;
      }
      onRetry?.(attempt);
      await page.waitForTimeout(interval);
    }
  }
}

/**
 * Wait for element to be in specific state, retrying until condition passes.
 */
export async function waitForElementState(
  locator: Locator,
  state: "visible" | "hidden" | "attached" | "detached",
  options: AssertionRetryOptions = {},
): Promise<void> {
  await retryAssertion(
    locator.page() as unknown as Page,
    async () => {
      const isVisible = await locator.isVisible();
      const isHidden = await locator.isHidden();

      switch (state) {
        case "visible":
          if (!isVisible) throw new Error("Element not visible");
          break;
        case "hidden":
          if (!isHidden) throw new Error("Element not hidden");
          break;
        case "attached":
          if (isHidden) throw new Error("Element not attached");
          break;
        case "detached":
          if (!isHidden) throw new Error("Element still attached");
          break;
      }
    },
    options,
  );
}

/**
 * Retry flaky network requests.
 */
export interface NetworkRetryOptions extends AssertionRetryOptions {
  retries?: number;
  statusCodes?: number[];
}

const DEFAULT_RETRY_INTERVALS = [0, 100, 200, 200];

/**
 * Retry network request on failure.
 */
export async function retryNetworkRequest(
  page: Page,
  requestFn: () => Promise<Response>,
  options: NetworkRetryOptions = {},
): Promise<Response> {
  const { retries = 3, statusCodes = [429, 500, 502, 503, 504], onRetry } = options;
  const timeout = options.timeout ?? 5000;
  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    attempt++;
    try {
      const response = await requestFn();
      if (!statusCodes.includes(response.status)) {
        return response;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (attempt >= retries || Date.now() - startTime >= timeout) {
        throw err;
      }
      const delay = DEFAULT_RETRY_INTERVALS[Math.min(attempt, DEFAULT_RETRY_INTERVALS.length - 1)];
      onRetry?.(attempt);
      await page.waitForTimeout(delay);
    }
  }
}
