// ============================================================================
// @inspect/shared - Common Utility Functions
// ============================================================================

import { createHash, randomUUID } from "node:crypto";

/**
 * Generate a unique identifier using crypto.randomUUID.
 * Returns a standard v4 UUID string.
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Sleep for a given number of milliseconds.
 * Returns a promise that resolves after the delay.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async function up to `maxRetries` times with a delay between attempts.
 * Uses exponential backoff: delay doubles after each failure.
 *
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param delay - Initial delay in ms between retries (default: 1000)
 * @returns The result of the function if it succeeds
 * @throws The last error if all retries are exhausted
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await sleep(delay * Math.pow(2, attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Compute the SHA-256 hash of an input string.
 * Returns the hex-encoded digest.
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

/**
 * Convert a text string into a URL-safe slug.
 * Lowercases, replaces non-alphanumeric characters with hyphens,
 * collapses consecutive hyphens, and trims leading/trailing hyphens.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Truncate a text string to a maximum length, appending an ellipsis if truncated.
 *
 * @param text - The string to truncate
 * @param maxLength - Maximum length including the ellipsis (default: 256)
 * @returns The truncated string
 */
export function truncate(text: string, maxLength: number = 256): string {
  if (maxLength < 4) return text.slice(0, maxLength);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Format a duration in milliseconds into a human-readable string.
 * Examples: "0ms", "150ms", "2.5s", "1m 30s", "1h 5m 30s"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < 1000) return `${Math.round(ms)}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    let result = `${hours}h`;
    if (remainingMinutes > 0) result += ` ${remainingMinutes}m`;
    if (remainingSeconds > 0) result += ` ${remainingSeconds}s`;
    return result;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    let result = `${minutes}m`;
    if (remainingSeconds > 0) result += ` ${remainingSeconds}s`;
    return result;
  }

  // Less than a minute: show decimal seconds
  const secs = ms / 1000;
  return secs % 1 === 0 ? `${secs}s` : `${secs.toFixed(1)}s`;
}

/**
 * Check if a string is a valid URL.
 * Accepts http and https protocols.
 */
export function isUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Parse a URL string into its components.
 * Returns null if the string is not a valid URL.
 */
export function parseUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

/**
 * Deep merge two objects. Arrays are replaced, not merged.
 * Source properties overwrite target properties.
 * Only plain objects are deep-merged; class instances are replaced.
 *
 * @param target - The base object
 * @param source - The object to merge on top
 * @returns A new merged object
 */
export function deepMerge<
  T extends Record<string, unknown>,
  S extends Record<string, unknown>,
>(
  target: T,
  source: S,
): T & S {
  const result = { ...target } as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const sourceVal = (source as Record<string, unknown>)[key];
    const targetVal = (target as Record<string, unknown>)[key];

    if (
      isPlainObject(sourceVal) &&
      isPlainObject(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }

  return result as T & S;
}

/**
 * Check if a value is a plain object (not an array, null, Date, etc.)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Create a debounced version of a function.
 * The function will only execute after `delay` ms have passed since the last call.
 *
 * @param fn - The function to debounce
 * @param delay - Delay in milliseconds
 * @returns A debounced function with a `cancel` method
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const debounced = function (this: unknown, ...args: unknown[]) {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = undefined;
    }, delay);
  } as unknown as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return debounced;
}

/**
 * Split an array into chunks of a specified size.
 *
 * @param array - The array to split
 * @param size - Maximum size of each chunk
 * @returns An array of chunks
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) throw new Error("Chunk size must be greater than 0");
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Clamp a number to a min/max range.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Pick specified keys from an object.
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specified keys from an object.
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Create a deferred promise with externally accessible resolve/reject.
 */
export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Map with a concurrency limit.
 * Processes items in parallel but limits the number of concurrent operations.
 */
export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
}

/**
 * Create a simple timer for measuring durations.
 */
export function createTimer(): {
  elapsed: () => number;
  reset: () => void;
} {
  let start = performance.now();
  return {
    elapsed: () => performance.now() - start,
    reset: () => {
      start = performance.now();
    },
  };
}

/**
 * Safely parse JSON without throwing.
 * Returns undefined if parsing fails.
 */
export function safeJsonParse<T = unknown>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/**
 * Generate a short ID suitable for element refs (e.g. "e1", "e2").
 * Uses a monotonically increasing counter with a prefix.
 */
export function createRefGenerator(prefix: string = "e"): () => string {
  let counter = 0;
  return () => `${prefix}${++counter}`;
}

/**
 * Escape a string for safe use in a regular expression.
 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if we are running inside a Docker container.
 */
export function isDocker(): boolean {
  return process.env.IN_DOCKER === "true" || process.env.DOCKER === "true";
}

/**
 * Get an environment variable with an optional default.
 * Throws if the variable is not set and no default is provided.
 */
export function getEnv(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (value !== undefined) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Required environment variable ${name} is not set`);
}

/**
 * Get an environment variable as a boolean.
 * Returns true for "true", "1", "yes"; false otherwise.
 */
export function getEnvBool(name: string, defaultValue: boolean = false): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return ["true", "1", "yes"].includes(value.toLowerCase());
}

/**
 * Get an environment variable as a number.
 */
export function getEnvNumber(name: string, defaultValue?: number): number {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Required environment variable ${name} is not set`);
  }
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`Environment variable ${name} is not a valid number: ${value}`);
  }
  return num;
}
