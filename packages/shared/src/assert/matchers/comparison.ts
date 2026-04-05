import type { MatcherResult } from "../../types/matchers.js";
import { createFailResult, createPassResult } from "../utils.js";

export function toBeGreaterThan(actual: unknown, expected: number | bigint): MatcherResult {
  if (typeof actual !== "number" && typeof actual !== "bigint") {
    return createFailResult(
      `Expected value to be a number or bigint, but received ${typeof actual}.`,
      actual,
      expected,
    );
  }
  if ((actual as number | bigint) > expected) {
    return createPassResult();
  }
  return createFailResult(`Expected ${actual} to be greater than ${expected}.`, actual, expected);
}

export function toBeGreaterThanOrEqual(actual: unknown, expected: number | bigint): MatcherResult {
  if (typeof actual !== "number" && typeof actual !== "bigint") {
    return createFailResult(
      `Expected value to be a number or bigint, but received ${typeof actual}.`,
      actual,
      expected,
    );
  }
  if ((actual as number | bigint) >= expected) {
    return createPassResult();
  }
  return createFailResult(
    `Expected ${actual} to be greater than or equal to ${expected}.`,
    actual,
    expected,
  );
}

export function toBeLessThan(actual: unknown, expected: number | bigint): MatcherResult {
  if (typeof actual !== "number" && typeof actual !== "bigint") {
    return createFailResult(
      `Expected value to be a number or bigint, but received ${typeof actual}.`,
      actual,
      expected,
    );
  }
  if ((actual as number | bigint) < expected) {
    return createPassResult();
  }
  return createFailResult(`Expected ${actual} to be less than ${expected}.`, actual, expected);
}

export function toBeLessThanOrEqual(actual: unknown, expected: number | bigint): MatcherResult {
  if (typeof actual !== "number" && typeof actual !== "bigint") {
    return createFailResult(
      `Expected value to be a number or bigint, but received ${typeof actual}.`,
      actual,
      expected,
    );
  }
  if ((actual as number | bigint) <= expected) {
    return createPassResult();
  }
  return createFailResult(
    `Expected ${actual} to be less than or equal to ${expected}.`,
    actual,
    expected,
  );
}

export function toBeCloseTo(actual: unknown, expected: number, precision = 2): MatcherResult {
  if (typeof actual !== "number") {
    return createFailResult(
      `Expected value to be a number, but received ${typeof actual}.`,
      actual,
      expected,
    );
  }
  const diff = Math.abs(actual - expected);
  const tolerance = 0.5 * 10 ** -precision;
  if (diff <= tolerance) {
    return createPassResult();
  }
  return createFailResult(
    `Expected ${actual} to be close to ${expected} within ${precision} decimal places (tolerance: ${tolerance}).`,
    actual,
    expected,
  );
}
