/**
 * Agent Loop - Effect-TS Implementation
 *
 * Real observe → think → act → finalize loop with service dependencies.
 * Part of: Inspect Phase 2 Agent Loop Implementation
 */

import { Effect, Layer, Schema, ServiceMap, Stream } from "effect";

// ─────────────────────────────────────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export class Observation extends Schema.Class<Observation>("Observation")({
  type: Schema.Literals(["dom", "screenshot", "network", "console"] as const),
  content: Schema.String,
  timestamp: Schema.Number,
}) {}

export class AgentAction extends Schema.Class<AgentAction>("AgentAction")({
  id: Schema.String,
  name: Schema.String,
  params: Schema.Unknown,
  description: Schema.String,
}) {}

export class ActionResult extends Schema.Class<ActionResult>("ActionResult")({
  success: Schema.Boolean,
  output: Schema.Unknown,
  error: Schema.optional(Schema.String),
  duration: Schema.Number,
}) {}

export class AgentStep extends Schema.Class<AgentStep>("AgentStep")({
  index: Schema.Number,
  action: AgentAction,
  result: ActionResult,
  timestamp: Schema.String,
}) {}

export class AgentState extends Schema.Class<AgentState>("AgentState")({
  goal: Schema.String,
  steps: Schema.Array(AgentStep),
  currentStep: Schema.Number,
  maxSteps: Schema.Number,
  completed: Schema.Boolean,
  startedAt: Schema.String,
  observations: Schema.Array(Observation),
}) {}

export class AgentLoopConfig extends Schema.Class<AgentLoopConfig>("AgentLoopConfig")({
  goal: Schema.String,
  maxSteps: Schema.Number,
  timeout: Schema.Number,
  model: Schema.String,
  temperature: Schema.Number,
}) {}

// ─────────────────────────────────────────────────────────────────────────────
// AgentLoop Service with Effect-TS Integration
// ─────────────────────────────────────────────────────────────────────────────

export class AgentLoop extends ServiceMap.Service<AgentLoop>()("@agent/AgentLoop", {
  make: Effect.gen(function* () {
    yield* Effect.log("Initializing AgentLoop service");

    const run = Effect.fn("AgentLoop.run")(function* (config: AgentLoopConfig) {
      yield* Effect.annotateCurrentSpan({ goal: config.goal, maxSteps: config.maxSteps });
      yield* Effect.logInfo("Agent loop started", {
        goal: config.goal,
        maxSteps: config.maxSteps,
      });

      const initialState = new AgentState({
        goal: config.goal,
        steps: [],
        currentStep: 0,
        maxSteps: config.maxSteps,
        completed: false,
        startedAt: new Date().toISOString(),
        observations: [],
      });

      let state = initialState;

      while (state.currentStep < config.maxSteps && !state.completed) {
        const stepResult = yield* executeStep(state, state.currentStep, config);

        state = stepResult;

        yield* Effect.logDebug("Agent step completed", {
          step: state.currentStep,
          completed: state.completed,
        });

        // Timeout check
        const elapsed = Date.now() - new Date(state.startedAt).getTime();
        if (elapsed > config.timeout) {
          yield* Effect.logWarning("Agent loop timeout reached", {
            elapsed,
            timeout: config.timeout,
          });
          state = new AgentState({
            ...state,
            completed: true,
          });
        }
      }

      yield* Effect.logInfo("Agent loop completed", {
        goal: config.goal,
        stepsCompleted: state.currentStep,
        completed: state.completed,
        duration: Date.now() - new Date(state.startedAt).getTime(),
      });

      return state;
    });

    const runStream = Effect.fn("AgentLoop.runStream")(function* (config: AgentLoopConfig) {
      const fullRun = yield* run(config);
      return Stream.fromIterable(fullRun.steps);
    });

    return { run, runStream } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase Implementations
// ─────────────────────────────────────────────────────────────────────────────

function executeStep(state: AgentState, stepIndex: number, config: AgentLoopConfig) {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ stepIndex });

    // Phase 1: OBSERVE — Get browser state
    const observations = yield* observePhase();

    // Phase 2: THINK — Call LLM for next action
    const action = yield* thinkPhase(state, observations, config);

    // Phase 3: ACT — Execute the action
    const result = yield* actPhase(action);

    // Phase 4: FINALIZE — Record result and update state
    const step = new AgentStep({
      index: stepIndex,
      action,
      result,
      timestamp: new Date().toISOString(),
    });

    const isComplete = yield* finalizePhase(result, state);

    return new AgentState({
      ...state,
      steps: [...state.steps, step],
      currentStep: stepIndex + 1,
      completed: isComplete,
      observations: [...state.observations, ...observations],
    });
  });
}

// Phase 1: OBSERVE — Get browser state (placeholder for now)
function observePhase() {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ phase: "observe" });

    const observations: Observation[] = [];

    // Placeholder: would integrate with BrowserManager here
    observations.push(
      new Observation({
        type: "dom",
        content: "<html><body>Page loaded</body></html>",
        timestamp: Date.now(),
      }),
    );

    yield* Effect.logDebug("Observations captured", {
      count: observations.length,
    });

    return observations;
  });
}

// Phase 2: THINK — Call LLM for next action
function thinkPhase(state: AgentState, observations: Observation[], config: AgentLoopConfig) {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ phase: "think" });

    // Build prompt from observations and goal
    const observationText = observations.map((o) => `[${o.type}] ${o.content}`).join("\n");

    const systemPrompt = `You are an AI agent testing a web application.
Goal: ${state.goal}
Step: ${state.currentStep + 1}/${config.maxSteps}

Current observations:
${observationText}

Respond with a JSON action:
{
  "name": "click|type|navigate|verify",
  "params": {},
  "description": "what you're doing"
}`;

    // Placeholder: would call LLM here
    const mockResponse = {
      name: state.currentStep === 0 ? "navigate" : state.currentStep === 1 ? "click" : "verify",
      params: {},
      description: `Step ${state.currentStep + 1}: Taking action`,
    };

    const action = new AgentAction({
      id: `action-${Date.now()}`,
      name: mockResponse.name,
      params: mockResponse.params,
      description: mockResponse.description,
    });

    yield* Effect.logDebug("Action planned", { name: action.name });
    return action;
  });
}

// Phase 3: ACT — Execute the action
function actPhase(action: AgentAction) {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ phase: "act", action: action.name });

    const startTime = Date.now();

    // Placeholder: would execute via ToolRegistry here
    const duration = Date.now() - startTime;

    yield* Effect.logDebug("Action executed", {
      action: action.name,
      duration,
    });

    return new ActionResult({
      success: true,
      output: { message: `Executed ${action.name}` },
      duration,
    });
  });
}

// Phase 4: FINALIZE — Record result and update state
function finalizePhase(result: ActionResult, state: AgentState) {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ phase: "finalize" });

    // Check if goal is achieved (simplified: 5 steps = done)
    const isComplete = state.currentStep >= 4;

    yield* Effect.logDebug("Step finalized", {
      success: result.success,
      complete: isComplete,
    });

    return isComplete;
  });
}
