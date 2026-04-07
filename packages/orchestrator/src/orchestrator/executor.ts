import { Effect, Schema } from "effect";
import type { AgentRouter } from "@inspect/agent";

// ============================================================================
// Schema Definitions (Effect-TS)
// ============================================================================

export class ExecutionConfig extends Schema.Class<ExecutionConfig>("ExecutionConfig")({
  instruction: Schema.String,
  prompt: Schema.String,
  agent: Schema.String,
  mode: Schema.Literals(["dom", "hybrid", "cua"] as const),
  url: Schema.optional(Schema.String),
  device: Schema.Unknown,
  browser: Schema.Literals(["chromium", "firefox", "webkit"] as const),
  headed: Schema.Boolean,
  a11y: Schema.Boolean,
  lighthouse: Schema.Boolean,
  security: Schema.Boolean,
  mockFile: Schema.optional(Schema.String),
  faultProfile: Schema.optional(Schema.String),
  credentialId: Schema.optional(Schema.String),
  sensitiveData: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  maxSteps: Schema.Number,
  timeoutMs: Schema.Number,
  stepTimeoutMs: Schema.Number,
  verbose: Schema.Boolean,
  recording: Schema.optional(Schema.Boolean),
  recordingDir: Schema.optional(Schema.String),
  adversarial: Schema.optional(Schema.Boolean),
  adversarialIntensity: Schema.optional(
    Schema.Literals(["basic", "standard", "aggressive"] as const),
  ),
}) {
  declare readonly instruction: string;
  declare readonly prompt: string;
  declare readonly agent: string;
  declare readonly mode: "dom" | "hybrid" | "cua";
  declare readonly url?: string;
  declare readonly device: unknown;
  declare readonly browser: "chromium" | "firefox" | "webkit";
  declare readonly headed: boolean;
  declare readonly a11y: boolean;
  declare readonly lighthouse: boolean;
  declare readonly security: boolean;
  declare readonly mockFile?: string;
  declare readonly faultProfile?: string;
  declare readonly credentialId?: string;
  declare readonly sensitiveData?: Record<string, string>;
  declare readonly maxSteps: number;
  declare readonly timeoutMs: number;
  declare readonly stepTimeoutMs: number;
  declare readonly verbose: boolean;
  declare readonly recording?: boolean;
  declare readonly recordingDir?: string;
  declare readonly adversarial?: boolean;
  declare readonly adversarialIntensity?: "basic" | "standard" | "aggressive";
}

export class StepPlan extends Schema.Class<StepPlan>("StepPlan")({
  index: Schema.Number,
  description: Schema.String,
  assertion: Schema.optional(Schema.String),
  type: Schema.Literals(["navigate", "interact", "verify", "wait", "extract"] as const),
  targetArea: Schema.optional(Schema.String),
  rationale: Schema.optional(Schema.String),
}) {}

export class ToolCall extends Schema.Class<ToolCall>("ToolCall")({
  tool: Schema.String,
  args: Schema.Record(Schema.String, Schema.Unknown),
  result: Schema.optional(Schema.Unknown),
  duration: Schema.Number,
}) {}

export class StepResult extends Schema.Class<StepResult>("StepResult")({
  index: Schema.Number,
  description: Schema.String,
  status: Schema.Literals(["pass", "fail", "skipped"] as const),
  assertion: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  duration: Schema.Number,
  toolCalls: Schema.Array(ToolCall),
  screenshot: Schema.optional(Schema.String),
  consoleLogs: Schema.optional(Schema.Array(Schema.String)),
}) {
  declare readonly index: number;
  declare readonly description: string;
  declare readonly status: "pass" | "fail" | "skipped";
  declare readonly assertion?: string;
  declare readonly error?: string;
  declare readonly duration: number;
  declare readonly toolCalls: readonly ToolCall[];
  declare readonly screenshot?: string;
  declare readonly consoleLogs?: readonly string[];
}

export class AdversarialFinding extends Schema.Class<AdversarialFinding>("AdversarialFinding")({
  severity: Schema.Literals(["critical", "high", "medium", "low", "info"] as const),
  category: Schema.Literals([
    "security",
    "functionality",
    "ux",
    "performance",
    "accessibility",
  ] as const),
  instruction: Schema.String,
  finding: Schema.String,
  steps: Schema.Array(Schema.String),
  expected: Schema.String,
  actual: Schema.String,
}) {}

export class ExecutionResult extends Schema.Class<ExecutionResult>("ExecutionResult")({
  status: Schema.Literals(["pass", "fail", "error", "timeout"] as const),
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
}) {
  declare readonly status: "pass" | "fail" | "error" | "timeout";
  declare readonly steps: readonly StepResult[];
  declare readonly totalDuration: number;
  declare readonly tokenCount: number;
  declare readonly agent: string;
  declare readonly device: string;
  declare readonly timestamp: string;
  declare readonly error?: string;
  declare readonly recordingPath?: string;
  declare readonly replayViewerPath?: string;
  declare readonly adversarialFindings?: readonly AdversarialFinding[];
}

export class ExecutionProgress extends Schema.Class<ExecutionProgress>("ExecutionProgress")({
  phase: Schema.Literals(["planning", "executing", "verifying", "done"] as const),
  currentStep: Schema.Number,
  totalSteps: Schema.Number,
  tokenCount: Schema.Number,
  elapsed: Schema.Number,
  currentToolCall: Schema.optional(Schema.String),
  stepResult: Schema.optional(StepResult),
}) {
  declare readonly phase: "planning" | "executing" | "verifying" | "done";
  declare readonly currentStep: number;
  declare readonly totalSteps: number;
  declare readonly tokenCount: number;
  declare readonly elapsed: number;
  declare readonly currentToolCall?: string;
  declare readonly stepResult?: StepResult;
}

// ============================================================================
// Error Types (Standard Error classes - Effect-TS v4 compatible)
// ============================================================================

export class ExecutionTimeoutError extends Schema.ErrorClass<ExecutionTimeoutError>(
  "ExecutionTimeoutError",
)({
  _tag: Schema.tag("ExecutionTimeoutError"),
  elapsed: Schema.Number,
  timeout: Schema.Number,
}) {
  message = `Execution timed out after ${this.elapsed}ms (timeout: ${this.timeout}ms)`;
}

export class StepTimeoutError extends Schema.ErrorClass<StepTimeoutError>("StepTimeoutError")({
  _tag: Schema.tag("StepTimeoutError"),
  stepIndex: Schema.Number,
  timeout: Schema.Number,
}) {
  message = `Step ${this.stepIndex} timed out after ${this.timeout}ms`;
}

export class LoopDetectedError extends Schema.ErrorClass<LoopDetectedError>("LoopDetectedError")({
  _tag: Schema.tag("LoopDetectedError"),
  msg: Schema.String,
}) {
  message = `Loop detected: ${this.msg}`;
}

// ============================================================================
// Services
// ============================================================================

export interface ExecutionDeps {
  readonly router?: AgentRouter;
  readonly browserManager: unknown;
  readonly credentialVault?: unknown;
  readonly planGenerator?: (
    config: ExecutionConfig,
  ) => Effect.Effect<StepPlan[]> | Promise<StepPlan[]>;
  readonly stepExecutor?: (
    step: StepPlan,
    config: ExecutionConfig,
    toolCalls: ToolCall[],
  ) => Effect.Effect<void> | Promise<void>;
  readonly recording?: {
    readonly start: () => Effect.Effect<void>;
    readonly stop: () => Effect.Effect<unknown[]>;
    readonly save: (planId: string) => Effect.Effect<string>;
    readonly generateViewer: (outputPath: string) => Effect.Effect<string>;
  };
}

// ============================================================================
// Core Functions
// ============================================================================

export interface ExecutionState {
  config: ExecutionConfig;
  deps: ExecutionDeps;
  startTime: number;
  tokenCount: number;
  abortSignal: AbortSignal;
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
});

export const elapsed = (state: ExecutionState): number => Date.now() - state.startTime;

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

// ============================================================================
// Plan Generation
// ============================================================================

export function generatePlan(state: ExecutionState): Effect.Effect<StepPlan[], Error> {
  return Effect.gen(function* () {
    if (state.deps.planGenerator) {
      const result = state.deps.planGenerator(state.config);
      if ("pipe" in result) {
        return yield* result as Effect.Effect<StepPlan[]>;
      }
      return yield* Effect.tryPromise(() => result as Promise<StepPlan[]>);
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
}

// ============================================================================
// Step Execution
// ============================================================================

export function runStep(
  step: StepPlan,
  state: ExecutionState,
  toolCalls: ToolCall[],
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    if (state.deps.stepExecutor) {
      const result = state.deps.stepExecutor(step, state.config, toolCalls);
      if ("pipe" in result) {
        return yield* result as Effect.Effect<void>;
      }
      return yield* Effect.tryPromise(() => result as Promise<void>);
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
}

export function executeStep(step: StepPlan, state: ExecutionState): Effect.Effect<StepResult> {
  return Effect.gen(function* () {
    const stepStart = Date.now();
    const toolCalls: ToolCall[] = [];

    // Run step with timeout
    yield* runStep(step, state, toolCalls).pipe(
      Effect.timeout(state.config.stepTimeoutMs),
      Effect.matchEffect({
        onSuccess: () => Effect.succeed(void 0),
        onFailure: () =>
          Effect.fail(
            new StepTimeoutError({ stepIndex: step.index, timeout: state.config.stepTimeoutMs }),
          ),
      }),
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
    });
  }).pipe(
    Effect.matchEffect({
      onSuccess: (result) => Effect.succeed(result),
      onFailure: (err) =>
        Effect.gen(function* () {
          const errorMessage = err instanceof Error ? err.message : String(err);
          // Log unexpected errors for debugging
          if (!(err instanceof StepTimeoutError)) {
            yield* Effect.logDebug("Unexpected error in executeStep", {
              error: err,
              step: step.index,
            });
          }
          return new StepResult({
            index: step.index,
            description: step.description,
            status: "fail",
            assertion: step.assertion,
            error: errorMessage,
            duration: 0,
            toolCalls: [],
          });
        }),
    }),
  );
}

// ============================================================================
// Progress & Recording
// ============================================================================

export function emitProgress(
  progress: ExecutionProgress,
  callback?: (p: ExecutionProgress) => void,
): Effect.Effect<void> {
  return Effect.sync(() => {
    callback?.(progress);
  });
}

export function startRecording(state: ExecutionState): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    if (!state.config.recording || !state.deps.recording) {
      return false;
    }

    return yield* state.deps.recording.start().pipe(
      Effect.tap(() => Effect.logInfo("Session recording started")),
      Effect.matchEffect({
        onSuccess: () => Effect.succeed(true),
        onFailure: (err) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(`Failed to start session recording: ${err}`);
            return false;
          }),
      }),
    );
  });
}

export function finalizeRecording(
  state: ExecutionState,
  result: ExecutionResult,
): Effect.Effect<ExecutionResult> {
  return Effect.gen(function* () {
    if (!state.config.recording || !state.deps.recording) {
      return result;
    }

    const events = yield* state.deps.recording.stop().pipe(
      Effect.tap((evts: unknown[]) =>
        Effect.logInfo("Session recording stopped", { eventCount: evts.length }),
      ),
      Effect.matchEffect({
        onSuccess: (evts) => Effect.succeed(evts),
        onFailure: (err) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(`Failed to stop recording: ${err}`);
            return [];
          }),
      }),
    );

    if (events.length > 0) {
      const planId = `run-${Date.now()}`;
      const recordingPath = yield* state.deps.recording
        .save(planId)
        .pipe(Effect.tap((path: string) => Effect.logInfo("Session recording saved", { path })));

      const viewerPath = recordingPath.replace(/\.json$/, "-viewer.html");
      yield* state.deps.recording
        .generateViewer(viewerPath)
        .pipe(Effect.tap(() => Effect.logInfo("Replay viewer generated", { path: viewerPath })));

      return new ExecutionResult({
        ...result,
        recordingPath,
        replayViewerPath: viewerPath,
      });
    }

    return result;
  });
}

// ============================================================================
// Main Execution
// ============================================================================

export function executeTest(
  config: ExecutionConfig,
  deps: ExecutionDeps,
  onProgress?: (p: ExecutionProgress) => void,
): Effect.Effect<ExecutionResult, Error> {
  return Effect.gen(function* () {
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
        const timeoutResult = new ExecutionResult({
          status: "timeout",
          steps: results,
          totalDuration: elapsed(state),
          tokenCount: state.tokenCount,
          agent: config.agent,
          device: (config.device as { name?: string })?.name ?? "unknown",
          timestamp: new Date().toISOString(),
          error: "Test timeout exceeded",
        });
        return yield* finalizeRecording(state, timeoutResult);
      }

      // Check max steps
      if (i >= config.maxSteps) {
        break;
      }

      const stepResult = yield* executeStep(step, state);
      results.push(stepResult);

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
      device: (config.device as { name?: string })?.name ?? "unknown",
      timestamp: new Date().toISOString(),
    });

    return yield* finalizeRecording(state, result);
  });
}

// ============================================================================
// Legacy Compatibility
// ============================================================================

/** Legacy interface for backward compatibility */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExecutorDependencies extends ExecutionDeps {}

/** Legacy TestExecutor class for backward compatibility */
export class TestExecutor {
  private config: ExecutionConfig;
  private deps: ExecutionDeps;
  private onProgress: ((p: ExecutionProgress) => void) | null = null;
  private abortController: AbortController;

  constructor(config: ExecutionConfig, deps?: ExecutionDeps) {
    this.config = config;
    this.deps = deps ?? { router: undefined, browserManager: null };
    this.abortController = new AbortController();
  }

  setProgressCallback(callback: (p: ExecutionProgress) => void): void {
    this.onProgress = callback;
  }

  abort(): void {
    this.abortController.abort();
  }

  async execute(): Promise<ExecutionResult> {
    return Effect.runPromise(executeTest(this.config, this.deps, this.onProgress ?? undefined));
  }
}
