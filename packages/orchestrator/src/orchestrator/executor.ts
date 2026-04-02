import { Effect, Schema } from "effect";
import type { DeviceConfig } from "@inspect/devices";
import type { AgentRouter } from "@inspect/agent";
import { LoopDetector } from "@inspect/agent";
import { ContextCompactor } from "@inspect/agent";
import { SensitiveDataMasker } from "@inspect/agent";
import { RecoveryManager } from "./recovery.js";
import type { RecoveryExecutors } from "./recovery.js";
import { AgentBrain, AgentAction } from "@inspect/agent";

// ============================================================================
// Schema Definitions (Effect-TS)
// ============================================================================

export class ExecutionConfig extends Schema.Class<ExecutionConfig>("ExecutionConfig")({
  instruction: Schema.String,
  prompt: Schema.String,
  agent: Schema.String,
  mode: Schema.Literals("dom", "hybrid", "cua"),
  url: Schema.optional(Schema.String),
  device: Schema.Unknown,
  browser: Schema.Literals("chromium", "firefox", "webkit"),
  headed: Schema.Boolean,
  a11y: Schema.Boolean,
  lighthouse: Schema.Boolean,
  security: Schema.Boolean,
  mockFile: Schema.optional(Schema.String),
  faultProfile: Schema.optional(Schema.String),
  credentialId: Schema.optional(Schema.String),
  sensitiveData: Schema.optional(Schema.Record({key: Schema.String, value: Schema.String})),
  maxSteps: Schema.Number,
  timeoutMs: Schema.Number,
  stepTimeoutMs: Schema.Number,
  verbose: Schema.Boolean,
  recording: Schema.optional(Schema.Boolean),
  recordingDir: Schema.optional(Schema.String),
  adversarial: Schema.optional(Schema.Boolean),
  adversarialIntensity: Schema.optional(Schema.Literals("basic", "standard", "aggressive")),
}) {}

export class StepPlan extends Schema.Class<StepPlan>("StepPlan")({
  index: Schema.Number,
  description: Schema.String,
  assertion: Schema.optional(Schema.String),
  type: Schema.Literals("navigate", "interact", "verify", "wait", "extract"),
  targetArea: Schema.optional(Schema.String),
  rationale: Schema.optional(Schema.String),
}) {}

export class ToolCall extends Schema.Class<ToolCall>("ToolCall")({
  tool: Schema.String,
  args: Schema.Record({key: Schema.String, value: Schema.Unknown}),
  result: Schema.optional(Schema.Unknown),
  duration: Schema.Number,
}) {}

export class StepResult extends Schema.Class<StepResult>("StepResult")({
  index: Schema.Number,
  description: Schema.String,
  status: Schema.Literals("pass", "fail", "skipped"),
  assertion: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  duration: Schema.Number,
  toolCalls: Schema.Array(ToolCall),
  screenshot: Schema.optional(Schema.String),
  consoleLogs: Schema.optional(Schema.Array(Schema.String)),
}) {}

export class AdversarialFinding extends Schema.Class<AdversarialFinding>("AdversarialFinding")({
  severity: Schema.Literals("critical", "high", "medium", "low", "info"),
  category: Schema.Literals("security", "functionality", "ux", "performance", "accessibility"),
  instruction: Schema.String,
  finding: Schema.String,
  steps: Schema.Array(Schema.String),
  expected: Schema.String,
  actual: Schema.String,
}) {}

export class ExecutionResult extends Schema.Class<ExecutionResult>("ExecutionResult")({
  status: Schema.Literals("pass", "fail", "error", "timeout"),
  steps: Schema.Array(StepResult),
  totalDuration: Schema.Number,
  tokenCount: Schema.Number,
  agent: Schema.String,
  device: Schema.String,
  timestamp: Schema.String,
  error: Schema.optional(Schema.String),
  recordingPath: Schema.optional(Schema.String),
  replayViewerPath: Schema.optional(Schema.String),
  adversarialFindings: Schema.optional(Schema.Array(AdversarialFinding)),
}) {}

export class ExecutionProgress extends Schema.Class<ExecutionProgress>("ExecutionProgress")({
  phase: Schema.Literals("planning", "executing", "verifying", "done"),
  currentStep: Schema.Number,
  totalSteps: Schema.Number,
  tokenCount: Schema.Number,
  elapsed: Schema.Number,
  currentToolCall: Schema.optional(Schema.String),
  stepResult: Schema.optional(StepResult),
}) {}

// ============================================================================
// Services
// ============================================================================

export interface ExecutionDeps {
  readonly router: AgentRouter;
  readonly browserManager: unknown;
  readonly credentialVault?: unknown;
  readonly planGenerator?: (config: ExecutionConfig) => Effect.Effect<StepPlan[]>;
  readonly stepExecutor?: (
    step: StepPlan,
    config: ExecutionConfig,
    toolCalls: ToolCall[],
  ) => Effect.Effect<void>;
  readonly recoveryExecutors?: RecoveryExecutors;
  readonly recording?: {
    readonly start: () => Effect.Effect<void>;
    readonly stop: () => Effect.Effect<unknown[]>;
    readonly save: (planId: string) => Effect.Effect<string>;
    readonly generateViewer: (outputPath: string) => Effect.Effect<string>;
  };
}

// ============================================================================
// Error Types
// ============================================================================

export class ExecutionTimeoutError extends Schema.ErrorClass<ExecutionTimeoutError>("ExecutionTimeoutError")({
  _tag: Schema.tag("ExecutionTimeoutError"),
  elapsed: Schema.Number,
  timeout: Schema.Number,
}) {
  message = `Execution timeout: ${this.elapsed}ms exceeded ${this.timeout}ms`;
}

export class StepTimeoutError extends Schema.ErrorClass<StepTimeoutError>("StepTimeoutError")({
  _tag: Schema.tag("StepTimeoutError"),
  stepIndex: Schema.Number,
  timeout: Schema.Number,
}) {
  message = `Step ${this.stepIndex} timeout after ${this.timeout}ms`;
}

export class LoopDetectedError extends Schema.ErrorClass<LoopDetectedError>("LoopDetectedError")({
  _tag: Schema.tag("LoopDetectedError"),
  message: Schema.String,
}) {}

// ============================================================================
// Core Functions
// ============================================================================

export interface ExecutionState {
  config: ExecutionConfig;
  deps: ExecutionDeps;
  startTime: number;
  tokenCount: number;
  abortSignal: AbortSignal;
  recoveryManager: RecoveryManager;
  loopDetector: LoopDetector;
  compactor: ContextCompactor;
  masker?: SensitiveDataMasker;
}

export const createExecutionState = (
  config: ExecutionConfig,
  deps: ExecutionDeps,
  abortSignal: AbortSignal,
): ExecutionState => ({
  config,
  deps,
  startTime: Date.now(),
  tokenCount: 0,
  abortSignal,
  recoveryManager: new RecoveryManager(3),
  loopDetector: new LoopDetector(),
  compactor: new ContextCompactor({ threshold: 80_000, keepLast: 10 }),
  masker: config.sensitiveData ? new SensitiveDataMasker(config.sensitiveData) : undefined,
});

export const elapsed = (state: ExecutionState): number => Date.now() - state.startTime;

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

// ============================================================================
// Plan Generation
// ============================================================================

export const generatePlan = Effect.fn("Executor.generatePlan")(function* (
  state: ExecutionState,
) {
  if (state.deps.planGenerator) {
    return yield* state.deps.planGenerator(state.config);
  }

  yield* Effect.logWarning("generatePlan() using placeholder — connect LLM for real planning");

  // Default 6-step placeholder plan
  return [
    new StepPlan({ index: 0, description: "Navigate to the target URL", type: "navigate" }),
    new StepPlan({
      index: 1,
      description: "Wait for page to be fully loaded",
      type: "wait",
      assertion: "Page loads without errors",
    }),
    new StepPlan({
      index: 2,
      description: "Take accessibility snapshot and identify interactive elements",
      type: "verify",
    }),
    new StepPlan({
      index: 3,
      description: "Execute primary interaction based on instruction",
      type: "interact",
      assertion: "Interaction completes successfully",
    }),
    new StepPlan({
      index: 4,
      description: "Verify state changes after interaction",
      type: "verify",
      assertion: "Expected state changes occurred",
    }),
    new StepPlan({
      index: 5,
      description: "Check for console errors and network failures",
      type: "verify",
      assertion: "No unexpected errors in console or network",
    }),
  ];
});

// ============================================================================
// Step Execution
// ============================================================================

export const runStep = Effect.fn("Executor.runStep")(function* (
  step: StepPlan,
  state: ExecutionState,
  toolCalls: ToolCall[],
) {
  if (state.deps.stepExecutor) {
    return yield* state.deps.stepExecutor(step, state.config, toolCalls);
  }

  yield* Effect.logWarning(`Step ${step.index}: Running in simulation mode (no browser)`);

  const callStart = Date.now();
  const duration = () => Date.now() - callStart;

  switch (step.type) {
    case "navigate": {
      const url = state.config.url ?? "http://localhost:3000";
      toolCalls.push(
        new ToolCall({
          tool: "browser_navigate",
          args: { url },
          result: { url, status: 200, simulated: true },
          duration: duration(),
        }),
      );
      break;
    }
    case "wait": {
      toolCalls.push(
        new ToolCall({
          tool: "browser_wait",
          args: { navigation: true, timeout: 10000 },
          result: { ready: true, simulated: true },
          duration: duration(),
        }),
      );
      break;
    }
    case "interact": {
      toolCalls.push(
        new ToolCall({
          tool: "browser_snapshot",
          args: { mode: state.config.mode },
          result: { elements: "...", simulated: true },
          duration: duration(),
        }),
      );
      break;
    }
    case "verify": {
      toolCalls.push(
        new ToolCall({
          tool: "browser_console",
          args: { level: "error" },
          result: { logs: [], simulated: true },
          duration: duration(),
        }),
      );
      break;
    }
    case "extract": {
      toolCalls.push(
        new ToolCall({
          tool: "browser_evaluate",
          args: { expression: "document.title" },
          result: { value: "Page Title" },
          duration: duration(),
        }),
      );
      break;
    }
  }
});

export const getRecoveryExecutors = (state: ExecutionState): RecoveryExecutors => {
  if (state.deps.recoveryExecutors) {
    return state.deps.recoveryExecutors;
  }

  return {
    reScan: () =>
      Effect.gen(function* () {
        yield* Effect.log("Recovery: reScan (simulation mode)");
        return true;
      }).pipe(Effect.runPromise),
    waitForLoad: () =>
      Effect.gen(function* () {
        yield* Effect.log("Recovery: waitForLoad (2s delay)");
        yield* Effect.sleep("2 seconds");
        return true;
      }).pipe(Effect.runPromise),
    scrollIntoView: () =>
      Effect.gen(function* () {
        yield* Effect.log("Recovery: scrollIntoView (simulation mode)");
        return true;
      }).pipe(Effect.runPromise),
    dismissOverlay: () =>
      Effect.gen(function* () {
        yield* Effect.log("Recovery: dismissOverlay (simulation mode)");
        return true;
      }).pipe(Effect.runPromise),
    refreshPage: () =>
      Effect.gen(function* () {
        yield* Effect.log("Recovery: refreshPage (simulation mode)");
        yield* Effect.sleep("1 second");
        return true;
      }).pipe(Effect.runPromise),
  };
};

export const executeStep = Effect.fn("Executor.executeStep")(function* (
  step: StepPlan,
  state: ExecutionState,
) {
  const stepStart = Date.now();
  const toolCalls: ToolCall[] = [];
  let lastError: string | undefined;
  let retries = 0;
  const maxRetries = 2;

  while (retries <= maxRetries) {
    try {
      // Race step execution with timeout
      yield* runStep(step, state, toolCalls).pipe(
        Effect.timeout(state.config.stepTimeoutMs),
        Effect.mapError(() => new StepTimeoutError({ stepIndex: step.index, timeout: state.config.stepTimeoutMs })),
      );

      const duration = Date.now() - stepStart;
      state.tokenCount += 50;

      return new StepResult({
        index: step.index,
        description: step.description,
        status: "pass",
        assertion: step.assertion,
        duration,
        toolCalls,
        consoleLogs: retries > 0 ? [`Passed after ${retries} retry(s)`] : undefined,
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);

      if (retries >= maxRetries) break;

      const diagnosis = state.recoveryManager.diagnose(lastError, {
        selector: undefined,
        url: state.config.url,
      });

      const recovered = yield* Effect.promise(() =>
        state.recoveryManager.recover(diagnosis, getRecoveryExecutors(state)),
      );

      if (!recovered) break;

      retries++;
      state.tokenCount += 10;
    }
  }

  const duration = Date.now() - stepStart;
  return new StepResult({
    index: step.index,
    description: step.description,
    status: "fail",
    assertion: step.assertion,
    error: lastError,
    duration,
    toolCalls,
    consoleLogs: retries > 0 ? [`Failed after ${retries} retry(s): ${lastError}`] : undefined,
  });
});

// ============================================================================
// Progress & Recording
// ============================================================================

export const emitProgress = (
  progress: ExecutionProgress,
  callback?: (p: ExecutionProgress) => void,
): Effect.Effect<void> =>
  Effect.sync(() => {
    callback?.(progress);
  });

export const startRecording = Effect.fn("Executor.startRecording")(function* (state: ExecutionState) {
  if (!state.config.recording || !state.deps.recording) {
    return false;
  }

  return yield* state.deps.recording.start().pipe(
    Effect.tap(() => Effect.logInfo("Session recording started")),
    Effect.match({
      onSuccess: () => true,
      onFailure: (err) => {
        Effect.logWarning(`Failed to start session recording: ${err}`).pipe(Effect.runSync);
        return false;
      },
    }),
  );
});

export const finalizeRecording = Effect.fn("Executor.finalizeRecording")(function* (
  state: ExecutionState,
  result: ExecutionResult,
) {
  if (!state.config.recording || !state.deps.recording) {
    return result;
  }

  const events = yield* state.deps.recording.stop().pipe(
    Effect.tap((evts) => Effect.logInfo("Session recording stopped", { eventCount: evts.length })),
    Effect.catchAll((err) => {
      Effect.logWarning(`Failed to stop recording: ${err}`).pipe(Effect.runSync);
      return Effect.succeed([] as unknown[]);
    }),
  );

  if (events.length > 0) {
    const planId = `run-${Date.now()}`;
    const recordingPath = yield* state.deps.recording.save(planId).pipe(
      Effect.tap((path) => Effect.logInfo("Session recording saved", { path })),
    );

    const viewerPath = recordingPath.replace(/\.json$/, "-viewer.html");
    yield* state.deps.recording.generateViewer(viewerPath).pipe(
      Effect.tap(() => Effect.logInfo("Replay viewer generated", { path: viewerPath })),
    );

    return new ExecutionResult({
      ...result,
      recordingPath,
      replayViewerPath: viewerPath,
    });
  }

  return result;
});

// ============================================================================
// Main Execution
// ============================================================================

export const executeTest = Effect.fn("Executor.execute")(function* (
  config: ExecutionConfig,
  deps: ExecutionDeps,
  onProgress?: (p: ExecutionProgress) => void,
) {
  const abortController = new AbortController();
  const state = createExecutionState(config, deps, abortController.signal);

  yield* startRecording(state);

  yield* emitProgress(
    new ExecutionProgress({
      phase: "planning",
      currentStep: 0,
      totalSteps: 0,
      tokenCount: 0,
      elapsed: 0,
    }),
    onProgress,
  );

  const plan = yield* generatePlan(state);
  state.tokenCount += estimateTokens(config.prompt);

  const results: StepResult[] = [];

  yield* emitProgress(
    new ExecutionProgress({
      phase: "executing",
      currentStep: 0,
      totalSteps: plan.length,
      tokenCount: state.tokenCount,
      elapsed: elapsed(state),
    }),
    onProgress,
  );

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];

    // Check abort
    if (state.abortSignal.aborted) {
      break;
    }

    // Check timeout
    if (elapsed(state) > config.timeoutMs) {
      const result = new ExecutionResult({
        status: "timeout",
        steps: results,
        totalDuration: elapsed(state),
        tokenCount: state.tokenCount,
        agent: config.agent,
        device: (config.device as DeviceConfig).name ?? "unknown",
        timestamp: new Date().toISOString(),
        error: "Test timeout exceeded",
      });
      return yield* finalizeRecording(state, result);
    }

    // Check max steps
    if (i >= config.maxSteps) {
      break;
    }

    const stepResult = yield* executeStep(step, state);
    results.push(stepResult);

    // Record for loop detection
    const primaryToolCall = stepResult.toolCalls[0];
    if (primaryToolCall) {
      state.loopDetector.record({
        type: primaryToolCall.tool,
        ref: primaryToolCall.args?.ref as string | undefined,
        value: primaryToolCall.args?.value as string | undefined,
        url: config.url ?? "",
      });
    }

    // Check for loops
    const detection = state.loopDetector.detectLoop();
    if (detection.detected) {
      const nudge = state.loopDetector.getNudge();
      yield* Effect.logWarning("Loop detected", {
        loopType: detection.loopType,
        confidence: detection.confidence,
        severity: nudge.severity,
      });

      if (nudge.severity === "critical") {
        const result = new ExecutionResult({
          status: "fail",
          steps: results,
          totalDuration: elapsed(state),
          tokenCount: state.tokenCount,
          agent: config.agent,
          device: (config.device as DeviceConfig).name ?? "unknown",
          timestamp: new Date().toISOString(),
          error: `Agent stuck in loop: ${nudge.message}`,
        });
        return yield* finalizeRecording(state, result);
      }
    }

    yield* emitProgress(
      new ExecutionProgress({
        phase: "executing",
        currentStep: i + 1,
        totalSteps: plan.length,
        tokenCount: state.tokenCount,
        elapsed: elapsed(state),
        stepResult,
      }),
      onProgress,
    );
  }

  yield* emitProgress(
    new ExecutionProgress({
      phase: "verifying",
      currentStep: plan.length,
      totalSteps: plan.length,
      tokenCount: state.tokenCount,
      elapsed: elapsed(state),
    }),
    onProgress,
  );

  const overallStatus = results.every((r) => r.status === "pass") ? "pass" : "fail";

  yield* emitProgress(
    new ExecutionProgress({
      phase: "done",
      currentStep: plan.length,
      totalSteps: plan.length,
      tokenCount: state.tokenCount,
      elapsed: elapsed(state),
    }),
    onProgress,
  );

  const result = new ExecutionResult({
    status: overallStatus,
    steps: results,
    totalDuration: elapsed(state),
    tokenCount: state.tokenCount,
    agent: config.agent,
    device: (config.device as DeviceConfig).name ?? "unknown",
    timestamp: new Date().toISOString(),
  });

  return yield* finalizeRecording(state, result);
});

// ============================================================================
// Legacy Compatibility
// ============================================================================

/** Legacy interface for backward compatibility */
export interface ExecutorDependencies extends ExecutionDeps {}

/** Legacy TestExecutor class for backward compatibility */
export class TestExecutor {
  private config: ExecutionConfig;
  private deps: ExecutionDeps;
  private onProgress: ((p: ExecutionProgress) => void) | null = null;
  private abortController: AbortController;

  constructor(config: ExecutionConfig, deps?: ExecutionDeps) {
    this.config = config;
    this.deps = deps ?? { router: null as unknown as AgentRouter, browserManager: null };
    this.abortController = new AbortController();
  }

  setProgressCallback(callback: (p: ExecutionProgress) => void): void {
    this.onProgress = callback;
  }

  abort(): void {
    this.abortController.abort();
  }

  async execute(): Promise<ExecutionResult> {
    return executeTest(this.config, this.deps, this.onProgress ?? undefined).pipe(
      Effect.runPromise,
    );
  }
}
