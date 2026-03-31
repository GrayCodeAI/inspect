import type { MatcherResult } from "../../types/index.js";
import { createFailResult, createPassResult } from "../utils.js";

export function toBe(actual: unknown, expected: unknown): MatcherResult {
  if (actual === expected) {
    return createPassResult();
  }
  return createFailResult(
    `Expected value to be ${typeof expected === "object" ? "the same reference" : formatPrimitive(expected)}, but it was ${formatPrimitive(actual)}.`,
    actual,
    expected,
  );
}

export function toEqual(actual: unknown, expected: unknown): MatcherResult {
  if (deepEqual(actual, expected)) {
    return createPassResult();
  }
  return createFailResult(
    `Expected values to be equal, but they differ.\nExpected: ${formatValue(expected)}\nReceived: ${formatValue(actual)}`,
    actual,
    expected,
  );
}

export function toStrictEqual(actual: unknown, expected: unknown): MatcherResult {
  if (!strictEqual(actual, expected)) {
    return createFailResult(
      `Expected values to strictly equal, but they differ in type or structure.`,
      actual,
      expected,
    );
  }
  return createPassResult();
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }

  return false;
}

function strictEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => strictEqual(item, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      strictEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }

  return false;
}

function formatPrimitive(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

function formatValue(value: unknown): string {
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
