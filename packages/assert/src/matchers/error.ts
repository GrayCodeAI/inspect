import type { MatcherResult } from "@inspect/shared";
import { createFailResult, createPassResult } from "../utils.js";

export function toThrow(fn: unknown, expected?: string | RegExp | ErrorConstructor): MatcherResult {
  if (typeof fn !== "function") {
    return createFailResult(
      `toThrow requires a function, but received ${typeof fn}.`,
      fn,
      expected,
    );
  }

  let thrownError: Error | unknown;
  try {
    fn();
    return createFailResult(
      `Expected function to throw, but it did not.`,
      "no error thrown",
      expected,
    );
  } catch (error) {
    thrownError = error;
  }

  if (expected === undefined) {
    return createPassResult();
  }

  if (typeof expected === "string") {
    const message = thrownError instanceof Error ? thrownError.message : String(thrownError);
    if (message.includes(expected)) {
      return createPassResult();
    }
    return createFailResult(
      `Expected error message to include "${expected}", but received "${message}".`,
      message,
      expected,
    );
  }

  if (expected instanceof RegExp) {
    const message = thrownError instanceof Error ? thrownError.message : String(thrownError);
    if (expected.test(message)) {
      return createPassResult();
    }
    return createFailResult(
      `Expected error message to match ${expected.toString()}, but received "${thrownError instanceof Error ? thrownError.message : String(thrownError)}".`,
      thrownError instanceof Error ? thrownError.message : String(thrownError),
      expected,
    );
  }

  if (typeof expected === "function") {
    if (thrownError instanceof expected) {
      return createPassResult();
    }
    return createFailResult(
      `Expected error to be an instance of ${expected.name}, but received ${thrownError instanceof Error ? thrownError.constructor.name : typeof thrownError}.`,
      thrownError,
      expected,
    );
  }

  return createFailResult(
    `Invalid expected value for toThrow. Expected string, RegExp, or ErrorConstructor.`,
    thrownError,
    expected,
  );
}
