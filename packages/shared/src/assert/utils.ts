import type { MatcherResult } from "../types/matchers.js";

export function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (typeof value === "symbol") return value.toString();
  if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
  if (typeof value === "object") {
    try {
      const entries = Object.entries(value as Record<string, unknown>);
      return `{ ${entries.map(([k, v]) => `${k}: ${formatValue(v)}`).join(", ")} }`;
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function createResult(
  pass: boolean,
  message: string,
  actual?: unknown,
  expected?: unknown,
): MatcherResult {
  return {
    pass,
    message: () => message,
    actual,
    expected,
  };
}

export function createFailResult(
  message: string,
  actual?: unknown,
  expected?: unknown,
): MatcherResult {
  return createResult(false, message, actual, expected);
}

export function createPassResult(message?: string): MatcherResult {
  return createResult(true, message || "Expected value to not match");
}
