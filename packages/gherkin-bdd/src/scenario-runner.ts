import { Effect, ServiceMap, Layer, Ref } from "effect";
import type { Step, Scenario } from "./gherkin-parser.js";
import { StepDefinitionNotFoundError, ScenarioExecutionError } from "./errors.js";

export type StepHandler = (context: StepContext) => Effect.Effect<void, ScenarioExecutionError>;

export interface StepContext {
  readonly stepText: string;
  readonly scenarioName: string;
  readonly exampleData?: Record<string, string>;
}

export interface StepDefinition {
  readonly pattern: RegExp;
  readonly handler: StepHandler;
}

export class StepRegistry extends ServiceMap.Service<
  StepRegistry,
  {
    readonly register: (pattern: string, handler: StepHandler) => Effect.Effect<void>;
    readonly matchStep: (
      text: string,
    ) => Effect.Effect<StepDefinition, StepDefinitionNotFoundError>;
    readonly getRegisteredCount: Effect.Effect<number>;
  }
>()("@gherkin-bdd/StepRegistry") {
  static make = Effect.gen(function* () {
    const definitions = yield* Ref.make<StepDefinition[]>([]);

    const register = (pattern: string, handler: StepHandler) =>
      Ref.update(definitions, (defs) => [...defs, { pattern: new RegExp(pattern), handler }]);

    const matchStep = (text: string) =>
      Ref.get(definitions).pipe(
        Effect.flatMap((defs) => {
          const found = defs.find((d) => d.pattern.test(text));
          if (!found) {
            return Effect.fail(new StepDefinitionNotFoundError({ stepText: text }));
          }
          return Effect.succeed(found);
        }),
      );

    const getRegisteredCount = Ref.get(definitions).pipe(Effect.map((defs) => defs.length));

    return { register, matchStep, getRegisteredCount } as const;
  });

  static layer = Layer.effect(this, this.make);
}

export class ScenarioRunner extends ServiceMap.Service<
  ScenarioRunner,
  {
    readonly runScenario: (
      scenario: Scenario,
    ) => Effect.Effect<{ passed: number; failed: number; errors: ScenarioExecutionError[] }, never>;
  }
>()("@gherkin-bdd/ScenarioRunner") {
  static make = Effect.gen(function* () {
    const registry = yield* StepRegistry;

    const runScenario = (scenario: Scenario) =>
      Effect.gen(function* () {
        let passed = 0;
        let failed = 0;
        const errors: ScenarioExecutionError[] = [];

        for (const step of scenario.steps) {
          const result = yield* runStep(step, scenario.name);
          if (result._tag === "success") {
            passed++;
          } else {
            failed++;
            errors.push(result.error);
          }
        }

        return { passed, failed, errors } as const;
      }).pipe(Effect.withSpan("ScenarioRunner.runScenario"));

    const runStep = (step: Step, scenarioName: string) =>
      Effect.gen(function* () {
        const definition = yield* registry.matchStep(step.text).pipe(
          Effect.catchTag("StepDefinitionNotFoundError", () =>
            Effect.succeed({
              pattern: new RegExp(".*"),
              handler: () => Effect.void,
            }),
          ),
        );

        const result = yield* definition
          .handler({
            stepText: step.text,
            scenarioName,
          })
          .pipe(
            Effect.matchEffect({
              onSuccess: () => Effect.succeed({ _tag: "success" as const }),
              onFailure: (error) =>
                Effect.succeed({
                  _tag: "failure" as const,
                  error: new ScenarioExecutionError({
                    scenario: scenarioName,
                    step: step.text,
                    cause: error,
                  }),
                }),
            }),
          );

        return result;
      });

    return { runScenario } as const;
  });

  static layer = Layer.effect(this, this.make).pipe(Layer.provide(StepRegistry.layer));
}
