import type { MatcherResult } from "../../types/index.js";
import { createFailResult, createPassResult } from "../utils.js";

export function toBeNull(actual: unknown): MatcherResult {
  if (actual === null) {
    return createPassResult();
  }
  return createFailResult(
    `Expected value to be null, but received ${formatType(actual)}.`,
    actual,
    null,
  );
}

export function toBeUndefined(actual: unknown): MatcherResult {
  if (actual === undefined) {
    return createPassResult();
  }
  return createFailResult(
    `Expected value to be undefined, but received ${formatType(actual)}.`,
    actual,
    undefined,
  );
}

export function toBeDefined(actual: unknown): MatcherResult {
  if (actual !== undefined) {
    return createPassResult();
  }
  return createFailResult(
    `Expected value to be defined, but received undefined.`,
    actual,
    undefined,
  );
}

export function toBeTruthy(actual: unknown): MatcherResult {
  if (actual) {
    return createPassResult();
  }
  return createFailResult(
    `Expected value to be truthy, but received ${formatType(actual)} (${formatValue(actual)}).`,
    actual,
    "truthy",
  );
}

export function toBeFalsy(actual: unknown): MatcherResult {
  if (!actual) {
    return createPassResult();
  }
  return createFailResult(
    `Expected value to be falsy, but received ${formatType(actual)} (${formatValue(actual)}).`,
    actual,
    "falsy",
  );
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
  return String(value);
}
