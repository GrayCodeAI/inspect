import { Effect, Layer, Schema, Stream, ServiceMap } from "effect";
import {
  AgentError,
  TimeoutError,
} from "@inspect/shared";

export class StepPlan extends Schema.Class<StepPlan>("StepPlan")({
  index: Schema.Number,
  description: Schema.String,
  assertion: Schema.optional(Schema.String),
  type: Schema.Literals(["navigate", "interact", "verify", "extract", "wait"] as const),
  targetArea: Schema.optional(Schema.String),
  rationale: Schema.optional(Schema.String),
}) {}

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
}) {}

export class StepResult extends Schema.Class<StepResult>("StepResult")({
  index: Schema.Number,
  description: Schema.String,
  status: Schema.Literals(["pass", "fail", "skipped"] as const),
  assertion: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  duration: Schema.Number,
  toolCalls: Schema.Array(Schema.Unknown),
  screenshot: Schema.optional(Schema.String),
  consoleLogs: Schema.optional(Schema.Array(Schema.String)),
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
}) {}

export class ExecutionProgress extends Schema.Class<ExecutionProgress>("ExecutionProgress")({
  phase: Schema.Literals(["planning", "executing", "verifying", "done"] as const),
  currentStep: Schema.Number,
  totalSteps: Schema.Number,
  tokenCount: Schema.Number,
  elapsed: Schema.Number,
  currentToolCall: Schema.optional(Schema.String),
  stepResult: Schema.optional(StepResult),
}) {}

export interface TestExecutorService {
  readonly execute: (
    config: ExecutionConfig,
  ) => Effect.Effect<ExecutionResult, AgentError | TimeoutError>;
  readonly executeStream: (
    config: ExecutionConfig,
  ) => Stream.Stream<ExecutionProgress, AgentError>;
  readonly generatePlan: (
    config: ExecutionConfig,
  ) => Effect.Effect<StepPlan[], AgentError>;
  readonly executeStep: (
    step: StepPlan,
    config: ExecutionConfig,
  ) => Effect.Effect<StepResult, AgentError>;
  readonly abort: () => Effect.Effect<void>;
}

export class TestExecutor extends ServiceMap.Service<TestExecutor, TestExecutorService>()("@inspect/TestExecutor") {
  static layer = Layer.effect(this,
    Effect.gen(function* () {
      // Generate plan implementation
      const generatePlan = function(_config: ExecutionConfig): Effect.Effect<StepPlan[], AgentError> {
        return Effect.gen(function* () {
          yield* Effect.logWarning("generatePlan() placeholder — connect LLM provider");
          return [
            new StepPlan({ index: 0, description: "Navigate to the target URL", type: "navigate" }),
            new StepPlan({
              index: 1,
              description: "Wait for page to be fully loaded",
              type: "wait",
              assertion: "Page loads without errors",
            }),
            new StepPlan({ index: 2, description: "Take accessibility snapshot", type: "verify" }),
            new StepPlan({
              index: 3,
              description: "Execute primary interaction",
              type: "interact",
              assertion: "Interaction completes successfully",
            }),
            new StepPlan({
              index: 4,
              description: "Verify state changes",
              type: "verify",
              assertion: "Expected state changes occurred",
            }),
            new StepPlan({
              index: 5,
              description: "Check console errors",
              type: "verify",
              assertion: "No unexpected errors",
            }),
          ];
        });
      };

      // Execute step implementation
      const executeStep = function(step: StepPlan, _config: ExecutionConfig): Effect.Effect<StepResult, AgentError> {
        return Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ stepIndex: step.index, stepType: step.type });
          yield* Effect.logWarning("executeStep() simulation mode — connect browser");
          return new StepResult({
            index: step.index,
            description: step.description,
            status: "pass",
            assertion: step.assertion,
            duration: 0,
            toolCalls: [],
          });
        });
      };

      // Execute implementation
      const execute = function(config: ExecutionConfig): Effect.Effect<ExecutionResult, AgentError | TimeoutError> {
        return Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ instruction: config.instruction, agent: config.agent });
          const plan = yield* generatePlan(config);
          const steps: StepResult[] = [];
          for (let i = 0; i < plan.length; i++) {
            const step = plan[i];
            const result = yield* executeStep(step, config);
            steps.push(result);
          }
          const status = steps.every((s) => s.status === "pass") ? "pass" : ("fail" as const);
          return new ExecutionResult({
            status,
            steps,
            totalDuration: steps.reduce((sum, s) => sum + s.duration, 0),
            tokenCount: 0,
            agent: config.agent,
            device: "unknown",
            timestamp: new Date().toISOString(),
          });
        });
      };

      // Execute stream implementation
      const executeStream = function(config: ExecutionConfig): Stream.Stream<ExecutionProgress, AgentError> {
        return Stream.fromEffect(execute(config)).pipe(
          Stream.map(
            (result) =>
              new ExecutionProgress({
                phase: "done",
                currentStep: result.steps.length,
                totalSteps: result.steps.length,
                tokenCount: result.tokenCount,
                elapsed: result.totalDuration,
              }),
          ),
        );
      };

      // Abort implementation
      const abort = function(): Effect.Effect<void> {
        return Effect.sync(() => {});
      };

      return { execute, executeStream, generatePlan, executeStep, abort } as const;
    }),
  );
}

// Re-export AdversarialFinding from executor.ts for compatibility
export { AdversarialFinding } from "./executor.js";
