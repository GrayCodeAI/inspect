import { Effect, Layer, Schema, ServiceMap } from "effect";
import { VisualTestCase, VisualTestStep, VisualTestSuite } from "./visual-types.js";
import { generatePlaywrightSuite, generatePlaywrightTest } from "./code-generator.js";

export class VisualTestCaseNotFoundError extends Schema.ErrorClass<VisualTestCaseNotFoundError>(
  "VisualTestCaseNotFoundError",
)({
  _tag: Schema.tag("VisualTestCaseNotFoundError"),
  caseId: Schema.String,
}) {
  message = `Test case ${this.caseId} not found`;
}

export class VisualTestSuiteNotFoundError extends Schema.ErrorClass<VisualTestSuiteNotFoundError>(
  "VisualTestSuiteNotFoundError",
)({
  _tag: Schema.tag("VisualTestSuiteNotFoundError"),
  suiteId: Schema.String,
}) {
  message = `Test suite ${this.suiteId} not found`;
}

export class VisualTestJsonParseError extends Schema.ErrorClass<VisualTestJsonParseError>(
  "VisualTestJsonParseError",
)({
  _tag: Schema.tag("VisualTestJsonParseError"),
  reason: Schema.String,
}) {
  message = `Failed to parse JSON: ${this.reason}`;
}

export class VisualTestBuilder extends ServiceMap.Service<VisualTestBuilder>()(
  "@inspect/VisualTestBuilder",
  {
    make: Effect.gen(function* () {
      const cases = new Map<string, VisualTestCase>();
      const suites = new Map<string, VisualTestSuite>();

      const createCase = Effect.fn("VisualTestBuilder.createCase")(function* (
        name: string,
        url: string,
        description?: string,
      ) {
        yield* Effect.annotateCurrentSpan({ name, url });
        const now = Date.now();
        const testCase = new VisualTestCase({
          id: `case-${generateId()}`,
          name,
          url,
          description,
          steps: [],
          tags: [],
          createdAt: now,
          updatedAt: now,
        });
        cases.set(testCase.id, testCase);
        yield* Effect.logInfo("Test case created", { caseId: testCase.id, name });
        return testCase;
      });

      const addStep = Effect.fn("VisualTestBuilder.addStep")(function* (
        caseId: string,
        step: VisualTestStep,
      ) {
        yield* Effect.annotateCurrentSpan({ caseId, stepType: step.type });
        const existingCase = cases.get(caseId);
        if (!existingCase) {
          return yield* new VisualTestCaseNotFoundError({ caseId });
        }
        const stepWithId = new VisualTestStep({
          ...step,
          id: step.id || `step-${generateId()}`,
        });
        const updatedCase = new VisualTestCase({
          ...existingCase,
          steps: [...existingCase.steps, stepWithId],
          updatedAt: Date.now(),
        });
        cases.set(caseId, updatedCase);
        yield* Effect.logInfo("Step added to test case", { caseId, stepId: stepWithId.id });
        return updatedCase;
      });

      const removeStep = Effect.fn("VisualTestBuilder.removeStep")(function* (
        caseId: string,
        stepId: string,
      ) {
        yield* Effect.annotateCurrentSpan({ caseId, stepId });
        const existingCase = cases.get(caseId);
        if (!existingCase) {
          return yield* new VisualTestCaseNotFoundError({ caseId });
        }
        const filteredSteps = existingCase.steps.filter((step) => step.id !== stepId);
        if (filteredSteps.length === existingCase.steps.length) {
          return existingCase;
        }
        const updatedCase = new VisualTestCase({
          ...existingCase,
          steps: filteredSteps,
          updatedAt: Date.now(),
        });
        cases.set(caseId, updatedCase);
        yield* Effect.logInfo("Step removed from test case", { caseId, stepId });
        return updatedCase;
      });

      const reorderSteps = Effect.fn("VisualTestBuilder.reorderSteps")(function* (
        caseId: string,
        stepIds: readonly string[],
      ) {
        yield* Effect.annotateCurrentSpan({ caseId, stepCount: stepIds.length });
        const existingCase = cases.get(caseId);
        if (!existingCase) {
          return yield* new VisualTestCaseNotFoundError({ caseId });
        }
        const stepMap = new Map(existingCase.steps.map((step: VisualTestStep) => [step.id, step]));
        const reorderedSteps = stepIds
          .map((id) => stepMap.get(id))
          .filter((step): step is VisualTestStep => step !== undefined);
        const updatedCase = new VisualTestCase({
          ...existingCase,
          steps: reorderedSteps,
          updatedAt: Date.now(),
        });
        cases.set(caseId, updatedCase);
        yield* Effect.logInfo("Steps reordered", { caseId, newOrder: stepIds.length });
        return updatedCase;
      });

      const getCase = Effect.fn("VisualTestBuilder.getCase")(function* (caseId: string) {
        yield* Effect.annotateCurrentSpan({ caseId });
        const existingCase = cases.get(caseId);
        if (!existingCase) {
          return yield* new VisualTestCaseNotFoundError({ caseId });
        }
        return existingCase;
      });

      const getAllCases = Effect.fn("VisualTestBuilder.getAllCases")(function* () {
        return Array.from(cases.values());
      });

      const createSuite = Effect.fn("VisualTestBuilder.createSuite")(function* (
        name: string,
        baseUrl: string,
        description?: string,
      ) {
        yield* Effect.annotateCurrentSpan({ name, baseUrl });
        const suite = new VisualTestSuite({
          id: `suite-${generateId()}`,
          name,
          baseUrl,
          description,
          cases: [],
          createdAt: Date.now(),
        });
        suites.set(suite.id, suite);
        yield* Effect.logInfo("Test suite created", { suiteId: suite.id, name });
        return suite;
      });

      const addCaseToSuite = Effect.fn("VisualTestBuilder.addCaseToSuite")(function* (
        suiteId: string,
        caseId: string,
      ) {
        yield* Effect.annotateCurrentSpan({ suiteId, caseId });
        const suite = suites.get(suiteId);
        if (!suite) {
          return yield* new VisualTestSuiteNotFoundError({ suiteId });
        }
        const existingCases = suite.cases ?? [];
        if (existingCases.includes(caseId)) {
          return suite;
        }
        const updatedSuite = new VisualTestSuite({
          ...suite,
          cases: [...existingCases, caseId],
        });
        suites.set(suiteId, updatedSuite);
        yield* Effect.logInfo("Case added to suite", { suiteId, caseId });
        return updatedSuite;
      });

      const generatePlaywright = Effect.fn("VisualTestBuilder.generatePlaywright")(function* (
        caseId: string,
      ) {
        yield* Effect.annotateCurrentSpan({ caseId });
        const testCase = cases.get(caseId);
        if (!testCase) {
          return yield* new VisualTestCaseNotFoundError({ caseId });
        }
        const code = generatePlaywrightTest(testCase);
        yield* Effect.logInfo("Playwright test generated", { caseId, codeLength: code.length });
        return code;
      });

      const generateSuiteCode = Effect.fn("VisualTestBuilder.generateSuiteCode")(function* (
        suiteId: string,
      ) {
        yield* Effect.annotateCurrentSpan({ suiteId });
        const suite = suites.get(suiteId);
        if (!suite) {
          return yield* new VisualTestSuiteNotFoundError({ suiteId });
        }
        const code = generatePlaywrightSuite(suite);
        yield* Effect.logInfo("Playwright suite generated", { suiteId, codeLength: code.length });
        return code;
      });

      const exportToJson = Effect.fn("VisualTestBuilder.exportToJson")(function* (caseId: string) {
        yield* Effect.annotateCurrentSpan({ caseId });
        const testCase = cases.get(caseId);
        if (!testCase) {
          return yield* new VisualTestCaseNotFoundError({ caseId });
        }
        return JSON.stringify(testCase, null, 2);
      });

      const importFromJson = Effect.fn("VisualTestBuilder.importFromJson")(function* (
        json: string,
      ) {
        yield* Effect.annotateCurrentSpan({ jsonLength: json.length });
        const parsed = yield* Effect.try({
          try: () => JSON.parse(json) as unknown,
          catch: (error) =>
            new VisualTestJsonParseError({
              reason: error instanceof Error ? error.message : String(error),
            }),
        });

        const decoded = yield* Schema.decodeUnknownEffect(VisualTestCase)(parsed);
        const testCase = new VisualTestCase(decoded);
        cases.set(testCase.id, testCase);
        yield* Effect.logInfo("Test case imported from JSON", { caseId: testCase.id });
        return testCase;
      });

      return {
        createCase,
        addStep,
        removeStep,
        reorderSteps,
        getCase,
        getAllCases,
        createSuite,
        addCaseToSuite,
        generatePlaywright,
        generateSuiteCode,
        exportToJson,
        importFromJson,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}

const generateId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
