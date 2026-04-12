// ──────────────────────────────────────────────────────────────────────────────
// Test Suite Builder
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { BddExecutionError } from "./errors.js";
import { BddRunner } from "./bdd-runner.js";

export class TestSuiteConfig extends Schema.Class<TestSuiteConfig>("TestSuiteConfig")({
  name: Schema.String,
  timeout: Schema.Number,
  retries: Schema.Number,
}) {}

export class TestStep extends Schema.Class<TestStep>("TestStep")({
  instruction: Schema.String,
  action: Schema.String,
  expected: Schema.String,
}) {}

export class TestScenario extends Schema.Class<TestScenario>("TestScenario")({
  name: Schema.String,
  given: Schema.String,
  when: Schema.String,
  then: Schema.String,
  steps: Schema.Array(TestStep),
}) {}

export interface TestSuiteBuilderService {
  readonly addScenario: (scenario: TestScenario) => Effect.Effect<void>;
  readonly build: () => Effect.Effect<void, BddExecutionError>;
}

export class TestSuiteBuilder extends ServiceMap.Service<
  TestSuiteBuilder,
  TestSuiteBuilderService
>()("@inspect/TestSuiteBuilder") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const bdd = yield* BddRunner;
      const scenarios: TestScenario[] = [];

      const addScenario = (scenario: TestScenario) =>
        Effect.sync(() => {
          scenarios.push(scenario);
        }).pipe(
          Effect.tap(() => Effect.logDebug("Test scenario added", { scenario: scenario.name })),
          Effect.withSpan("TestSuiteBuilder.addScenario"),
        );

      const build = () =>
        Effect.gen(function* () {
          yield* Effect.logInfo("Building test suite from scenarios");

          for (const scenario of scenarios) {
            yield* bdd.describe(scenario.name, () =>
              bdd.it(`should ${scenario.then}`, () =>
                Effect.gen(function* () {
                  for (const step of scenario.steps) {
                    yield* Effect.logDebug("Executing step", {
                      action: step.action,
                      expected: step.expected,
                    });
                  }

                  yield* Effect.logInfo("Scenario completed", {
                    scenario: scenario.name,
                  });
                }).pipe(
                  Effect.timeout(30000),
                  Effect.catchTag("TimeoutError", () =>
                    Effect.fail(
                      new BddExecutionError({
                        message: `Scenario timed out: ${scenario.name}`,
                        suite: scenario.name,
                      }),
                    ),
                  ),
                ),
              ),
            );
          }

          yield* bdd.run();
        }).pipe(Effect.withSpan("TestSuiteBuilder.build"));

      return { addScenario, build } as const;
    }),
  ).pipe(Layer.provide(BddRunner.layer));
}
