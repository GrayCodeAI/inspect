import { describe, it, assert } from "@effect/vitest";
import { Effect, Layer } from "effect";
import {
  parseFeature,
  StepRegistry,
  ScenarioRunner,
  GherkinParseError,
  ScenarioExecutionError,
  StepDefinitionNotFoundError,
} from "./index.js";
import type { Scenario as ScenarioType } from "./index.js";

describe("GherkinParser", () => {
  describe("parseFeature", () => {
    it("parses a basic feature with name and description", () => {
      const content = `Feature: User Login
  Users should be able to log in with valid credentials
  The system validates email and password`;

      const feature = parseFeature(content, "test.feature");

      assert.strictEqual(feature.name, "User Login");
      assert.include(feature.description, "Users should be able to log in");
    });

    it("parses scenarios with Given/When/Then steps", () => {
      const content = `Feature: Shopping Cart

Scenario: Add item to cart
  Given I am on the product page
  When I click "Add to Cart"
  Then the item should appear in my cart`;

      const feature = parseFeature(content, "test.feature");

      assert.strictEqual(feature.scenarios.length, 1);
      const scenario = feature.scenarios[0];
      assert.strictEqual(scenario.name, "Add item to cart");
      assert.strictEqual(scenario.steps.length, 3);
      assert.strictEqual(scenario.steps[0].type, "Given");
      assert.strictEqual(scenario.steps[0].text, "I am on the product page");
      assert.strictEqual(scenario.steps[1].type, "When");
      assert.strictEqual(scenario.steps[1].text, 'I click "Add to Cart"');
      assert.strictEqual(scenario.steps[2].type, "Then");
      assert.strictEqual(
        scenario.steps[2].text,
        "the item should appear in my cart",
      );
    });

    it("parses And and But step types", () => {
      const content = `Feature: Authentication

Scenario: Login with multiple fields
  Given I open the login page
  When I enter my email
  And I enter my password
  Then I should be logged in
  But I should not see the login form`;

      const feature = parseFeature(content, "test.feature");

      const steps = feature.scenarios[0].steps;
      assert.strictEqual(steps.length, 5);
      assert.strictEqual(steps[2].type, "And");
      assert.strictEqual(steps[4].type, "But");
    });

    it("parses tags on scenarios", () => {
      const content = `Feature: User Management

@smoke @critical
Scenario: Admin login
  Given I am an admin user
  When I log in
  Then I should see the admin dashboard`;

      const feature = parseFeature(content, "test.feature");

      const scenario = feature.scenarios[0];
      assert.deepEqual(scenario.tags, ["smoke", "critical"]);
    });

    it("parses scenario outlines with examples", () => {
      const content = `Feature: Search

Scenario Outline: Search for products
  Given I am on the search page
  When I search for "<term>"
  Then I should see results for "<category>"

  Examples: Basic searches
    | term   | category |
    | shoes  | footwear |
    | shirt  | clothing |`;

      const feature = parseFeature(content, "test.feature");

      assert.strictEqual(feature.scenarioOutlines.length, 1);
      const outline = feature.scenarioOutlines[0];
      assert.strictEqual(outline.name, "Search for products");
      assert.strictEqual(outline.examples.length, 1);
      const example = outline.examples[0];
      assert.strictEqual(example.name, "Basic searches");
      assert.deepEqual(example.headers, ["term", "category"]);
      assert.deepEqual(example.rows, [
        ["shoes", "footwear"],
        ["shirt", "clothing"],
      ]);
    });

    it("parses multiple scenarios in a feature", () => {
      const content = `Feature: Checkout

Scenario: Checkout with credit card
  Given I have items in my cart
  When I pay with credit card
  Then the order should be confirmed

Scenario: Checkout with PayPal
  Given I have items in my cart
  When I pay with PayPal
  Then the order should be confirmed`;

      const feature = parseFeature(content, "test.feature");

      assert.strictEqual(feature.scenarios.length, 2);
      assert.strictEqual(feature.scenarios[0].name, "Checkout with credit card");
      assert.strictEqual(feature.scenarios[1].name, "Checkout with PayPal");
    });

    it("ignores comments and empty lines", () => {
      const content = `# This is a comment
Feature: Comments Test

# Another comment
Scenario: Test scenario
  Given a step
  Then another step`;

      const feature = parseFeature(content, "test.feature");

      assert.strictEqual(feature.scenarios.length, 1);
      assert.strictEqual(feature.scenarios[0].steps.length, 2);
    });

    it("handles feature-level tags", () => {
      const content = `@feature-tag
Feature: Tagged Feature

Scenario: A scenario
  Given something
  Then result`;

      const feature = parseFeature(content, "test.feature");

      assert.strictEqual(feature.scenarios.length, 1);
    });
  });
});

describe("StepRegistry", () => {
  const testLayer = StepRegistry.layer;

  it.effect("registers a step definition", () =>
    Effect.gen(function* () {
      const registry = yield* StepRegistry;
      yield* registry.register("I am on the (.*) page", () => Effect.void);

      const count = yield* registry.getRegisteredCount;
      assert.strictEqual(count, 1);
    }).pipe(Effect.provide(testLayer)) as Effect.Effect<void, never, never>);

  it.effect("matches a registered step", () =>
    Effect.gen(function* () {
      const registry = yield* StepRegistry;
      yield* registry.register("I am on the (.*) page", () => Effect.void);

      const definition = yield* registry.matchStep(
        "I am on the login page",
      );
      assert.ok(definition.pattern.test("I am on the login page"));
    }).pipe(Effect.provide(testLayer)) as Effect.Effect<void, never, never>);

  it.effect("fails with StepDefinitionNotFoundError for unregistered step", () =>
    Effect.gen(function* () {
      const registry = yield* StepRegistry;
      const result = yield* registry.matchStep("unknown step").pipe(
        Effect.flip,
      );

      assert.isTrue(result instanceof StepDefinitionNotFoundError);
      assert.strictEqual(result.stepText, "unknown step");
    }).pipe(Effect.provide(testLayer)) as Effect.Effect<void, never, never>);

  it.effect("tracks multiple registrations", () =>
    Effect.gen(function* () {
      const registry = yield* StepRegistry;
      yield* registry.register("step one", () => Effect.void);
      yield* registry.register("step two", () => Effect.void);
      yield* registry.register("step three", () => Effect.void);

      const count = yield* registry.getRegisteredCount;
      assert.strictEqual(count, 3);
    }).pipe(Effect.provide(testLayer)) as Effect.Effect<void, never, never>);
});

describe("ScenarioRunner", () => {
  // Provide both layers: ScenarioRunner needs StepRegistry, and test body also needs StepRegistry
  const testLayer = Layer.mergeAll(ScenarioRunner.layer, StepRegistry.layer);

  const makeScenario = (
    name: string,
    steps: Array<{ type: "Given" | "When" | "Then" | "And" | "But"; text: string; line: number }>,
    tags: string[] = [],
  ): ScenarioType =>
    ({
      name,
      tags,
      steps,
      line: 2,
    }) as ScenarioType;

  it.effect("runs a scenario with all passing steps", () =>
    Effect.gen(function* () {
      const registry = yield* StepRegistry;
      const runner = yield* ScenarioRunner;

      yield* registry.register("I have (.*) items", () => Effect.void);
      yield* registry.register("I proceed to checkout", () => Effect.void);
      yield* registry.register("the order is confirmed", () => Effect.void);

      const scenario = makeScenario("Checkout flow", [
        { type: "Given", text: "I have 3 items", line: 3 },
        { type: "When", text: "I proceed to checkout", line: 4 },
        { type: "Then", text: "the order is confirmed", line: 5 },
      ]);

      const result = yield* runner.runScenario(scenario);

      assert.strictEqual(result.passed, 3);
      assert.strictEqual(result.failed, 0);
      assert.strictEqual(result.errors.length, 0);
    }).pipe(Effect.provide(testLayer)) as Effect.Effect<void, never, never>);

  it.effect("tracks failed steps and collects errors", () =>
    Effect.gen(function* () {
      const registry = yield* StepRegistry;
      const runner = yield* ScenarioRunner;

      yield* registry.register("I have (.*) items", () => Effect.void);
      yield* registry.register("I proceed to checkout", () =>
        Effect.fail(
          new ScenarioExecutionError({
            scenario: "Checkout flow",
            step: "I proceed to checkout",
          }),
        ),
      );
      yield* registry.register("the order is confirmed", () => Effect.void);

      const scenario = makeScenario("Checkout flow", [
        { type: "Given", text: "I have 3 items", line: 3 },
        { type: "When", text: "I proceed to checkout", line: 4 },
        { type: "Then", text: "the order is confirmed", line: 5 },
      ]);

      const result = yield* runner.runScenario(scenario);

      assert.strictEqual(result.passed, 2);
      assert.strictEqual(result.failed, 1);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].step, "I proceed to checkout");
    }).pipe(Effect.provide(testLayer)) as Effect.Effect<void, never, never>);

  it.effect("handles unregistered steps as passing (fallback)", () =>
    Effect.gen(function* () {
      const registry = yield* StepRegistry;
      const runner = yield* ScenarioRunner;

      yield* registry.register("I have (.*) items", () => Effect.void);

      const scenario = makeScenario("Partial match", [
        { type: "Given", text: "I have 3 items", line: 3 },
        { type: "When", text: "I do something unknown", line: 4 },
      ]);

      const result = yield* runner.runScenario(scenario);

      assert.strictEqual(result.passed, 2);
      assert.strictEqual(result.failed, 0);
    }).pipe(Effect.provide(testLayer)) as Effect.Effect<void, never, never>);

  it.effect("runs scenario with no steps", () =>
    Effect.gen(function* () {
      const runner = yield* ScenarioRunner;

      const scenario = makeScenario("Empty scenario", []);

      const result = yield* runner.runScenario(scenario);

      assert.strictEqual(result.passed, 0);
      assert.strictEqual(result.failed, 0);
      assert.strictEqual(result.errors.length, 0);
    }).pipe(Effect.provide(testLayer)) as Effect.Effect<void, never, never>);
});

describe("Error classes", () => {
  it("GherkinParseError has correct display message", () => {
    const error = new GherkinParseError({ file: "test.feature", line: 10 });

    assert.strictEqual(
      error.displayMessage,
      "Failed to parse test.feature at line 10",
    );
    assert.strictEqual(error.file, "test.feature");
    assert.strictEqual(error.line, 10);
  });

  it("ScenarioExecutionError has correct display message", () => {
    const error = new ScenarioExecutionError({
      scenario: "Login flow",
      step: "I enter credentials",
    });

    assert.strictEqual(
      error.displayMessage,
      'Failed to execute step "I enter credentials" in scenario "Login flow"',
    );
  });

  it("ScenarioExecutionError accepts optional cause", () => {
    const error = new ScenarioExecutionError({
      scenario: "Login flow",
      step: "I enter credentials",
      cause: "Network error",
    });

    assert.strictEqual(error.cause, "Network error");
  });

  it("StepDefinitionNotFoundError has correct display message", () => {
    const error = new StepDefinitionNotFoundError({
      stepText: "unknown step text",
    });

    assert.strictEqual(
      error.displayMessage,
      'No step definition found for "unknown step text"',
    );
  });

  it("errors are Schema instances with correct _tag", () => {
    const gherkinError = new GherkinParseError({
      file: "test.feature",
      line: 1,
    });
    assert.strictEqual(gherkinError._tag, "GherkinParseError");

    const execError = new ScenarioExecutionError({
      scenario: "test",
      step: "step",
    });
    assert.strictEqual(execError._tag, "ScenarioExecutionError");

    const stepError = new StepDefinitionNotFoundError({
      stepText: "step",
    });
    assert.strictEqual(stepError._tag, "StepDefinitionNotFoundError");
  });
});
