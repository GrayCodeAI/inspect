import { Effect, Layer, Option, Schema, ServiceMap } from "effect";

export class HandoffContext extends Schema.Class<HandoffContext>("HandoffContext")({
  taskId: Schema.String,
  fromAgent: Schema.String,
  toAgent: Schema.String,
  reason: Schema.String,
  transferredState: Schema.Record(Schema.String, Schema.Unknown),
  conversationHistory: Schema.Array(
    Schema.Struct({
      role: Schema.String,
      content: Schema.String,
    }),
  ),
  timestamp: Schema.String,
}) {}

export class HandoffResult extends Schema.Class<HandoffResult>("HandoffResult")({
  success: Schema.Boolean,
  result: Schema.optional(Schema.String),
  returnedToSource: Schema.Boolean,
  context: HandoffContext,
}) {}

export class HandoffConfig extends Schema.Class<HandoffConfig>("HandoffConfig")({
  targetAgent: Schema.String,
  triggers: Schema.Array(Schema.String),
  handoffPrompt: Schema.optional(Schema.String),
  inputFilter: Schema.optional(Schema.Array(Schema.String)),
}) {}

export class HandoffError extends Schema.ErrorClass<HandoffError>("HandoffError")({
  _tag: Schema.tag("HandoffError"),
  taskId: Schema.String,
  errorMessage: Schema.String,
}) {}

export class HandoffNotFoundError extends Schema.ErrorClass<HandoffNotFoundError>(
  "HandoffNotFoundError",
)({
  _tag: Schema.tag("HandoffNotFoundError"),
  taskId: Schema.String,
}) {
  getErrorMessage = () => `No active handoff found for task: ${this.taskId}`;
}

export type HandoffCallback = (context: HandoffContext, result: string) => Effect.Effect<void>;

export interface HandoffExecutionContext {
  taskId: string;
  fromAgent: string;
  message: string;
  state: Record<string, unknown>;
  history: Array<{ role: string; content: string }>;
}

/** Register a handoff rule. */
const registerHandoff = (
  handoffs: Map<string, HandoffConfig>,
  callbacks: Map<string, HandoffCallback>,
  name: string,
  config: HandoffConfig,
  callback?: HandoffCallback,
) =>
  Effect.gen(function* () {
    yield* Effect.sync(() => handoffs.set(name, config));
    if (callback) {
      yield* Effect.sync(() => callbacks.set(name, callback));
    }
    yield* Effect.logInfo("Handoff rule registered", { name, targetAgent: config.targetAgent });
  });

/** Check if a message triggers any registered handoff. */
const checkHandoff = (handoffs: Map<string, HandoffConfig>, message: string) =>
  Effect.gen(function* () {
    const lowerMsg = message.toLowerCase();

    for (const [, config] of handoffs) {
      const triggered = config.triggers.some((trigger) => lowerMsg.includes(trigger.toLowerCase()));
      if (triggered) {
        yield* Effect.logDebug("Handoff triggered", { message: message.slice(0, 100) });
        return Option.some(config);
      }
    }

    return Option.none<HandoffConfig>();
  });

/** Execute a handoff — transfer context to the target agent. */
const executeHandoff = (
  activeHandoffs: Map<string, HandoffContext>,
  callbacks: Map<string, HandoffCallback>,
  config: HandoffConfig,
  context: HandoffExecutionContext,
) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({
      taskId: context.taskId,
      fromAgent: context.fromAgent,
      toAgent: config.targetAgent,
    });

    const filteredState = config.inputFilter
      ? Object.fromEntries(
          Object.entries(context.state).filter(([k]) => !config.inputFilter!.includes(k)),
        )
      : context.state;

    const handoffContext = new HandoffContext({
      taskId: context.taskId,
      fromAgent: context.fromAgent,
      toAgent: config.targetAgent,
      reason: `Handoff triggered by: "${context.message.slice(0, 100)}"`,
      transferredState: filteredState,
      conversationHistory: context.history,
      timestamp: new Date().toISOString(),
    });

    yield* Effect.sync(() => activeHandoffs.set(context.taskId, handoffContext));

    yield* Effect.logInfo("Handoff executed", {
      taskId: context.taskId,
      from: context.fromAgent,
      to: config.targetAgent,
    });

    return handoffContext;
  });

/** Complete a handoff — return result and optionally return to source agent. */
const completeHandoff = (
  handoffs: Map<string, HandoffConfig>,
  activeHandoffs: Map<string, HandoffContext>,
  callbacks: Map<string, HandoffCallback>,
  taskId: string,
  result: string,
  returnToSource = true,
) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ taskId, returnToSource });

    const context = yield* Effect.sync(() => activeHandoffs.get(taskId)).pipe(
      Effect.flatMap((ctx) =>
        ctx ? Effect.succeed(ctx) : new HandoffNotFoundError({ taskId }).asEffect(),
      ),
    );

    const handoffResult = new HandoffResult({
      success: true,
      result,
      returnedToSource: returnToSource,
      context,
    });

    const callbackKey = `${context.fromAgent}->${context.toAgent}`;
    const callback = yield* Effect.sync(() => callbacks.get(callbackKey));

    if (callback) {
      yield* callback(context, result);
    }

    yield* Effect.sync(() => activeHandoffs.delete(taskId));

    yield* Effect.logInfo("Handoff completed", {
      taskId,
      success: true,
      returnedToSource: returnToSource,
    });

    return handoffResult;
  });

/** Get active handoff for a task. */
const getActiveHandoff = (activeHandoffs: Map<string, HandoffContext>, taskId: string) =>
  Effect.gen(function* () {
    const context = yield* Effect.sync(() => activeHandoffs.get(taskId));
    return context ? Option.some(context) : Option.none<HandoffContext>();
  });

/** List all registered handoff rules. */
const listRules = (handoffs: Map<string, HandoffConfig>) =>
  Effect.gen(function* () {
    return yield* Effect.sync(() =>
      Array.from(handoffs.entries()).map(([name, config]) => ({
        name,
        target: config.targetAgent,
        triggers: config.triggers,
      })),
    );
  });

/** HandoffManager service for dependency injection. */
export class HandoffManager extends ServiceMap.Service<HandoffManager>()(
  "@multi-agent/HandoffManager",
  {
    make: Effect.gen(function* () {
      const handoffs = new Map<string, HandoffConfig>();
      const activeHandoffs = new Map<string, HandoffContext>();
      const callbacks = new Map<string, HandoffCallback>();

      return {
        register: (name: string, config: HandoffConfig, callback?: HandoffCallback) =>
          registerHandoff(handoffs, callbacks, name, config, callback),
        check: (message: string) => checkHandoff(handoffs, message),
        execute: (config: HandoffConfig, context: HandoffExecutionContext) =>
          executeHandoff(activeHandoffs, callbacks, config, context),
        complete: (taskId: string, result: string, returnToSource?: boolean) =>
          completeHandoff(handoffs, activeHandoffs, callbacks, taskId, result, returnToSource),
        getActive: (taskId: string) => getActiveHandoff(activeHandoffs, taskId),
        listRules: () => listRules(handoffs),
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
