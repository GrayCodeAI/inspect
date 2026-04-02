import { Effect, Layer, Schema, ServiceMap } from "effect";

export class AgentBrainEvaluation extends Schema.Class<AgentBrainEvaluation>(
  "AgentBrainEvaluation",
)({
  success: Schema.Boolean,
  assessment: Schema.String,
  confidence: Schema.Number,
}) {}

export class AgentBrain extends Schema.Class<AgentBrain>("AgentBrain")({
  evaluation: AgentBrainEvaluation,
  memory: Schema.Array(Schema.String),
  nextGoal: Schema.String,
  flashMode: Schema.Boolean,
}) {}

export class AgentBrainService extends ServiceMap.Service<AgentBrainService>()(
  "@agent/AgentBrain",
  {
    make: Effect.gen(function* () {
      const think = Effect.fn("AgentBrain.think")(function* (
        observation: string,
        history: readonly string[],
        goal: string,
      ) {
        yield* Effect.annotateCurrentSpan({ goal });

        const evaluation = new AgentBrainEvaluation({
          success: false,
          assessment: "Processing observation",
          confidence: 0.5,
        });

        const brain = new AgentBrain({
          evaluation,
          memory: [...history, observation],
          nextGoal: goal,
          flashMode: false,
        });

        yield* Effect.logDebug("AgentBrain thinking", { goal });

        return brain;
      });

      const evaluate = Effect.fn("AgentBrain.evaluate")(function* (
        result: string,
        expectedOutcome: string,
      ) {
        yield* Effect.annotateCurrentSpan({ expectedOutcome });

        const success = result.includes(expectedOutcome);
        const confidence = success ? 0.9 : 0.3;

        const evaluation = new AgentBrainEvaluation({
          success,
          assessment: success ? "Outcome matched" : "Outcome did not match",
          confidence,
        });

        yield* Effect.logDebug("AgentBrain evaluation", { success, confidence });

        return evaluation;
      });

      const setFlashMode = Effect.fn("AgentBrain.setFlashMode")(function* (
        brain: AgentBrain,
        enabled: boolean,
      ) {
        return new AgentBrain({ ...brain, flashMode: enabled });
      });

      return { think, evaluate, setFlashMode } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
