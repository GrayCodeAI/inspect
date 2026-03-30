import type { DeviceConfig } from "../devices/presets.js";
import type { AgentRouter } from "@inspect/agent";
import { LoopDetector, type LoopNudge } from "@inspect/agent";
import { ContextCompactor } from "@inspect/agent";
import { SensitiveDataMasker } from "@inspect/agent";
import { RecoveryManager } from "./recovery.js";
import type { RecoveryExecutors } from "./recovery.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("core/executor");

export interface ExecutionConfig {
  instruction: string;
  prompt: string;
  agent: string;
  mode: "dom" | "hybrid" | "cua";
  url?: string;
  device: DeviceConfig;
  browser: "chromium" | "firefox" | "webkit";
  headed: boolean;
  a11y: boolean;
  lighthouse: boolean;
  security: boolean;
  mockFile?: string;
  faultProfile?: string;
  credentialId?: string;
  sensitiveData?: Record<string, string>;
  maxSteps: number;
  timeoutMs: number;
  stepTimeoutMs: number;
  verbose: boolean;
  /** Enable rrweb session recording during test execution */
  recording?: boolean;
  /** Directory to save recordings (default: .inspect/recordings) */
  recordingDir?: string;
  /** Enable adversarial testing mode */
  adversarial?: boolean;
  /** Adversarial testing intensity: basic (boundary tests), standard (+ injection), aggressive (+ race conditions) */
  adversarialIntensity?: "basic" | "standard" | "aggressive";
}

export interface ExecutorDependencies {
  router: AgentRouter;
  browserManager: unknown;
  credentialVault?: unknown;
  /** Custom plan generator — overrides the default placeholder */
  planGenerator?: (config: ExecutionConfig) => Promise<StepPlan[]>;
  /** Custom step executor — overrides the default placeholder */
  stepExecutor?: (
    step: StepPlan,
    config: ExecutionConfig,
    toolCalls: StepResult["toolCalls"],
  ) => Promise<void>;
  /** Custom recovery executors — overrides the default no-ops */
  recoveryExecutors?: RecoveryExecutors;
  /** Session recording hooks */
  recording?: {
    start: () => Promise<void>;
    stop: () => Promise<unknown[]>;
    save: (planId: string) => Promise<string>;
    generateViewer: (outputPath: string) => Promise<string>;
  };
}

export interface StepPlan {
  index: number;
  description: string;
  assertion?: string;
  type: "navigate" | "interact" | "verify" | "extract" | "wait";
  /** Which area/component this step targets (for diff-aware and adversarial plans) */
  targetArea?: string;
  /** Why this step was generated */
  rationale?: string;
}

export interface StepResult {
  index: number;
  description: string;
  status: "pass" | "fail" | "skipped";
  assertion?: string;
  error?: string;
  duration: number;
  toolCalls: Array<{
    tool: string;
    args: Record<string, unknown>;
    result?: unknown;
    duration: number;
  }>;
  screenshot?: string;
  consoleLogs?: string[];
}

export interface ExecutionResult {
  status: "pass" | "fail" | "error" | "timeout";
  steps: StepResult[];
  totalDuration: number;
  tokenCount: number;
  agent: string;
  device: string;
  timestamp: string;
  error?: string;
  /** Path to session recording file (if recording was enabled) */
  recordingPath?: string;
  /** Path to replay viewer HTML (if recording was enabled) */
  replayViewerPath?: string;
  /** Adversarial findings (if adversarial mode was enabled) */
  adversarialFindings?: AdversarialFinding[];
}

/** A finding from adversarial testing */
export interface AdversarialFinding {
  /** Severity of the finding */
  severity: "critical" | "high" | "medium" | "low" | "info";
  /** Category of finding */
  category: "security" | "functionality" | "ux" | "performance" | "accessibility";
  /** What was tested */
  instruction: string;
  /** What was found */
  finding: string;
  /** Steps to reproduce */
  steps: string[];
  /** Expected vs actual behavior */
  expected: string;
  actual: string;
}

export interface ExecutionProgress {
  phase: "planning" | "executing" | "verifying" | "done";
  currentStep: number;
  totalSteps: number;
  tokenCount: number;
  elapsed: number;
  currentToolCall?: string;
  stepResult?: StepResult;
}

type ProgressCallback = (progress: ExecutionProgress) => void;

/**
 * TestExecutor orchestrates the full lifecycle of a test run:
 * 1. Send instruction + context to AI agent for plan generation
 * 2. Execute each planned step via browser tools
 * 3. Collect results, screenshots, and assertions
 * 4. Handle timeouts, retries, and recovery
 */
export class TestExecutor {
  private config: ExecutionConfig;
  private deps: ExecutorDependencies;
  private onProgress: ProgressCallback | null = null;
  private abortController: AbortController;
  private tokenCount = 0;
  private startTime = 0;
  private recoveryManager: RecoveryManager;
  private maxStepRetries: number;
  private loopDetector: LoopDetector;
  private compactor: ContextCompactor;
  private masker: SensitiveDataMasker | null;

  constructor(config: ExecutionConfig, deps?: ExecutorDependencies) {
    this.config = config;
    this.deps = deps ?? { router: null as unknown as AgentRouter, browserManager: null };
    this.abortController = new AbortController();
    this.recoveryManager = new RecoveryManager(3);
    this.maxStepRetries = 2;
    this.loopDetector = new LoopDetector();
    this.compactor = new ContextCompactor({ threshold: 80_000, keepLast: 10 });
    this.masker = config.sensitiveData ? new SensitiveDataMasker(config.sensitiveData) : null;
  }

  /**
   * Register a callback for real-time progress updates.
   */
  setProgressCallback(callback: ProgressCallback): void {
    this.onProgress = callback;
  }

  /**
   * Abort the current execution.
   */
  abort(): void {
    this.abortController.abort();
  }

  /**
   * Main execution entry point.
   */
  async execute(): Promise<ExecutionResult> {
    this.startTime = Date.now();
    this.tokenCount = 0;

    try {
      // Start session recording if enabled
      if (this.config.recording && this.deps.recording) {
        try {
          await this.deps.recording.start();
          logger.info("Session recording started");
        } catch (err) {
          logger.warn("Failed to start session recording", { error: String(err) });
        }
      }

      // Phase 1: Plan generation
      this.emitProgress({
        phase: "planning",
        currentStep: 0,
        totalSteps: 0,
        tokenCount: this.tokenCount,
        elapsed: this.elapsed(),
      });

      const plan = await this.generatePlan();
      this.tokenCount += estimateTokens(this.config.prompt);

      // Phase 2: Step execution
      const results: StepResult[] = [];
      let stepIndex = 0;

      for (const step of plan) {
        // Check abort
        if (this.abortController.signal.aborted) {
          break;
        }

        // Check timeout
        if (this.elapsed() > this.config.timeoutMs) {
          const result = this.buildResult("timeout", results, "Test timeout exceeded");
          await this.finalizeRecording(result);
          return result;
        }

        // Check max steps
        if (stepIndex >= this.config.maxSteps) {
          break;
        }

        this.emitProgress({
          phase: "executing",
          currentStep: stepIndex,
          totalSteps: plan.length,
          tokenCount: this.tokenCount,
          elapsed: this.elapsed(),
        });

        const stepResult = await this.executeStep(step);
        results.push(stepResult);

        // Record action for loop detection
        const primaryToolCall = stepResult.toolCalls[0];
        if (primaryToolCall) {
          this.loopDetector.record({
            type: primaryToolCall.tool,
            ref: primaryToolCall.args?.ref as string | undefined,
            value: primaryToolCall.args?.value as string | undefined,
            url: this.config.url ?? "",
          });
        }

        // Check for loops — inject nudge if detected
        const detection = this.loopDetector.detectLoop();
        if (detection.detected) {
          const nudge = this.loopDetector.getNudge();
          logger.warn("Loop detected in agent execution", {
            loopType: detection.loopType,
            confidence: detection.confidence,
            severity: nudge.severity,
          });
          if (nudge.severity === "critical") {
            const result = this.buildResult(
              "fail",
              results,
              `Agent stuck in loop: ${nudge.message}`,
            );
            await this.finalizeRecording(result);
            return result;
          }
          // For info/warning nudges, the nudge message would be injected
          // into the next LLM prompt context when generatePlan is connected
        }

        this.emitProgress({
          phase: "executing",
          currentStep: stepIndex,
          totalSteps: plan.length,
          tokenCount: this.tokenCount,
          elapsed: this.elapsed(),
          stepResult,
        });

        stepIndex++;
      }

      // Phase 3: Verification
      this.emitProgress({
        phase: "verifying",
        currentStep: plan.length,
        totalSteps: plan.length,
        tokenCount: this.tokenCount,
        elapsed: this.elapsed(),
      });

      const overallStatus = results.every((r) => r.status === "pass") ? "pass" : "fail";

      // Phase 4: Done
      this.emitProgress({
        phase: "done",
        currentStep: plan.length,
        totalSteps: plan.length,
        tokenCount: this.tokenCount,
        elapsed: this.elapsed(),
      });

      const result = this.buildResult(overallStatus as "pass" | "fail", results);
      await this.finalizeRecording(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const result = this.buildResult("error", [], message);
      await this.finalizeRecording(result);
      return result;
    }
  }

  /**
   * Generate a test plan from the AI agent.
   *
   * Uses the injected `deps.planGenerator` if provided, otherwise falls back
   * to a static placeholder plan.
   */
  private async generatePlan(): Promise<StepPlan[]> {
    if (this.deps.planGenerator) {
      return this.deps.planGenerator(this.config);
    }

    logger.warn(
      "generatePlan() is using placeholder implementation. Connect an LLM provider for real test plan generation.",
    );

    const plans: StepPlan[] = [
      {
        index: 0,
        description: "Navigate to the target URL",
        type: "navigate",
      },
      {
        index: 1,
        description: "Wait for page to be fully loaded",
        type: "wait",
        assertion: "Page loads without errors",
      },
      {
        index: 2,
        description: "Take accessibility snapshot and identify interactive elements",
        type: "verify",
      },
      {
        index: 3,
        description: "Execute primary interaction based on instruction",
        type: "interact",
        assertion: "Interaction completes successfully",
      },
      {
        index: 4,
        description: "Verify state changes after interaction",
        type: "verify",
        assertion: "Expected state changes occurred",
      },
      {
        index: 5,
        description: "Check for console errors and network failures",
        type: "verify",
        assertion: "No unexpected errors in console or network",
      },
    ];

    return plans;
  }

  /**
   * Execute a single test step with auto-retry and healing.
   *
   * On failure, the RecoveryManager diagnoses the error and suggests
   * strategies (reScan, healSelector, scrollIntoView, etc.). The step
   * is retried up to `maxStepRetries` times after each successful recovery.
   */
  private async executeStep(step: StepPlan): Promise<StepResult> {
    const stepStart = Date.now();
    const toolCalls: StepResult["toolCalls"] = [];
    let lastError: string | undefined;
    let retries = 0;

    while (retries <= this.maxStepRetries) {
      try {
        // Apply step timeout
        const stepTimeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Step timeout")), this.config.stepTimeoutMs);
        });

        // Execute the step (race with timeout)
        await Promise.race([this.runStep(step, toolCalls), stepTimeout]);

        const duration = Date.now() - stepStart;
        this.tokenCount += 50;

        return {
          index: step.index,
          description: step.description,
          status: "pass",
          assertion: step.assertion,
          duration,
          toolCalls,
          ...(retries > 0 ? { consoleLogs: [`Passed after ${retries} retry(s)`] } : {}),
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);

        // Don't retry if we've used all attempts
        if (retries >= this.maxStepRetries) break;

        // Diagnose and attempt recovery
        const diagnosis = this.recoveryManager.diagnose(lastError, {
          selector: undefined,
          url: this.config.url,
        });

        const recovered = await this.recoveryManager.recover(
          diagnosis,
          this.getRecoveryExecutors(),
        );

        if (!recovered) break;

        retries++;
        this.tokenCount += 10; // Estimate recovery token cost
      }
    }

    const duration = Date.now() - stepStart;
    return {
      index: step.index,
      description: step.description,
      status: "fail",
      assertion: step.assertion,
      error: lastError,
      duration,
      toolCalls,
      ...(retries > 0 ? { consoleLogs: [`Failed after ${retries} retry(s): ${lastError}`] } : {}),
    };
  }

  /**
   * Build recovery executors for the current execution context.
   * Uses injected executors if provided, otherwise falls back to defaults.
   */
  private getRecoveryExecutors(): RecoveryExecutors {
    if (this.deps.recoveryExecutors) {
      return this.deps.recoveryExecutors;
    }

    // Simulation-mode recovery executors
    // Real implementations are injected via createExecutorAdapters()
    return {
      reScan: async () => {
        logger.info("Recovery: reScan (simulation mode — no-op)");
        return true;
      },
      waitForLoad: async () => {
        logger.info("Recovery: waitForLoad (2s delay)");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return true;
      },
      scrollIntoView: async () => {
        logger.info("Recovery: scrollIntoView (simulation mode — no-op)");
        return true;
      },
      dismissOverlay: async () => {
        logger.info("Recovery: dismissOverlay (simulation mode — no-op)");
        return true;
      },
      refreshPage: async () => {
        logger.info("Recovery: refreshPage (simulation mode — no-op)");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return true;
      },
    };
  }

  /**
   * Run the actual step logic.
   *
   * Uses the injected `deps.stepExecutor` if provided, otherwise falls back
   * to a placeholder that records tool calls without real browser actions.
   */
  private async runStep(step: StepPlan, toolCalls: StepResult["toolCalls"]): Promise<void> {
    if (this.deps.stepExecutor) {
      return this.deps.stepExecutor(step, this.config, toolCalls);
    }

    // Simulation mode — no browser connected
    logger.warn(
      `Step ${step.index}: Running in simulation mode (no browser). Use createExecutorAdapters() for real execution.`,
    );

    switch (step.type) {
      case "navigate": {
        const url = this.config.url ?? "http://localhost:3000";
        const callStart = Date.now();
        toolCalls.push({
          tool: "browser_navigate",
          args: { url },
          result: { url, status: 200, simulated: true },
          duration: Date.now() - callStart,
        });
        break;
      }

      case "wait": {
        const callStart = Date.now();
        toolCalls.push({
          tool: "browser_wait",
          args: { navigation: true, timeout: 10000 },
          result: { ready: true, simulated: true },
          duration: Date.now() - callStart,
        });
        break;
      }

      case "interact": {
        const callStart = Date.now();
        toolCalls.push({
          tool: "browser_snapshot",
          args: { mode: this.config.mode },
          result: { elements: "...", simulated: true },
          duration: Date.now() - callStart,
        });
        break;
      }

      case "verify": {
        const callStart = Date.now();
        toolCalls.push({
          tool: "browser_console",
          args: { level: "error" },
          result: { logs: [], simulated: true },
          duration: Date.now() - callStart,
        });
        break;
      }

      case "extract": {
        const callStart = Date.now();
        toolCalls.push({
          tool: "browser_evaluate",
          args: { expression: "document.title" },
          result: { value: "Page Title" },
          duration: Date.now() - callStart,
        });
        break;
      }
    }
  }

  private elapsed(): number {
    return Date.now() - this.startTime;
  }

  private emitProgress(progress: ExecutionProgress): void {
    if (this.onProgress) {
      this.onProgress(progress);
    }
  }

  private buildResult(
    status: "pass" | "fail" | "error" | "timeout",
    steps: StepResult[],
    error?: string,
  ): ExecutionResult {
    return {
      status,
      steps,
      totalDuration: this.elapsed(),
      tokenCount: this.tokenCount,
      agent: this.config.agent,
      device: this.config.device.name,
      timestamp: new Date().toISOString(),
      error,
    };
  }

  /**
   * Finalize session recording: stop, save, and generate replay viewer.
   */
  private async finalizeRecording(result: ExecutionResult): Promise<void> {
    if (!this.config.recording || !this.deps.recording) return;

    try {
      const events = await this.deps.recording.stop();
      logger.info("Session recording stopped", { eventCount: (events as unknown[]).length });

      if ((events as unknown[]).length > 0) {
        const planId = `run-${Date.now()}`;
        const recordingPath = await this.deps.recording.save(planId);
        result.recordingPath = recordingPath;
        logger.info("Session recording saved", { path: recordingPath });

        const viewerPath = recordingPath.replace(/\.json$/, "-viewer.html");
        await this.deps.recording.generateViewer(viewerPath);
        result.replayViewerPath = viewerPath;
        logger.info("Replay viewer generated", { path: viewerPath });
      }
    } catch (err) {
      logger.warn("Failed to finalize session recording", { error: String(err) });
    }
  }
}

/**
 * Rough token estimation for progress tracking.
 */
function estimateTokens(text: string): number {
  // ~4 characters per token on average for English text
  return Math.ceil(text.length / 4);
}
