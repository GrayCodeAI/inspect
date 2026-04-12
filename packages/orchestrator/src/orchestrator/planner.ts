import { Effect, Layer, Schema, ServiceMap } from "effect";
import { TestPlanDraft, TestPlan, TestPlanStep, StepId, PlanId } from "@inspect/shared";

export class PlanningError extends Schema.ErrorClass<PlanningError>("PlanningError")({
  _tag: Schema.tag("PlanningError"),
  cause: Schema.Unknown,
}) {
  message = `Planning failed: ${String(this.cause)}`;
}

export interface PlannerService {
  readonly plan: (draft: TestPlanDraft) => Effect.Effect<TestPlan, PlanningError>;
}

export class Planner extends ServiceMap.Service<Planner, PlannerService>()("@inspect/Planner") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const plan = (draft: TestPlanDraft) =>
        Effect.gen(function* () {
          yield* Effect.logWarning("Planner.plan() — connect LLM provider for plan generation");
          const steps = [
            new TestPlanStep({
              id: StepId.makeUnsafe("step-1"),
              instruction: "Navigate to the target URL and verify it loads",
              status: "pending",
            }),
            new TestPlanStep({
              id: StepId.makeUnsafe("step-2"),
              instruction: "Verify the main functionality works as expected",
              status: "pending",
            }),
          ];
          return new TestPlan({
            id: PlanId.makeUnsafe(`plan-${Date.now()}`),
            steps,
            baseUrl: draft.baseUrl,
            isHeadless: draft.isHeadless,
            requiresCookies: draft.requiresCookies,
            instruction: draft.instruction,
            createdAt: Date.now(),
          });
        });

      return { plan } as const;
    }),
  );
}
