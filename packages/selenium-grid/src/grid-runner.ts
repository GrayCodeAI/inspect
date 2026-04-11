import { Effect, FiberMap, Layer, Ref, Schedule, ServiceMap } from "effect";
import { GridManager, type GridSession, type GridCapabilities } from "./grid-manager.js";
import { GridError, SessionCreationError } from "./errors.js";

export interface TestExecution {
  testId: string;
  sessionId: string;
  nodeId: string;
  status: "running" | "passed" | "failed" | "cancelled";
  result?: unknown;
}

export interface DistributedTestPlan {
  testId: string;
  url: string;
  capabilities: GridCapabilities;
  steps: TestStep[];
}

export interface TestStep {
  action: string;
  selector?: string;
  value?: string;
}

export class GridRunner extends ServiceMap.Service<
  GridRunner,
  {
    readonly runTest: (
      plan: DistributedTestPlan,
    ) => Effect.Effect<TestExecution, GridError | SessionCreationError>;
    readonly runTests: (
      plans: DistributedTestPlan[],
    ) => Effect.Effect<TestExecution[], GridError | SessionCreationError>;
    readonly cancelTest: (
      testId: string,
    ) => Effect.Effect<void, GridError>;
    readonly getRunningTests: Effect.Effect<string[], GridError>;
  }
>()("@inspect/selenium-grid/GridRunner") {
  static make = Effect.gen(function* () {
    const gridManager = yield* GridManager;
    const runningFibers = yield* FiberMap.make<string>();
    const executionsRef = yield* Ref.make<Map<string, TestExecution>>(new Map());

    const runTest = (plan: DistributedTestPlan) =>
      Effect.gen(function* () {
        const execution: TestExecution = {
          testId: plan.testId,
          sessionId: "",
          nodeId: "",
          status: "running",
        };

        yield* Ref.update(executionsRef, (executions) => {
          const updated = new Map(executions);
          updated.set(plan.testId, execution);
          return updated;
        });

        const session = yield* gridManager.createSession(plan.capabilities);

        execution.sessionId = session.sessionId;
        execution.nodeId = session.nodeId;

        yield* Effect.logInfo("Starting distributed test", {
          testId: plan.testId,
          sessionId: session.sessionId,
          nodeId: session.nodeId,
        });

        // Execute test steps sequentially
        let allPassed = true;
        let lastResult: unknown;

        for (const step of plan.steps) {
          const stepResult = yield* executeStep(session.sessionId, step).pipe(
            Effect.catchTags({
              GridError: (error) => {
                allPassed = false;
                lastResult = error;
                return Effect.succeed(undefined);
              },
              SessionCreationError: (error) => {
                allPassed = false;
                lastResult = error;
                return Effect.succeed(undefined);
              },
            }),
          );

          if (stepResult !== undefined) {
            lastResult = stepResult;
          }
        }

        execution.status = allPassed ? "passed" : "failed";
        execution.result = lastResult;

        yield* gridManager.closeSession(session.sessionId);

        yield* Effect.logInfo("Distributed test completed", {
          testId: plan.testId,
          status: execution.status,
        });

        return execution;
      }).pipe(
        Effect.withSpan("GridRunner.runTest"),
        Effect.annotateCurrentSpan({ testId: plan.testId }),
      );

    const runTests = (plans: DistributedTestPlan[]) =>
      Effect.forEach(
        plans,
        (plan) => runTest(plan),
        { concurrency: MAX_CONCURRENT_TESTS },
      ).pipe(Effect.withSpan("GridRunner.runTests"));

    const cancelTest = (testId: string) =>
      Effect.gen(function* () {
        const execution = yield* Ref.get(executionsRef).pipe(
          Effect.map((executions) => executions.get(testId)),
        );

        if (execution?.sessionId) {
          yield* gridManager.closeSession(execution.sessionId);
        }

        yield* Ref.update(executionsRef, (executions) => {
          const updated = new Map(executions);
          const existing = updated.get(testId);
          if (existing) {
            updated.set(testId, { ...existing, status: "cancelled" });
          }
          return updated;
        });

        yield* Effect.logInfo("Test cancelled", { testId });
      }).pipe(Effect.withSpan("GridRunner.cancelTest"));

    const getRunningTests = Effect.gen(function* () {
      const executions = yield* Ref.get(executionsRef);
      return Array.from(executions.entries())
        .filter(([, exec]) => exec.status === "running")
        .map(([id]) => id);
    });

    return {
      runTest,
      runTests,
      cancelTest,
      getRunningTests,
    } as const;
  });

  static layer = Layer.effect(this, this.make).pipe(Layer.provide(GridManager.layer));
}

function executeStep(
  sessionId: string,
  step: TestStep,
): Effect.Effect<unknown, GridError> {
  return Effect.gen(function* () {
    yield* Effect.logDebug("Executing step", {
      sessionId,
      action: step.action,
      selector: step.selector,
    });

    // Steps are executed via the WebDriver session
    // Actual implementation would integrate with @inspect/webdriver
    return { action: step.action, success: true };
  });
}

const MAX_CONCURRENT_TESTS = 5;
