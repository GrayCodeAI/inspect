import type { MatcherResult, Constructor, TypeOfValue } from "@inspect/shared";
import { createFailResult, createPassResult } from "../utils.js";

export function toBeInstanceOf(actual: unknown, expected: Constructor): MatcherResult {
  if (actual instanceof expected) {
    return createPassResult();
  }
  return createFailResult(
    `Expected value to be an instance of ${expected.name}, but it was not.`,
    actual,
    expected,
  );
}

export function toBeTypeOf(actual: unknown, expected: TypeOfValue): MatcherResult {
  const actualType = actual === null ? "null" : typeof actual;
  if (actualType === expected) {
    return createPassResult();
  }
  return createFailResult(
    `Expected typeof value to be "${expected}", but received "${actualType}".`,
    actualType,
    expected,
  );
}
