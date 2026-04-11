// ─────────────────────────────────────────────────────────────────────────────
// Fixture Factories — Test data generation for Inspect domain models
//
// Provides factory functions for creating test data with sensible defaults,
// override capabilities, and sequence-based unique fields.
//
// Usage:
//   const factory = createTestPlanFactory();
//   const plan = factory.build({ instruction: "login to the app" });
//   const plans = factory.buildList(5); // 5 unique plans
// ─────────────────────────────────────────────────────────────────────────────

import { TestPlan, TestPlanStep, TestResult, type TestPlanStepStatus } from "../models.js";
import type { CookieData } from "../types/browser-config.js";

export interface Factory<T> {
  readonly build: (overrides?: Partial<T>) => T;
  readonly buildList: (count: number, overrides?: Partial<T>) => T[];
}

let sequenceCounter = 0;

function nextSequence(): number {
  return ++sequenceCounter;
}

/**
 * Reset the sequence counter. Useful for deterministic tests.
 */
export function resetSequence(): void {
  sequenceCounter = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// TestPlanStep factory
// ─────────────────────────────────────────────────────────────────────────────

export function createTestPlanStepFactory(): Factory<TestPlanStep> {
  return {
    build: (overrides: Partial<TestPlanStep> = {}): TestPlanStep => {
      const seq = nextSequence();
      return new TestPlanStep({
        id: overrides.id ?? `step-${seq}`,
        instruction: overrides.instruction ?? `Navigate to page ${seq}`,
        status: (overrides.status ?? "pending") as TestPlanStepStatus,
        summary: overrides.summary ?? "",
        startedAt: overrides.startedAt ?? Date.now(),
        completedAt: overrides.completedAt ?? 0,
        duration: overrides.duration ?? 0,
        screenshot: overrides.screenshot,
        error: overrides.error,
      });
    },
    buildList: (count: number, overrides?: Partial<TestPlanStep>): TestPlanStep[] => {
      return Array.from({ length: count }, () => createTestPlanStepFactory().build(overrides));
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TestPlan factory
// ─────────────────────────────────────────────────────────────────────────────

export function createTestPlanFactory(): Factory<TestPlan> {
  return {
    build: (overrides: Partial<TestPlan> = {}): TestPlan => {
      const seq = nextSequence();
      const stepCount = overrides.steps?.length ?? 3;
      const stepFactory = createTestPlanStepFactory();
      const steps = overrides.steps ?? stepFactory.buildList(stepCount);

      return new TestPlan({
        id: overrides.id ?? `plan-${seq}`,
        steps,
        baseUrl: overrides.baseUrl,
        isHeadless: overrides.isHeadless ?? true,
        requiresCookies: overrides.requiresCookies ?? false,
        instruction: overrides.instruction ?? `Test plan ${seq}`,
        createdAt: overrides.createdAt ?? Date.now(),
      });
    },
    buildList: (count: number, overrides?: Partial<TestPlan>): TestPlan[] => {
      return Array.from({ length: count }, () => createTestPlanFactory().build(overrides));
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TestResult factory
// ─────────────────────────────────────────────────────────────────────────────

export function createTestResultFactory(): Factory<TestResult> {
  return {
    build: (overrides: Partial<TestResult> = {}): TestResult => {
      const seq = nextSequence();
      return new TestResult({
        status: (overrides.status ?? "passed") as "passed" | "failed" | "partial",
        summary: overrides.summary ?? `Test result ${seq}`,
        steps: overrides.steps ?? [],
        duration: overrides.duration ?? 1000,
        artifacts: overrides.artifacts ?? [],
        startedAt: overrides.startedAt ?? Date.now(),
        completedAt: overrides.completedAt ?? Date.now(),
      });
    },
    buildList: (count: number, overrides?: Partial<TestResult>): TestResult[] => {
      return Array.from({ length: count }, () => createTestResultFactory().build(overrides));
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CookieData factory
// ─────────────────────────────────────────────────────────────────────────────

export function createCookieDataFactory(): Factory<CookieData> {
  return {
    build: (overrides: Partial<CookieData> = {}): CookieData => {
      const seq = nextSequence();
      return {
        name: overrides.name ?? `cookie-${seq}`,
        value: overrides.value ?? `value-${seq}`,
        domain: overrides.domain ?? ".example.com",
        path: overrides.path ?? "/",
        expires: overrides.expires ?? Date.now() + 86400000,
        httpOnly: overrides.httpOnly ?? false,
        secure: overrides.secure ?? false,
        sameSite: overrides.sameSite ?? "Lax",
      };
    },
    buildList: (count: number, overrides?: Partial<CookieData>): CookieData[] => {
      return Array.from({ length: count }, () => createCookieDataFactory().build(overrides));
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic factory builder (for custom object types)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a generic factory for any object type.
 *
 * @param defaults Function returning default object values given a sequence number
 */
export function createGenericFactory<T extends object>(
  defaults: (seq: number) => T,
): Factory<T> {
  return {
    build: (overrides: Partial<T> = {}): T => {
      const seq = nextSequence();
      return { ...defaults(seq), ...overrides };
    },
    buildList: (count: number, overrides?: Partial<T>): T[] => {
      return Array.from({ length: count }, () =>
        createGenericFactory(defaults).build(overrides),
      );
    },
  };
}
