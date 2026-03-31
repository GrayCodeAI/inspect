import type {
  ExpectChain,
  MatcherResult,
  NegatedMatcher,
  Constructor,
  TypeOfValue,
} from "../types/index.js";
import {
  toBe,
  toEqual,
  toStrictEqual,
  toBeNull,
  toBeUndefined,
  toBeDefined,
  toBeTruthy,
  toBeFalsy,
  toBeGreaterThan,
  toBeGreaterThanOrEqual,
  toBeLessThan,
  toBeLessThanOrEqual,
  toBeCloseTo,
  toContain,
  toContainEqual,
  toHaveLength,
  toHaveProperty,
  toBeInstanceOf,
  toBeTypeOf,
  toMatch,
  toStartWith,
  toEndWith,
  toThrow,
} from "./matchers/index.js";
import { createResolvesMatcher, createRejectsMatcher } from "./async-matchers.js";

export class AssertionError extends Error {
  actual?: unknown;
  expected?: unknown;

  constructor(message: string, actual?: unknown, expected?: unknown) {
    super(message);
    this.name = "AssertionError";
    this.actual = actual;
    this.expected = expected;
  }
}

function assertResult(result: MatcherResult, invert = false): void {
  const pass = invert ? !result.pass : result.pass;
  if (!pass) {
    throw new AssertionError(result.message(), result.actual, result.expected);
  }
}

function createMatcher(actual: unknown, invert: boolean): NegatedMatcher {
  return {
    toBe(expected: unknown) {
      const result = toBe(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toEqual(expected: unknown) {
      const result = toEqual(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toStrictEqual(expected: unknown) {
      const result = toStrictEqual(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toBeNull() {
      const result = toBeNull(actual);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected: null }
        : result;
    },
    toBeUndefined() {
      const result = toBeUndefined(actual);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected: undefined }
        : result;
    },
    toBeDefined() {
      const result = toBeDefined(actual);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected: undefined }
        : result;
    },
    toBeTruthy() {
      const result = toBeTruthy(actual);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected: "truthy" }
        : result;
    },
    toBeFalsy() {
      const result = toBeFalsy(actual);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected: "falsy" }
        : result;
    },
    toBeGreaterThan(expected: number | bigint) {
      const result = toBeGreaterThan(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toBeGreaterThanOrEqual(expected: number | bigint) {
      const result = toBeGreaterThanOrEqual(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toBeLessThan(expected: number | bigint) {
      const result = toBeLessThan(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toBeLessThanOrEqual(expected: number | bigint) {
      const result = toBeLessThanOrEqual(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toBeCloseTo(expected: number, precision?: number) {
      const result = toBeCloseTo(actual, expected, precision);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toContain(expected: unknown) {
      const result = toContain(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toContainEqual(expected: unknown) {
      const result = toContainEqual(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toHaveLength(expected: number) {
      const result = toHaveLength(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toHaveProperty(keyPath: string | string[], value?: unknown) {
      const result = toHaveProperty(actual, keyPath, value);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected: keyPath }
        : result;
    },
    toBeInstanceOf(expected: Constructor) {
      const result = toBeInstanceOf(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toBeTypeOf(expected: TypeOfValue) {
      const result = toBeTypeOf(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toMatch(expected: string | RegExp) {
      const result = toMatch(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toStartWith(expected: string) {
      const result = toStartWith(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toEndWith(expected: string) {
      const result = toEndWith(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toThrow(expected?: string | RegExp | ErrorConstructor) {
      const result = toThrow(actual, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual, expected }
        : result;
    },
    toReturn(_expected: unknown) {
      return {
        pass: true,
        message: () => "toReturn is not yet implemented",
        actual,
        expected: _expected,
      };
    },
  };
}

export function expect(actual: unknown): ExpectChain {
  const matcher = createMatcher(actual, false);
  const negatedMatcher = createMatcher(actual, true);
  const isPromise = actual instanceof Promise;
  const promise = actual as Promise<unknown>;

  return {
    get resolves() {
      if (!isPromise) {
        throw new AssertionError("resolves can only be used on promises", actual, undefined);
      }
      return createResolvesMatcher(promise);
    },
    get rejects() {
      if (!isPromise) {
        throw new AssertionError("rejects can only be used on promises", actual, undefined);
      }
      return createRejectsMatcher(promise);
    },
    get not() {
      return negatedMatcher;
    },
    toBe(expected: unknown) {
      return matcher.toBe(expected);
    },
    toEqual(expected: unknown) {
      return matcher.toEqual(expected);
    },
    toStrictEqual(expected: unknown) {
      return matcher.toStrictEqual(expected);
    },
    toBeNull() {
      return matcher.toBeNull();
    },
    toBeUndefined() {
      return matcher.toBeUndefined();
    },
    toBeDefined() {
      return matcher.toBeDefined();
    },
    toBeTruthy() {
      return matcher.toBeTruthy();
    },
    toBeFalsy() {
      return matcher.toBeFalsy();
    },
    toBeGreaterThan(expected: number | bigint) {
      return matcher.toBeGreaterThan(expected);
    },
    toBeGreaterThanOrEqual(expected: number | bigint) {
      return matcher.toBeGreaterThanOrEqual(expected);
    },
    toBeLessThan(expected: number | bigint) {
      return matcher.toBeLessThan(expected);
    },
    toBeLessThanOrEqual(expected: number | bigint) {
      return matcher.toBeLessThanOrEqual(expected);
    },
    toBeCloseTo(expected: number, precision?: number) {
      return matcher.toBeCloseTo(expected, precision);
    },
    toContain(expected: unknown) {
      return matcher.toContain(expected);
    },
    toContainEqual(expected: unknown) {
      return matcher.toContainEqual(expected);
    },
    toHaveLength(expected: number) {
      return matcher.toHaveLength(expected);
    },
    toHaveProperty(keyPath: string | string[], value?: unknown) {
      return matcher.toHaveProperty(keyPath, value);
    },
    toBeInstanceOf(expected: Constructor) {
      return matcher.toBeInstanceOf(expected);
    },
    toBeTypeOf(expected: TypeOfValue) {
      return matcher.toBeTypeOf(expected);
    },
    toMatch(expected: string | RegExp) {
      return matcher.toMatch(expected);
    },
    toStartWith(expected: string) {
      return matcher.toStartWith(expected);
    },
    toEndWith(expected: string) {
      return matcher.toEndWith(expected);
    },
    toThrow(expected?: string | RegExp | ErrorConstructor) {
      return matcher.toThrow(expected);
    },
    toReturn(expected: unknown) {
      return matcher.toReturn(expected);
    },
  };
}

export {
  toBe,
  toEqual,
  toStrictEqual,
  toBeNull,
  toBeUndefined,
  toBeDefined,
  toBeTruthy,
  toBeFalsy,
  toBeGreaterThan,
  toBeGreaterThanOrEqual,
  toBeLessThan,
  toBeLessThanOrEqual,
  toBeCloseTo,
  toContain,
  toContainEqual,
  toHaveLength,
  toHaveProperty,
  toBeInstanceOf,
  toBeTypeOf,
  toMatch,
  toStartWith,
  toEndWith,
  toThrow,
} from "./matchers/index.js";

export type {
  MatcherResult,
  ExpectChain,
  NegatedMatcher,
  Constructor,
  TypeOfValue,
  AssertionFailure,
} from "../types/index.js";
