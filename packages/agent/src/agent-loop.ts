import { Effect, Layer, Schema, ServiceMap } from "effect";

export class AgentStep extends Schema.Class<AgentStep>("AgentStep")({
  index: Schema.Number,
  action: Schema.String,
  result: Schema.String,
  timestamp: Schema.String,
}) {}

export class AgentState extends Schema.Class<AgentState>("AgentState")({
  goal: Schema.String,
  steps: Schema.Array(AgentStep),
  currentStep: Schema.Number,
  maxSteps: Schema.Number,
  completed: Schema.Boolean,
  startedAt: Schema.String,
}) {}

export class AgentLoop extends ServiceMap.Service<AgentLoop>()("@agent/AgentLoop", {
  make: Effect.gen(function* () {
    const run = Effect.fn("AgentLoop.run")(function* (goal: string, maxSteps: number = 50) {
      yield* Effect.annotateCurrentSpan({ goal, maxSteps });

      const initialState = new AgentState({
        goal,
        steps: [],
        currentStep: 0,
        maxSteps,
        completed: false,
        startedAt: new Date().toISOString(),
      });

      yield* Effect.logInfo("Agent loop started", { goal, maxSteps });

      let state = initialState;

      while (state.currentStep < maxSteps && !state.completed) {
        const stepResult = yield* executeStep(state, state.currentStep);
        state = stepResult;
        yield* Effect.logDebug("Agent step completed", {
          step: state.currentStep,
          action: stepResult.steps[stepResult.steps.length - 1]?.action,
        });
      }

      yield* Effect.logInfo("Agent loop completed", {
        goal,
        stepsCompleted: state.currentStep,
        completed: state.completed,
      });

      return state;
    });

    return { run } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

function executeStep(state: AgentState, stepIndex: number) {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ stepIndex });

    const observeResult = yield* observe(state);
    const thinkResult = yield* think(state, observeResult);
    const actResult = yield* act(state, thinkResult);
    const finalizeResult = yield* finalize(state, actResult);

    const step = new AgentStep({
      index: stepIndex,
      action: thinkResult,
      result: actResult,
      timestamp: new Date().toISOString(),
    });

    return new AgentState({
      ...state,
      steps: [...state.steps, step],
      currentStep: stepIndex + 1,
      completed: finalizeResult,
    });
  });
}

function observe(_state: AgentState) {
  return Effect.succeed("observed");
}

function think(_state: AgentState, _observation: string) {
  return Effect.succeed("thought");
}

function act(_state: AgentState, _thought: string) {
  return Effect.succeed("acted");
}

function finalize(_state: AgentState, _action: string) {
  return Effect.succeed(true);
}
