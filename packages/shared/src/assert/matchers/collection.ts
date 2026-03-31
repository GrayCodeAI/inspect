import type { MatcherResult } from "../../types/index.js";
import { createFailResult, createPassResult } from "../utils.js";

const HAS_VALUE_SENTINEL = Symbol("HAS_VALUE_SENTINEL");

export function toContain(actual: unknown, expected: unknown): MatcherResult {
  if (typeof actual === "string") {
    if (typeof expected !== "string") {
      return createFailResult(
        `toContain for strings expects a string argument, but received ${typeof expected}.`,
        actual,
        expected,
      );
    }
    if (actual.includes(expected)) {
      return createPassResult();
    }
    return createFailResult(
      `Expected string to contain "${expected}", but it did not.`,
      actual,
      expected,
    );
  }

  if (Array.isArray(actual) || isIterable(actual)) {
    const arr = Array.from(actual as Iterable<unknown>);
    if (arr.some((item) => item === expected)) {
      return createPassResult();
    }
    return createFailResult(
      `Expected collection to contain ${formatValue(expected)}, but it did not.`,
      actual,
      expected,
    );
  }

  return createFailResult(
    `toContain requires a string or iterable, but received ${typeof actual}.`,
    actual,
    expected,
  );
}

export function toContainEqual(actual: unknown, expected: unknown): MatcherResult {
  if (!Array.isArray(actual) && !isIterable(actual)) {
    return createFailResult(
      `toContainEqual requires an array or iterable, but received ${typeof actual}.`,
      actual,
      expected,
    );
  }

  const arr = Array.from(actual as Iterable<unknown>);
  if (arr.some((item) => deepEqual(item, expected))) {
    return createPassResult();
  }
  return createFailResult(
    `Expected collection to contain equal to ${formatValue(expected)}, but it did not.`,
    actual,
    expected,
  );
}

export function toHaveLength(actual: unknown, expected: number): MatcherResult {
  if (typeof expected !== "number" || expected < 0 || !Number.isInteger(expected)) {
    return createFailResult(
      `toHaveLength expects a non-negative integer, but received ${expected}.`,
      actual,
      expected,
    );
  }

  let length: number | undefined;
  if (typeof actual === "string") {
    length = actual.length;
  } else if (Array.isArray(actual)) {
    length = actual.length;
  } else if (actual && typeof (actual as { length?: unknown }).length === "number") {
    length = (actual as { length: number }).length;
  }

  if (length === undefined) {
    return createFailResult(
      `Expected value to have a length property, but received ${typeof actual}.`,
      actual,
      expected,
    );
  }

  if (length === expected) {
    return createPassResult();
  }
  return createFailResult(
    `Expected length ${expected}, but received length ${length}.`,
    length,
    expected,
  );
}

export function toHaveProperty(
  actual: unknown,
  keyPath: string | string[],
  value: unknown = HAS_VALUE_SENTINEL,
): MatcherResult {
  if (actual === null || actual === undefined || typeof actual !== "object") {
    return createFailResult(
      `Expected value to be an object, but received ${formatType(actual)}.`,
      actual,
      keyPath,
    );
  }

  const keys = Array.isArray(keyPath) ? keyPath : keyPath.split(".");
  let current: unknown = actual;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (current === null || current === undefined || typeof current !== "object") {
      return createFailResult(
        `Expected value to have property "${keyPath}", but path broke at "${keys.slice(0, i).join(".")}".`,
        actual,
        keyPath,
      );
    }
    if (!(key in (current as Record<string, unknown>))) {
      return createFailResult(
        `Expected value to have property "${keyPath}", but "${key}" was not found.`,
        actual,
        keyPath,
      );
    }
    current = (current as Record<string, unknown>)[key];
  }

  if (value !== HAS_VALUE_SENTINEL) {
    if (!deepEqual(current, value)) {
      return createFailResult(
        `Expected property "${keyPath}" to equal ${formatValue(value)}, but received ${formatValue(current)}.`,
        current,
        value,
      );
    }
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

function isIterable(value: unknown): value is Iterable<unknown> {
  return value != null && typeof (value as any)[Symbol.iterator] === "function";
}

function formatType(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return typeof value;
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
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
