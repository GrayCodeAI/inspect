import type {
  MatcherResult,
  Constructor,
  TypeOfValue,
  PromiseExpectChain,
} from "../types/matchers.js";
import { AssertionError } from "./assertion-error.js";
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
} from "./matchers/all.js";

function assertResult(result: MatcherResult, invert = false): void {
  const pass = invert ? !result.pass : result.pass;
  if (!pass) {
    throw new AssertionError(result.message(), result.actual, result.expected);
  }
}

function createAsyncMatcher(resolvedValue: unknown, invert: boolean): PromiseExpectChain {
  return {
    async toBe(expected: unknown) {
      const result = toBe(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toEqual(expected: unknown) {
      const result = toEqual(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toStrictEqual(expected: unknown) {
      const result = toStrictEqual(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toBeNull() {
      const result = toBeNull(resolvedValue);
      assertResult(result, invert);
      return invert
        ? {
            pass: !result.pass,
            message: () => result.message(),
            actual: resolvedValue,
            expected: null,
          }
        : result;
    },
    async toBeUndefined() {
      const result = toBeUndefined(resolvedValue);
      assertResult(result, invert);
      return invert
        ? {
            pass: !result.pass,
            message: () => result.message(),
            actual: resolvedValue,
            expected: undefined,
          }
        : result;
    },
    async toBeDefined() {
      const result = toBeDefined(resolvedValue);
      assertResult(result, invert);
      return invert
        ? {
            pass: !result.pass,
            message: () => result.message(),
            actual: resolvedValue,
            expected: undefined,
          }
        : result;
    },
    async toBeTruthy() {
      const result = toBeTruthy(resolvedValue);
      assertResult(result, invert);
      return invert
        ? {
            pass: !result.pass,
            message: () => result.message(),
            actual: resolvedValue,
            expected: "truthy",
          }
        : result;
    },
    async toBeFalsy() {
      const result = toBeFalsy(resolvedValue);
      assertResult(result, invert);
      return invert
        ? {
            pass: !result.pass,
            message: () => result.message(),
            actual: resolvedValue,
            expected: "falsy",
          }
        : result;
    },
    async toBeGreaterThan(expected: number | bigint) {
      const result = toBeGreaterThan(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toBeGreaterThanOrEqual(expected: number | bigint) {
      const result = toBeGreaterThanOrEqual(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toBeLessThan(expected: number | bigint) {
      const result = toBeLessThan(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toBeLessThanOrEqual(expected: number | bigint) {
      const result = toBeLessThanOrEqual(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toBeCloseTo(expected: number, precision?: number) {
      const result = toBeCloseTo(resolvedValue, expected, precision);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toContain(expected: unknown) {
      const result = toContain(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toContainEqual(expected: unknown) {
      const result = toContainEqual(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toHaveLength(expected: number) {
      const result = toHaveLength(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toHaveProperty(keyPath: string | string[], value?: unknown) {
      const result = toHaveProperty(resolvedValue, keyPath, value);
      assertResult(result, invert);
      return invert
        ? {
            pass: !result.pass,
            message: () => result.message(),
            actual: resolvedValue,
            expected: keyPath,
          }
        : result;
    },
    async toBeInstanceOf(expected: Constructor) {
      const result = toBeInstanceOf(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toBeTypeOf(expected: TypeOfValue) {
      const result = toBeTypeOf(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toMatch(expected: string | RegExp) {
      const result = toMatch(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toStartWith(expected: string) {
      const result = toStartWith(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toEndWith(expected: string) {
      const result = toEndWith(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toThrow(expected?: string | RegExp | ErrorConstructor) {
      const result = toThrow(resolvedValue, expected);
      assertResult(result, invert);
      return invert
        ? { pass: !result.pass, message: () => result.message(), actual: resolvedValue, expected }
        : result;
    },
    async toReturn(expected: unknown) {
      const pass = resolvedValue === expected;
      const message = () =>
        pass
          ? `Expected the function not to return ${String(expected)}, but it did`
          : `Expected the function to return ${String(expected)}, but got ${String(resolvedValue)}`;
      assertResult({ pass, message, actual: resolvedValue, expected }, invert);
      return invert
        ? { pass: !pass, message, actual: resolvedValue, expected }
        : { pass, message, actual: resolvedValue, expected };
    },
  };
}

export function createResolvesMatcher(promise: Promise<unknown>): PromiseExpectChain {
  return {
    toBe: async (expected) => createAsyncMatcher(await promise, false).toBe(expected),
    toEqual: async (expected) => createAsyncMatcher(await promise, false).toEqual(expected),
    toStrictEqual: async (expected) =>
      createAsyncMatcher(await promise, false).toStrictEqual(expected),
    toBeNull: async () => createAsyncMatcher(await promise, false).toBeNull(),
    toBeUndefined: async () => createAsyncMatcher(await promise, false).toBeUndefined(),
    toBeDefined: async () => createAsyncMatcher(await promise, false).toBeDefined(),
    toBeTruthy: async () => createAsyncMatcher(await promise, false).toBeTruthy(),
    toBeFalsy: async () => createAsyncMatcher(await promise, false).toBeFalsy(),
    toBeGreaterThan: async (expected) =>
      createAsyncMatcher(await promise, false).toBeGreaterThan(expected),
    toBeGreaterThanOrEqual: async (expected) =>
      createAsyncMatcher(await promise, false).toBeGreaterThanOrEqual(expected),
    toBeLessThan: async (expected) =>
      createAsyncMatcher(await promise, false).toBeLessThan(expected),
    toBeLessThanOrEqual: async (expected) =>
      createAsyncMatcher(await promise, false).toBeLessThanOrEqual(expected),
    toBeCloseTo: async (expected, precision) =>
      createAsyncMatcher(await promise, false).toBeCloseTo(expected, precision),
    toContain: async (expected) => createAsyncMatcher(await promise, false).toContain(expected),
    toContainEqual: async (expected) =>
      createAsyncMatcher(await promise, false).toContainEqual(expected),
    toHaveLength: async (expected) =>
      createAsyncMatcher(await promise, false).toHaveLength(expected),
    toHaveProperty: async (keyPath, value) =>
      createAsyncMatcher(await promise, false).toHaveProperty(keyPath, value),
    toBeInstanceOf: async (expected) =>
      createAsyncMatcher(await promise, false).toBeInstanceOf(expected),
    toBeTypeOf: async (expected) => createAsyncMatcher(await promise, false).toBeTypeOf(expected),
    toMatch: async (expected) => createAsyncMatcher(await promise, false).toMatch(expected),
    toStartWith: async (expected) => createAsyncMatcher(await promise, false).toStartWith(expected),
    toEndWith: async (expected) => createAsyncMatcher(await promise, false).toEndWith(expected),
    toThrow: async (expected) => createAsyncMatcher(await promise, false).toThrow(expected),
    toReturn: async (expected) => createAsyncMatcher(await promise, false).toReturn(expected),
  };
}

export function createRejectsMatcher(promise: Promise<unknown>): PromiseExpectChain {
  return {
    toBe: async (expected) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toBe(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved", undefined, expected);
    },
    toEqual: async (expected) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toEqual(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved", undefined, expected);
    },
    toStrictEqual: async (expected) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toStrictEqual(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved", undefined, expected);
    },
    toBeNull: async () => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toBeNull();
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toBeUndefined: async () => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toBeUndefined();
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toBeDefined: async () => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toBeDefined();
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toBeTruthy: async () => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toBeTruthy();
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toBeFalsy: async () => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toBeFalsy();
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toBeGreaterThan: async (expected: number | bigint) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toBeGreaterThan(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toBeGreaterThanOrEqual: async (expected: number | bigint) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toBeGreaterThanOrEqual(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toBeLessThan: async (expected: number | bigint) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toBeLessThan(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toBeLessThanOrEqual: async (expected: number | bigint) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toBeLessThanOrEqual(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toBeCloseTo: async (expected: number, precision?: number) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toBeCloseTo(expected, precision);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toContain: async (expected: unknown) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toContain(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toContainEqual: async (expected: unknown) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toContainEqual(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toHaveLength: async (expected: number) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toHaveLength(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toHaveProperty: async (keyPath: string | string[], value?: unknown) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toHaveProperty(keyPath, value);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toBeInstanceOf: async (expected: Constructor) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toBeInstanceOf(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toBeTypeOf: async (expected: TypeOfValue) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toBeTypeOf(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toMatch: async (expected: string | RegExp) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toMatch(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toStartWith: async (expected: string) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toStartWith(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toEndWith: async (expected: string) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toEndWith(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toThrow: async (expected?: string | RegExp | ErrorConstructor) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toThrow(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
    toReturn: async (expected: unknown) => {
      try {
        await promise;
      } catch (e) {
        return createAsyncMatcher(e, false).toReturn(expected);
      }
      throw new AssertionError("Expected promise to reject, but it resolved");
    },
  };
}
