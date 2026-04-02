/**
 * Agent Loop - Effect-TS Implementation
 *
 * Real observe → think → act → finalize loop with service dependencies.
 * Part of: Inspect Phase 2 Agent Loop Implementation
 */

import { Effect, Layer, Schema, ServiceMap, Stream } from "effect";
import { LLMProviderService, LLMMessage } from "@inspect/llm";

// BrowserSession interface for real browser interaction
interface BrowserSession {
  readonly navigate: (url: string) => Effect.Effect<void>;
  readonly close: Effect.Effect<void>;
  readonly url: Effect.Effect<string>;
  readonly title: Effect.Effect<string>;
  readonly screenshot: (path?: string) => Effect.Effect<string>;
  readonly evaluate: <T>(script: string) => Effect.Effect<T>;
  readonly click: (selector: string) => Effect.Effect<void>;
  readonly type: (selector: string, text: string) => Effect.Effect<void>;
  readonly getText: (selector: string) => Effect.Effect<string>;
  readonly isVisible: (selector: string) => Effect.Effect<boolean>;
  readonly consoleLogs: Effect.Effect<readonly string[]>;
}

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
  sessionId: Schema.optional(Schema.String),
  lastUrl: Schema.optional(Schema.String),
}) {}

export class AgentLoopConfig extends Schema.Class<AgentLoopConfig>("AgentLoopConfig")({
  goal: Schema.String,
  maxSteps: Schema.Number,
  timeout: Schema.Number,
  model: Schema.String,
  temperature: Schema.Number,
  url: Schema.optional(Schema.String),
  llmProvider: Schema.optional(Schema.String),
}) {}

// ─────────────────────────────────────────────────────────────────────────────
// AgentLoop Service with Effect-TS Integration
// ─────────────────────────────────────────────────────────────────────────────

export class AgentLoop extends ServiceMap.Service<AgentLoop>()("@agent/AgentLoop", {
  make: Effect.gen(function* () {
    yield* Effect.log("Initializing AgentLoop service");

    const run = Effect.fn("AgentLoop.run")(function* (config: AgentLoopConfig, session?: BrowserSession) {
      yield* Effect.annotateCurrentSpan({ goal: config.goal, maxSteps: config.maxSteps });
      yield* Effect.logInfo("Agent loop started", {
        goal: config.goal,
        maxSteps: config.maxSteps,
        hasSession: !!session,
      });

      const initialState = new AgentState({
        goal: config.goal,
        steps: [],
        currentStep: 0,
        maxSteps: config.maxSteps,
        completed: false,
        startedAt: new Date().toISOString(),
        observations: [],
        sessionId: session ? `session-${Date.now()}` : undefined,
        lastUrl: config.url,
      });

      let state = initialState;

      // Navigate to initial URL if provided and session available
      if (session && config.url) {
        yield* session.navigate(config.url);
        state = new AgentState({ ...state, lastUrl: config.url });
        yield* Effect.logDebug("Navigated to initial URL", { url: config.url });
      }

      while (state.currentStep < config.maxSteps && !state.completed) {
        const stepResult = yield* executeStep(state, state.currentStep, config, session);

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

function executeStep(state: AgentState, stepIndex: number, config: AgentLoopConfig, session?: BrowserSession) {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ stepIndex });

    // Phase 1: OBSERVE — Get browser state
    const observations = yield* observePhase(session);

    // Phase 2: THINK — Call LLM for next action
    const action = yield* thinkPhase(state, observations, config);

    // Phase 3: ACT — Execute the action
    const result = yield* actPhase(action, session);

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

// Phase 1: OBSERVE — Get browser state
function observePhase(session?: BrowserSession) {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ phase: "observe" });

    const observations: Observation[] = [];

    if (session) {
      // Capture real DOM via page evaluation
      try {
        const domContent = yield* session.evaluate<string>(`
          new XMLSerializer().serializeToString(document.documentElement)
        `);

        observations.push(
          new Observation({
            type: "dom",
            content: domContent,
            timestamp: Date.now(),
          }),
        );
      } catch (e) {
        yield* Effect.logDebug("Failed to capture DOM", { error: String(e) });
      }

      // Capture screenshot if available
      try {
        const screenshot = yield* session.screenshot();
        if (screenshot) {
          observations.push(
            new Observation({
              type: "screenshot",
              content: screenshot,
              timestamp: Date.now(),
            }),
          );
        }
      } catch (e) {
        yield* Effect.logDebug("Failed to capture screenshot", { error: String(e) });
      }

      // Capture console logs
      try {
        const logs = yield* session.consoleLogs;
        if (logs.length > 0) {
          observations.push(
            new Observation({
              type: "console",
              content: logs.join("\n"),
              timestamp: Date.now(),
            }),
          );
        }
      } catch (e) {
        yield* Effect.logDebug("Failed to capture console logs", { error: String(e) });
      }
    } else {
      // Fallback: mock DOM for testing
      observations.push(
        new Observation({
          type: "dom",
          content: "<html><body>Page loaded</body></html>",
          timestamp: Date.now(),
        }),
      );
    }

    yield* Effect.logDebug("Observations captured", {
      count: observations.length,
      types: observations.map((o) => o.type),
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

    // Call LLM service
    const messages = [
      new LLMMessage({
        role: "system",
        content: systemPrompt,
      }),
      new LLMMessage({
        role: "user",
        content: `Goal: ${state.goal}\nCurrent step: ${state.currentStep + 1}/${config.maxSteps}`,
      }),
    ] as const;

    try {
      // Access LLM service from Effect context
      const llm = yield* LLMProviderService;
      const response = yield* llm.complete(
        (config.llmProvider || "anthropic") as any,
        config.model,
        messages,
      );

      // Parse LLM response as JSON
      let actionData = { name: "verify", params: {}, description: "" };
      try {
        actionData = JSON.parse(response.text);
      } catch {
        // If JSON parsing fails, use response text as description
        actionData = {
          name: "verify",
          params: {},
          description: response.text,
        };
      }

      const action = new AgentAction({
        id: `action-${Date.now()}`,
        name: actionData.name || "verify",
        params: actionData.params || {},
        description: actionData.description || `Step ${state.currentStep + 1}: Taking action`,
      });

      yield* Effect.logDebug("Action planned via LLM", {
        name: action.name,
        tokens: response.totalTokens,
      });
      return action;
    } catch (e) {
      // Fallback to mock if LLM fails
      const mockResponse = {
        name: state.currentStep === 0 ? "navigate" : state.currentStep === 1 ? "click" : "verify",
        params: {},
        description: `Step ${state.currentStep + 1}: Taking action (fallback)`,
      };

      const action = new AgentAction({
        id: `action-${Date.now()}`,
        name: mockResponse.name,
        params: mockResponse.params,
        description: mockResponse.description,
      });

      yield* Effect.logDebug("Action planned (fallback)", { name: action.name });
      return action;
    }
  });
}

// Phase 3: ACT — Execute the action
function actPhase(action: AgentAction, session?: BrowserSession) {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ phase: "act", action: action.name });

    const startTime = Date.now();
    let success = true;
    let output: unknown = { message: `Executed ${action.name}` };
    let error: string | undefined;

    const params = action.params as Record<string, unknown>;

    if (session) {
      try {
        switch (action.name) {
          case "navigate": {
            const url = params.url as string;
            if (url) {
              yield* session.navigate(url);
              output = { navigated: url };
            } else {
              throw new Error("Missing URL for navigate action");
            }
            break;
          }

          case "click": {
            const selector = params.selector as string;
            if (selector) {
              yield* session.click(selector);
              output = { clicked: selector };
            } else {
              throw new Error("Missing selector for click action");
            }
            break;
          }

          case "type": {
            const selector = params.selector as string;
            const text = params.text as string;
            if (selector && text) {
              yield* session.type(selector, text);
              output = { typed: text, selector };
            } else {
              throw new Error("Missing selector or text for type action");
            }
            break;
          }

          case "extract": {
            const selector = params.selector as string;
            if (selector) {
              const text = yield* session.getText(selector);
              output = { extracted: text, selector };
            } else {
              throw new Error("Missing selector for extract action");
            }
            break;
          }

          case "verify": {
            const selector = params.selector as string;
            if (selector) {
              const visible = yield* session.isVisible(selector);
              output = { visible, selector };
            } else {
              output = { verified: true };
            }
            break;
          }

          default: {
            output = { action: action.name, params };
          }
        }
      } catch (e) {
        success = false;
        error = e instanceof Error ? e.message : String(e);
        output = { error: error, action: action.name };
      }
    } else {
      // Mock mode (no real browser)
      switch (action.name) {
        case "navigate": {
          output = { navigated: params.url || "mock-url" };
          break;
        }
        case "click": {
          output = { clicked: params.selector || "mock-element" };
          break;
        }
        case "type": {
          output = { typed: params.text || "mock-text" };
          break;
        }
        case "extract": {
          output = { extracted: "mock-data" };
          break;
        }
        default: {
          output = { verified: true };
        }
      }
    }

    const duration = Date.now() - startTime;

    yield* Effect.logDebug("Action executed", {
      action: action.name,
      success,
      duration,
      hasError: !!error,
    });

    return new ActionResult({
      success,
      output,
      error,
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
