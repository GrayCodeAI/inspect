import type { MatcherResult } from "../../types/matchers.js";
import { createFailResult, createPassResult } from "../utils.js";

export function toMatch(actual: unknown, expected: string | RegExp): MatcherResult {
  if (typeof actual !== "string") {
    return createFailResult(
      `toMatch requires a string value, but received ${typeof actual}.`,
      actual,
      expected,
    );
  }

  const regex = typeof expected === "string" ? new RegExp(expected) : expected;
  if (regex.test(actual)) {
    return createPassResult();
  }
  return createFailResult(
    `Expected string to match ${expected instanceof RegExp ? expected.toString() : `/${expected}/`}, but it did not.`,
    actual,
    expected,
  );
}

export function toStartWith(actual: unknown, expected: string): MatcherResult {
  if (typeof actual !== "string") {
    return createFailResult(
      `toStartWith requires a string value, but received ${typeof actual}.`,
      actual,
      expected,
    );
  }
  if (actual.startsWith(expected)) {
    return createPassResult();
  }
  return createFailResult(
    `Expected string to start with "${expected}", but it started with "${actual.slice(0, expected.length)}".`,
    actual,
    expected,
  );
}

export function toEndWith(actual: unknown, expected: string): MatcherResult {
  if (typeof actual !== "string") {
    return createFailResult(
      `toEndWith requires a string value, but received ${typeof actual}.`,
      actual,
      expected,
    );
  }
  if (actual.endsWith(expected)) {
    return createPassResult();
  }
  return createFailResult(
    `Expected string to end with "${expected}", but it ended with "${actual.slice(-expected.length)}".`,
    actual,
    expected,
  );
}
