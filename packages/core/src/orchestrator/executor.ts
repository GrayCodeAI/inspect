import type { DeviceConfig } from "../devices/presets.js";

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
  mockFile?: string;
  faultProfile?: string;
  maxSteps: number;
  timeoutMs: number;
  stepTimeoutMs: number;
  verbose: boolean;
}

export interface StepPlan {
  index: number;
  description: string;
  assertion?: string;
  type: "navigate" | "interact" | "verify" | "extract" | "wait";
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
  private onProgress: ProgressCallback | null = null;
  private abortController: AbortController;
  private tokenCount = 0;
  private startTime = 0;

  constructor(config: ExecutionConfig) {
    this.config = config;
    this.abortController = new AbortController();
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
          return this.buildResult("timeout", results, "Test timeout exceeded");
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

      const overallStatus = results.every((r) => r.status === "pass")
        ? "pass"
        : "fail";

      // Phase 4: Done
      this.emitProgress({
        phase: "done",
        currentStep: plan.length,
        totalSteps: plan.length,
        tokenCount: this.tokenCount,
        elapsed: this.elapsed(),
      });

      return this.buildResult(overallStatus as "pass" | "fail", results);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.buildResult("error", [], message);
    }
  }

  /**
   * Generate a test plan from the AI agent.
   *
   * NOTE: This is a placeholder implementation that returns a static plan.
   * The full implementation will send the prompt to the configured agent
   * via ACP/API and parse the structured plan response.
   *
   * @throws {Error} In production, this should be connected to an LLM provider.
   */
  private async generatePlan(): Promise<StepPlan[]> {
    console.warn(
      "[TestExecutor] generatePlan() is using placeholder implementation. " +
      "Connect an LLM provider for real test plan generation.",
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
   * Execute a single test step.
   */
  private async executeStep(step: StepPlan): Promise<StepResult> {
    const stepStart = Date.now();
    const toolCalls: StepResult["toolCalls"] = [];

    try {
      // Apply step timeout
      const stepTimeout = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Step timeout")),
          this.config.stepTimeoutMs
        );
      });

      // Execute the step (race with timeout)
      const result = await Promise.race([
        this.runStep(step, toolCalls),
        stepTimeout,
      ]);

      const duration = Date.now() - stepStart;
      this.tokenCount += 50; // Estimate per-step token usage

      return {
        index: step.index,
        description: step.description,
        status: "pass",
        assertion: step.assertion,
        duration,
        toolCalls,
      };
    } catch (err) {
      const duration = Date.now() - stepStart;
      const errorMessage =
        err instanceof Error ? err.message : String(err);

      return {
        index: step.index,
        description: step.description,
        status: "fail",
        assertion: step.assertion,
        error: errorMessage,
        duration,
        toolCalls,
      };
    }
  }

  /**
   * Run the actual step logic.
   *
   * NOTE: This is a placeholder that records tool calls without executing
   * real browser actions. The full implementation will dispatch to the
   * browser automation layer and AI agent.
   */
  private async runStep(
    step: StepPlan,
    toolCalls: StepResult["toolCalls"]
  ): Promise<void> {
    switch (step.type) {
      case "navigate": {
        const url = this.config.url ?? "http://localhost:3000";
        const callStart = Date.now();
        // Would call: await page.goto(url, { waitUntil: 'networkidle' });
        toolCalls.push({
          tool: "browser_navigate",
          args: { url },
          result: { url, status: 200 },
          duration: Date.now() - callStart,
        });
        break;
      }

      case "wait": {
        const callStart = Date.now();
        // Would call: await page.waitForLoadState('networkidle');
        toolCalls.push({
          tool: "browser_wait",
          args: { navigation: true, timeout: 10000 },
          result: { ready: true },
          duration: Date.now() - callStart,
        });
        break;
      }

      case "interact": {
        const callStart = Date.now();
        // Would dispatch to agent for interaction decision
        toolCalls.push({
          tool: "browser_snapshot",
          args: { mode: this.config.mode },
          result: { elements: "..." },
          duration: Date.now() - callStart,
        });
        break;
      }

      case "verify": {
        const callStart = Date.now();
        // Would check console, network, DOM state
        toolCalls.push({
          tool: "browser_console",
          args: { level: "error" },
          result: { logs: [] },
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
    error?: string
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
}

/**
 * Rough token estimation for progress tracking.
 */
function estimateTokens(text: string): number {
  // ~4 characters per token on average for English text
  return Math.ceil(text.length / 4);
}
