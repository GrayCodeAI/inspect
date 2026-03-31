/**
 * Matcher result returned by all matchers
 */
export interface MatcherResult {
  pass: boolean;
  message: () => string;
  actual?: unknown;
  expected?: unknown;
}

/**
 * Base matcher interface that all matchers implement
 */
export interface BaseMatcher {
  toBe(expected: unknown): MatcherResult;
  toEqual(expected: unknown): MatcherResult;
  toStrictEqual(expected: unknown): MatcherResult;
  toBeNull(): MatcherResult;
  toBeUndefined(): MatcherResult;
  toBeDefined(): MatcherResult;
  toBeTruthy(): MatcherResult;
  toBeFalsy(): MatcherResult;
  toBeGreaterThan(expected: number | bigint): MatcherResult;
  toBeGreaterThanOrEqual(expected: number | bigint): MatcherResult;
  toBeLessThan(expected: number | bigint): MatcherResult;
  toBeLessThanOrEqual(expected: number | bigint): MatcherResult;
  toBeCloseTo(expected: number, precision?: number): MatcherResult;
  toContain(expected: unknown): MatcherResult;
  toContainEqual(expected: unknown): MatcherResult;
  toHaveLength(expected: number): MatcherResult;
  toHaveProperty(keyPath: string | string[], value?: unknown): MatcherResult;
  toBeInstanceOf(expected: Constructor): MatcherResult;
  toBeTypeOf(expected: TypeOfValue): MatcherResult;
  toMatch(expected: string | RegExp): MatcherResult;
  toStartWith(expected: string): MatcherResult;
  toEndWith(expected: string): MatcherResult;
  toThrow(expected?: string | RegExp | ErrorConstructor): MatcherResult;
  toReturn(expected: unknown): MatcherResult;
}

/**
 * Constructor type for toBeInstanceOf
 */
export interface Constructor {
  new (...args: unknown[]): unknown;
}

/**
 * Valid values for toBeTypeOf
 */
export type TypeOfValue =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "symbol"
  | "undefined"
  | "object"
  | "function";

/**
 * Negated matcher interface
 */
export interface NegatedMatcher {
  toBe(expected: unknown): MatcherResult;
  toEqual(expected: unknown): MatcherResult;
  toStrictEqual(expected: unknown): MatcherResult;
  toBeNull(): MatcherResult;
  toBeUndefined(): MatcherResult;
  toBeDefined(): MatcherResult;
  toBeTruthy(): MatcherResult;
  toBeFalsy(): MatcherResult;
  toBeGreaterThan(expected: number | bigint): MatcherResult;
  toBeGreaterThanOrEqual(expected: number | bigint): MatcherResult;
  toBeLessThan(expected: number | bigint): MatcherResult;
  toBeLessThanOrEqual(expected: number | bigint): MatcherResult;
  toBeCloseTo(expected: number, precision?: number): MatcherResult;
  toContain(expected: unknown): MatcherResult;
  toContainEqual(expected: unknown): MatcherResult;
  toHaveLength(expected: number): MatcherResult;
  toHaveProperty(keyPath: string | string[], value?: unknown): MatcherResult;
  toBeInstanceOf(expected: Constructor): MatcherResult;
  toBeTypeOf(expected: TypeOfValue): MatcherResult;
  toMatch(expected: string | RegExp): MatcherResult;
  toStartWith(expected: string): MatcherResult;
  toEndWith(expected: string): MatcherResult;
  toThrow(expected?: string | RegExp | ErrorConstructor): MatcherResult;
  toReturn(expected: unknown): MatcherResult;
}

/**
 * Async matcher interface for promises
 */
export interface AsyncMatchers {
  resolves: PromiseExpectChain;
  rejects: PromiseExpectChain;
}

/**
 * Promise expectation chain
 */
export interface PromiseExpectChain {
  toBe(expected: unknown): Promise<MatcherResult>;
  toEqual(expected: unknown): Promise<MatcherResult>;
  toStrictEqual(expected: unknown): Promise<MatcherResult>;
  toBeNull(): Promise<MatcherResult>;
  toBeUndefined(): Promise<MatcherResult>;
  toBeDefined(): Promise<MatcherResult>;
  toBeTruthy(): Promise<MatcherResult>;
  toBeFalsy(): Promise<MatcherResult>;
  toBeGreaterThan(expected: number | bigint): Promise<MatcherResult>;
  toBeGreaterThanOrEqual(expected: number | bigint): Promise<MatcherResult>;
  toBeLessThan(expected: number | bigint): Promise<MatcherResult>;
  toBeLessThanOrEqual(expected: number | bigint): Promise<MatcherResult>;
  toBeCloseTo(expected: number, precision?: number): Promise<MatcherResult>;
  toContain(expected: unknown): Promise<MatcherResult>;
  toContainEqual(expected: unknown): Promise<MatcherResult>;
  toHaveLength(expected: number): Promise<MatcherResult>;
  toHaveProperty(keyPath: string | string[], value?: unknown): Promise<MatcherResult>;
  toBeInstanceOf(expected: Constructor): Promise<MatcherResult>;
  toBeTypeOf(expected: TypeOfValue): Promise<MatcherResult>;
  toMatch(expected: string | RegExp): Promise<MatcherResult>;
  toStartWith(expected: string): Promise<MatcherResult>;
  toEndWith(expected: string): Promise<MatcherResult>;
  toThrow(expected?: string | RegExp | ErrorConstructor): Promise<MatcherResult>;
  toReturn(expected: unknown): Promise<MatcherResult>;
}

/**
 * Expectation chain returned by expect()
 */
export interface ExpectChain extends AsyncMatchers {
  not: NegatedMatcher;
  toBe(expected: unknown): MatcherResult;
  toEqual(expected: unknown): MatcherResult;
  toStrictEqual(expected: unknown): MatcherResult;
  toBeNull(): MatcherResult;
  toBeUndefined(): MatcherResult;
  toBeDefined(): MatcherResult;
  toBeTruthy(): MatcherResult;
  toBeFalsy(): MatcherResult;
  toBeGreaterThan(expected: number | bigint): MatcherResult;
  toBeGreaterThanOrEqual(expected: number | bigint): MatcherResult;
  toBeLessThan(expected: number | bigint): MatcherResult;
  toBeLessThanOrEqual(expected: number | bigint): MatcherResult;
  toBeCloseTo(expected: number, precision?: number): MatcherResult;
  toContain(expected: unknown): MatcherResult;
  toContainEqual(expected: unknown): MatcherResult;
  toHaveLength(expected: number): MatcherResult;
  toHaveProperty(keyPath: string | string[], value?: unknown): MatcherResult;
  toBeInstanceOf(expected: Constructor): MatcherResult;
  toBeTypeOf(expected: TypeOfValue): MatcherResult;
  toMatch(expected: string | RegExp): MatcherResult;
  toStartWith(expected: string): MatcherResult;
  toEndWith(expected: string): MatcherResult;
  toThrow(expected?: string | RegExp | ErrorConstructor): MatcherResult;
  toReturn(expected: unknown): MatcherResult;
}

/**
 * Assertion error thrown when a matcher fails
 */
export interface AssertionFailure {
  passed: boolean;
  message: string;
  actual?: unknown;
  expected?: unknown;
}
