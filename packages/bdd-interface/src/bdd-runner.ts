// ──────────────────────────────────────────────────────────────────────────────
// BDD Runner Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { BddAssertionError, BddExecutionError } from "./errors.js";

export type HookFn = () => Effect.Effect<void, BddExecutionError>;
export type TestFn = () => Effect.Effect<void, BddExecutionError>;

export class BddTestCase extends Schema.Class<BddTestCase>("BddTestCase")({
  name: Schema.String,
  status: Schema.Literals(["pending", "running", "passed", "failed", "skipped"] as const),
  duration: Schema.Number,
  error: Schema.optional(Schema.String),
}) {}

export class BddTestSuite extends Schema.Class<BddTestSuite>("BddTestSuite")({
  name: Schema.String,
  tests: Schema.Array(BddTestCase),
  beforeHooks: Schema.Number,
  afterHooks: Schema.Number,
}) {}

export class BddTestResult extends Schema.Class<BddTestResult>("BddTestResult")({
  suiteName: Schema.String,
  totalTests: Schema.Number,
  passed: Schema.Number,
  failed: Schema.Number,
  skipped: Schema.Number,
  duration: Schema.Number,
  failures: Schema.Array(
    Schema.Struct({
      test: Schema.String,
      error: Schema.String,
    }),
  ),
}) {}

export interface BddRunnerService {
  readonly describe: (
    name: string,
    fn: () => Effect.Effect<void, BddExecutionError>,
  ) => Effect.Effect<BddTestSuite, BddExecutionError>;
  readonly it: (
    name: string,
    fn: TestFn,
  ) => Effect.Effect<BddTestCase, BddExecutionError>;
  readonly before: (fn: HookFn) => Effect.Effect<void>;
  readonly after: (fn: HookFn) => Effect.Effect<void>;
  readonly run: () => Effect.Effect<BddTestResult, BddExecutionError>;
}

export class BddRunner extends ServiceMap.Service<
  BddRunner,
  BddRunnerService
>()("@inspect/BddRunner") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const currentSuite = { value: undefined as BddTestSuite | undefined };
      const suites: BddTestSuite[] = [];
      const beforeHooks: HookFn[] = [];
      const afterHooks: HookFn[] = [];

      const describe = (name: string, fn: () => Effect.Effect<void, BddExecutionError>) =>
        Effect.gen(function* () {
          yield* Effect.logDebug("Starting test suite", { suite: name });

          const suite = new BddTestSuite({
            name,
            tests: [],
            beforeHooks: beforeHooks.length,
            afterHooks: afterHooks.length,
          });

          currentSuite.value = suite;

          yield* fn();

          suites.push(suite);
          currentSuite.value = undefined;

          yield* Effect.logInfo("Test suite completed", {
            suite: name,
            testCount: suite.tests.length,
          });

          return suite;
        }).pipe(
          Effect.catchTag("BddExecutionError", (err) =>
            Effect.fail(
              new BddExecutionError({
                message: `Suite "${name}" failed: ${err.message}`,
                suite: name,
                cause: err.cause,
              }),
            ),
          ),
          Effect.withSpan("BddRunner.describe"),
        );

      const it = (name: string, fn: TestFn) =>
        Effect.gen(function* () {
          const testCase = new BddTestCase({
            name,
            status: "pending",
            duration: 0,
          });

          if (currentSuite.value) {
            currentSuite.value = new BddTestSuite({
              ...currentSuite.value,
              tests: [...currentSuite.value.tests, testCase],
            });
          }

          yield* Effect.logDebug("Running test", { test: name });

          const startTime = Date.now();

          for (const hook of beforeHooks) {
            yield* hook().pipe(
              Effect.catchTag("BddExecutionError", (err) =>
                Effect.fail(
                  new BddExecutionError({
                    message: `Before hook failed: ${err.message}`,
                    test: name,
                    cause: err.cause,
                  }),
                ),
              ),
            );
          }

          const result = yield* fn().pipe(
            Effect.matchEffect({
              onSuccess: () =>
                Effect.succeed(
                  new BddTestCase({
                    name,
                    status: "passed",
                    duration: Date.now() - startTime,
                  }),
                ),
              onFailure: (err) =>
                Effect.succeed(
                  new BddTestCase({
                    name,
                    status: "failed",
                    duration: Date.now() - startTime,
                    error: err.message,
                  }),
                ),
            }),
          );

          for (const hook of afterHooks) {
            yield* hook().pipe(Effect.catchTag("BddExecutionError", () => Effect.void));
          }

          if (currentSuite.value) {
            const updatedTests = currentSuite.value.tests.map((t) =>
              t.name === name ? result : t,
            );
            currentSuite.value = new BddTestSuite({
              ...currentSuite.value,
              tests: updatedTests,
            });
          }

          return result;
        }).pipe(Effect.withSpan("BddRunner.it"));

      const before = (fn: HookFn) =>
        Effect.sync(() => {
          beforeHooks.push(fn);
        }).pipe(Effect.withSpan("BddRunner.before"));

      const after = (fn: HookFn) =>
        Effect.sync(() => {
          afterHooks.push(fn);
        }).pipe(Effect.withSpan("BddRunner.after"));

      const run = Effect.gen(function* () {
        yield* Effect.logInfo("Running all test suites");

        const startTime = Date.now();
        let totalPassed = 0;
        let totalFailed = 0;
        let totalSkipped = 0;
        const failures: Array<{ test: string; error: string }> = [];

        for (const suite of suites) {
          for (const test of suite.tests) {
            if (test.status === "passed") {
              totalPassed++;
            } else if (test.status === "failed") {
              totalFailed++;
              if (test.error) {
                failures.push({ test: test.name, error: test.error });
              }
            } else {
              totalSkipped++;
            }
          }
        }

        const result = new BddTestResult({
          suiteName: "all",
          totalTests: suites.reduce((sum, s) => sum + s.tests.length, 0),
          passed: totalPassed,
          failed: totalFailed,
          skipped: totalSkipped,
          duration: Date.now() - startTime,
          failures,
        });

        yield* Effect.logInfo("Test run completed", {
          totalTests: result.totalTests,
          passed: result.passed,
          failed: result.failed,
        });

        return result;
      }).pipe(Effect.withSpan("BddRunner.run"));

      return { describe, it, before, after, run } as const;
    }),
  );
}
