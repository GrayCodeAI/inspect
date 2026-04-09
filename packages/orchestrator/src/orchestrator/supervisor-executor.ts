import { Effect, Layer, Schema, Stream, ServiceMap } from "effect";
import {
  TestPlan,
  ExecutedTestPlan,
  RunStarted,
  StepStarted,
  StepCompleted,
  StepFailed,
  UpdateContent,
  PlanId,
  StepId,
} from "@inspect/shared";
import { Updates } from "./updates.js";

export class ExecutionError extends Schema.ErrorClass<ExecutionError>("ExecutionError")({
  _tag: Schema.tag("ExecutionError"),
  cause: Schema.Unknown,
}) {
  message = `Execution failed: ${String(this.cause)}`;
}

export interface ExecutorService {
  readonly executePlan: (plan: TestPlan) => Effect.Effect<ExecutedTestPlan, ExecutionError>;
}

export class SupervisorExecutor extends ServiceMap.Service<SupervisorExecutor, ExecutorService>()(
  "@inspect/SupervisorExecutor",
) {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const updates = yield* Updates;

      const executePlan = (plan: TestPlan) =>
        Effect.gen(function* () {
          const runStarted = new RunStarted({ planId: PlanId.makeUnsafe(String(plan.id)) });
          yield* updates.publish(runStarted);

          let executed = new ExecutedTestPlan({
            ...plan,
            events: [runStarted],
          });

          for (const step of plan.steps) {
            const stepStarted = new StepStarted({
              stepId: step.id,
              timestamp: Date.now(),
            });
            yield* updates.publish(stepStarted);
            executed = executed.addEvent(stepStarted);

            yield* Effect.sleep(100);
            const stepCompleted = new StepCompleted({
              stepId: step.id,
              summary: `Step "${step.instruction}" completed successfully`,
              timestamp: Date.now(),
            });
            yield* updates.publish(stepCompleted);
            executed = executed.addEvent(stepCompleted);
          }

          return executed;
        });

      return { executePlan } as const;
    }),
  );
}
