// ============================================================================
// Safe page.evaluate wrapper with timeout guards
// ============================================================================

/** Default timeout for page.evaluate calls (ms) */
const DEFAULT_TIMEOUT = 10_000;

/**
 * Run page.evaluate with a timeout guard.
 * If the evaluate hangs (e.g., page navigating, infinite loop in script),
 * it rejects after the timeout instead of blocking forever.
 */
export async function safeEvaluate<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  script: string,
  fallback: T,
  timeout = DEFAULT_TIMEOUT,
): Promise<T> {
  try {
    const result = await Promise.race([
      page.evaluate(script) as Promise<T>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`evaluate timed out after ${timeout}ms`)), timeout),
      ),
    ]);
    return result;
  } catch {
    return fallback;
  }
}

/**
 * Run page.evaluate that returns void / doesn't need a result.
 * Silently catches errors and timeouts.
 */
export async function safeEvaluateVoid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  script: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  try {
    await Promise.race([
      page.evaluate(script),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("evaluate timed out")), timeout),
      ),
    ]);
  } catch {
    // Non-fatal — evaluate failed or timed out
  }
}
