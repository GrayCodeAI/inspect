import { Effect, Layer, Schema, ServiceMap } from "effect";
import { TestPlan, TestPlanStep } from "@inspect/shared";

export const ForkType = Schema.Literals([
  "direct-path",
  "include-branches",
  "target-level",
] as const);
export type ForkType = typeof ForkType.Type;

export class TestPlanFork extends Schema.Class<TestPlanFork>("TestPlanFork")({
  forkId: Schema.String,
  sourcePlanId: Schema.String,
  sourceStepIndex: Schema.Number,
  forkType: ForkType,
  newPlanId: Schema.String,
  createdAt: Schema.Number,
  metadata: Schema.Record(Schema.String, Schema.Unknown),
}) {}

export interface ForkOptions {
  name: string;
  description?: string;
  forkType?: ForkType;
  replaceSteps?: boolean;
}

export interface StepDifference {
  stepIndex: number;
  before: TestPlanStep;
  after: TestPlanStep;
}

export interface ForkComparisonResult {
  differences: StepDifference[];
  similarity: number;
}

export class ForkNotFoundError extends Schema.ErrorClass<ForkNotFoundError>("ForkNotFoundError")({
  _tag: Schema.tag("ForkNotFoundError"),
  forkId: Schema.String,
}) {
  message = `Fork not found: ${this.forkId}`;
}

export class InvalidForkOperationError extends Schema.ErrorClass<InvalidForkOperationError>(
  "InvalidForkOperationError",
)({
  _tag: Schema.tag("InvalidForkOperationError"),
  operation: Schema.String,
  reason: Schema.String,
}) {
  message = `Invalid fork operation "${this.operation}": ${this.reason}`;
}

const generateId = (): string => {
  return `fork_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

const generatePlanId = (): string => {
  return `plan_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

export class TestPlanForkManager extends ServiceMap.Service<TestPlanForkManager>()(
  "@inspect/TestPlanForkManager",
  {
    make: Effect.gen(function* () {
      const forks = new Map<string, TestPlanFork>();
      const forkPlans = new Map<string, TestPlan>();

      const fork = Effect.fn("TestPlanForkManager.fork")(function* (
        sourcePlanId: string,
        sourceStepIndex: number,
        options: ForkOptions,
      ) {
        const forkType = options.forkType ?? "direct-path";
        const forkId = generateId();
        const newPlanId = generatePlanId();

        const forkRecord = new TestPlanFork({
          forkId,
          sourcePlanId,
          sourceStepIndex,
          forkType,
          newPlanId,
          createdAt: Date.now(),
          metadata: {
            name: options.name,
            description: options.description,
            replaceSteps: options.replaceSteps,
          },
        });

        forks.set(forkId, forkRecord);

        yield* Effect.logInfo("Test plan forked", {
          forkId,
          sourcePlanId,
          sourceStepIndex,
          forkType,
          newPlanId,
        });

        return forkRecord;
      });

      const createForkedPlan = Effect.fn("TestPlanForkManager.createForkedPlan")(function* (
        sourcePlan: TestPlan,
        sourceStepIndex: number,
        forkType: ForkType,
        options: ForkOptions,
      ) {
        const newPlanId = generatePlanId();

        let newSteps: TestPlanStep[] = [];

        if (forkType === "direct-path") {
          newSteps = sourcePlan.steps.slice(0, sourceStepIndex + 1).map((step, index) => {
            return new TestPlanStep({
              id: `${newPlanId}_step_${index}`,
              instruction: step.instruction,
              status: index === sourceStepIndex ? "active" : step.status,
              summary: step.summary,
              startedAt: step.startedAt,
              completedAt: step.completedAt,
              duration: step.duration,
              screenshot: step.screenshot,
              error: step.error,
            });
          });
        } else if (forkType === "include-branches") {
          newSteps = sourcePlan.steps.map((step, index) => {
            const isBranch = index > sourceStepIndex;
            return new TestPlanStep({
              id: `${newPlanId}_step_${index}`,
              instruction: step.instruction,
              status: isBranch ? "pending" : step.status,
              summary: step.summary,
              startedAt: isBranch ? undefined : step.startedAt,
              completedAt: isBranch ? undefined : step.completedAt,
              duration: isBranch ? undefined : step.duration,
              screenshot: step.screenshot,
              error: isBranch ? undefined : step.error,
            });
          });
        } else if (forkType === "target-level") {
          const targetStep = sourcePlan.steps[sourceStepIndex];

          newSteps = sourcePlan.steps
            .filter((step) => {
              const targetLevel = (targetStep as unknown as { level?: number })?.level;
              const stepLevel = (step as unknown as { level?: number })?.level;
              return stepLevel === targetLevel;
            })
            .map((step, index) => {
              return new TestPlanStep({
                id: `${newPlanId}_step_${index}`,
                instruction: step.instruction,
                status: step.id === targetStep?.id ? "active" : "pending",
                summary: step.summary,
                startedAt: step.id === targetStep?.id ? step.startedAt : undefined,
                completedAt: step.id === targetStep?.id ? step.completedAt : undefined,
                duration: step.id === targetStep?.id ? step.duration : undefined,
                screenshot: step.screenshot,
                error: step.error,
              });
            });
        }

        const forkedPlan = new TestPlan({
          id: newPlanId,
          steps: newSteps,
          baseUrl: sourcePlan.baseUrl,
          isHeadless: sourcePlan.isHeadless,
          requiresCookies: sourcePlan.requiresCookies,
          instruction: options.name,
          createdAt: Date.now(),
        });

        forkPlans.set(newPlanId, forkedPlan);

        return forkedPlan;
      });

      const merge = Effect.fn("TestPlanForkManager.merge")(function* (
        forkId: string,
        targetPlanId?: string,
      ) {
        const forkRecord = forks.get(forkId);

        if (!forkRecord) {
          return yield* new ForkNotFoundError({ forkId }).asEffect();
        }

        const targetId = targetPlanId ?? forkRecord.sourcePlanId;
        const forkedPlan = forkPlans.get(forkRecord.newPlanId);

        if (!forkedPlan) {
          return yield* new InvalidForkOperationError({
            operation: "merge",
            reason: `Forked plan ${forkRecord.newPlanId} not found`,
          }).asEffect();
        }

        yield* Effect.logInfo("Test plan fork merged", {
          forkId,
          sourcePlanId: forkRecord.sourcePlanId,
          targetPlanId: targetId,
        });

        return forkedPlan;
      });

      const listForks = Effect.fn("TestPlanForkManager.listForks")(function* (planId: string) {
        const planForks: TestPlanFork[] = [];

        for (const forkRecord of forks.values()) {
          if (forkRecord.sourcePlanId === planId || forkRecord.newPlanId === planId) {
            planForks.push(forkRecord);
          }
        }

        return planForks.sort((left, right) => right.createdAt - left.createdAt);
      });

      const getFork = Effect.fn("TestPlanForkManager.getFork")(function* (forkId: string) {
        const forkRecord = forks.get(forkId);
        return forkRecord ?? null;
      });

      const compare = Effect.fn("TestPlanForkManager.compare")(function* (
        forkId1: string,
        forkId2: string,
      ) {
        const fork1 = forks.get(forkId1);
        const fork2 = forks.get(forkId2);

        if (!fork1) {
          return yield* new ForkNotFoundError({ forkId: forkId1 }).asEffect();
        }

        if (!fork2) {
          return yield* new ForkNotFoundError({ forkId: forkId2 }).asEffect();
        }

        const plan1 = forkPlans.get(fork1.newPlanId);
        const plan2 = forkPlans.get(fork2.newPlanId);

        if (!plan1 || !plan2) {
          return yield* new InvalidForkOperationError({
            operation: "compare",
            reason: "One or both forked plans not found",
          }).asEffect();
        }

        const differences: StepDifference[] = [];
        const maxSteps = Math.max(plan1.steps.length, plan2.steps.length);

        for (let index = 0; index < maxSteps; index++) {
          const step1 = plan1.steps[index];
          const step2 = plan2.steps[index];

          if (!step1 || !step2) {
            if (step1) {
              differences.push({
                stepIndex: index,
                before: step1,
                after: step2 as TestPlanStep,
              });
            } else if (step2) {
              differences.push({
                stepIndex: index,
                before: step1 as TestPlanStep,
                after: step2,
              });
            }
          } else if (step1.instruction !== step2.instruction || step1.status !== step2.status) {
            differences.push({
              stepIndex: index,
              before: step1,
              after: step2,
            });
          }
        }

        const totalSteps = Math.max(plan1.steps.length, plan2.steps.length);
        const changedSteps = differences.length;
        const similarity = totalSteps > 0 ? 1 - changedSteps / totalSteps : 1;

        const result: ForkComparisonResult = {
          differences,
          similarity,
        };

        return result;
      });

      const deleteFork = Effect.fn("TestPlanForkManager.deleteFork")(function* (forkId: string) {
        const forkRecord = forks.get(forkId);

        if (forkRecord) {
          forkPlans.delete(forkRecord.newPlanId);
          forks.delete(forkId);

          yield* Effect.logInfo("Test plan fork deleted", { forkId });
        }
      });

      const getForkedPlan = Effect.fn("TestPlanForkManager.getForkedPlan")(function* (
        planId: string,
      ) {
        return forkPlans.get(planId) ?? null;
      });

      return {
        fork,
        createForkedPlan,
        merge,
        listForks,
        getFork,
        compare,
        deleteFork: deleteFork,
        getForkedPlan,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
