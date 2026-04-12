import { Effect, Layer, PubSub, ServiceMap } from "effect";
import { DagBuilder } from "./dag-builder.js";
import { DagRenderer } from "./dag-renderer.js";
import type { DagGraph, StepId } from "./dag-builder.js";
import { BreakpointError, VisualDebuggerError } from "./errors.js";

export type DebugEventType =
  | { readonly _tag: "StepStart"; readonly stepId: StepId }
  | { readonly _tag: "StepComplete"; readonly stepId: StepId; readonly result: string }
  | { readonly _tag: "StepError"; readonly stepId: StepId; readonly error: string }
  | { readonly _tag: "BreakpointHit"; readonly stepId: StepId }
  | {
      readonly _tag: "StateUpdate";
      readonly stepId: StepId;
      readonly state: Record<string, unknown>;
    };

export interface DebugEvent {
  readonly type: DebugEventType;
  readonly timestamp: Date;
  readonly dagId: string;
}

export interface Breakpoint {
  readonly stepId: StepId;
  readonly condition?: string;
  readonly enabled: boolean;
}

export interface DebuggerState {
  readonly currentStep: StepId | undefined;
  readonly executedSteps: readonly StepId[];
  readonly state: Record<string, unknown>;
  readonly isPaused: boolean;
  readonly breakpoints: readonly Breakpoint[];
}

export class Debugger extends ServiceMap.Service<Debugger>()("@visual-debugger/Debugger", {
  make: Effect.gen(function* () {
    const dagBuilder = yield* DagBuilder;
    const dagRenderer = yield* DagRenderer;

    const pubsub = yield* PubSub.unbounded<DebugEvent>();

    let currentState: DebuggerState = {
      currentStep: undefined,
      executedSteps: [],
      state: {},
      isPaused: false,
      breakpoints: [],
    };

    const loadDag = Effect.fn("Debugger.loadDag")(function* (yamlContent: string) {
      const dag = yield* dagBuilder.buildFromYaml(yamlContent);
      yield* dagBuilder.validate(dag);
      return dag;
    });

    const renderDag = Effect.fn("Debugger.renderDag")(function* (dag: DagGraph) {
      return yield* dagRenderer.renderAscii(dag);
    });

    const addBreakpoint = Effect.fn("Debugger.addBreakpoint")(function* (
      stepId: StepId,
      condition?: string,
    ) {
      const exists = currentState.breakpoints.some((bp) => bp.stepId === stepId);
      if (exists) {
        return yield* new BreakpointError({
          stepId,
          reason: "Breakpoint already exists",
        });
      }

      currentState = {
        ...currentState,
        breakpoints: [...currentState.breakpoints, { stepId, condition, enabled: true }],
      };

      return yield* Effect.void;
    });

    const removeBreakpoint = Effect.fn("Debugger.removeBreakpoint")(function* (stepId: StepId) {
      currentState = {
        ...currentState,
        breakpoints: currentState.breakpoints.filter((bp) => bp.stepId !== stepId),
      };
      return yield* Effect.void;
    });

    const stepOver = Effect.fn("Debugger.stepOver")(function* () {
      if (!currentState.isPaused) {
        return yield* new VisualDebuggerError({
          component: "Debugger",
          operation: "stepOver",
          cause: "Debugger is not paused",
        });
      }

      currentState = { ...currentState, isPaused: false };
      return yield* Effect.void;
    });

    const pause = Effect.fn("Debugger.pause")(function* () {
      currentState = { ...currentState, isPaused: true };
      return yield* Effect.void;
    });

    const resume = Effect.fn("Debugger.resume")(function* () {
      currentState = { ...currentState, isPaused: false };
      return yield* Effect.void;
    });

    const getState = Effect.fn("Debugger.getState")(function* () {
      return currentState;
    });

    const getVariables = Effect.fn("Debugger.getVariables")(function* () {
      return currentState.state;
    });

    const setVariable = Effect.fn("Debugger.setVariable")(function* (key: string, value: unknown) {
      currentState = {
        ...currentState,
        state: { ...currentState.state, [key]: value },
      };
      return yield* Effect.void;
    });

    const emitEvent = Effect.fn("Debugger.emitEvent")(function* (
      dagId: string,
      eventType: DebugEventType,
    ) {
      const event: DebugEvent = {
        type: eventType,
        timestamp: new Date(),
        dagId,
      };

      yield* PubSub.publish(pubsub, event);

      switch (eventType._tag) {
        case "StepStart": {
          currentState = {
            ...currentState,
            currentStep: eventType.stepId,
          };

          const breakpoint = currentState.breakpoints.find(
            (bp) => bp.stepId === eventType.stepId && bp.enabled,
          );

          if (breakpoint) {
            yield* PubSub.publish(pubsub, {
              type: { _tag: "BreakpointHit", stepId: eventType.stepId },
              timestamp: new Date(),
              dagId,
            } satisfies DebugEvent);

            currentState = { ...currentState, isPaused: true };
          }
          break;
        }

        case "StepComplete":
          currentState = {
            ...currentState,
            executedSteps: [...currentState.executedSteps, eventType.stepId],
          };
          break;
      }

      return event;
    });

    const subscribe = Effect.fn("Debugger.subscribe")(function* () {
      return yield* PubSub.subscribe(pubsub);
    });

    const reset = Effect.fn("Debugger.reset")(function* () {
      currentState = {
        currentStep: undefined,
        executedSteps: [],
        state: {},
        isPaused: false,
        breakpoints: [],
      };
      return yield* Effect.void;
    });

    const executeStep = Effect.fn("Debugger.executeStep")(function* (
      dagId: string,
      stepId: StepId,
      stepFn: Effect.Effect<string>,
    ) {
      yield* emitEvent(dagId, { _tag: "StepStart", stepId });

      if (currentState.isPaused) {
        yield* Effect.logDebug(`Paused at step ${stepId}`);
      }

      const result = yield* stepFn;

      yield* emitEvent(dagId, { _tag: "StepComplete", stepId, result });

      return result;
    });

    return {
      loadDag,
      renderDag,
      addBreakpoint,
      removeBreakpoint,
      stepOver,
      pause,
      resume,
      getState,
      getVariables,
      setVariable,
      emitEvent,
      subscribe,
      reset,
      executeStep,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provideMerge(DagBuilder.layer),
    Layer.provideMerge(DagRenderer.layer),
  );
}
