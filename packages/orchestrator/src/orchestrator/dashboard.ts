/**
 * DashboardOrchestrator — singleton coordinator for multi-agent test monitoring.
 *
 * Wraps TestScheduler with event emission, maintains live state for all active
 * runs, and provides a snapshot API for initial client hydration.
 */

import { EventBus } from "@inspect/shared";
import type {
  AgentActivityType,
  DashboardEvent,
  DashboardRunState,
  DashboardRunPhase,
  DashboardSummary,
  DashboardSnapshot,
  DashboardStepSnapshot,
  DashboardLogEntry,
  DashboardSpawnConfig,
  DashboardFlakinessReport,
  Unsubscribe,
} from "@inspect/shared";
import { FlakinessDetector } from "../testing/flakiness.js";
import type {
  ExecutionConfig,
  ExecutionProgress,
  ExecutorDependencies,
  StepResult,
} from "./executor.js";
import { TestScheduler } from "./scheduler.js";
import type { DeviceConfig } from "@inspect/devices/devices/presets.js";
import { getPreset } from "@inspect/devices/devices/presets.js";

// ---------------------------------------------------------------------------
// Screenshot throttle — max 1 per run per interval
// ---------------------------------------------------------------------------

const SCREENSHOT_THROTTLE_MS = 5_000;
const MAX_LOGS_PER_RUN = 200;

// ---------------------------------------------------------------------------
// DashboardOrchestrator
// ---------------------------------------------------------------------------

export class DashboardOrchestrator {
  private bus = new EventBus<DashboardEvent>();
  private runs = new Map<string, DashboardRunState>();
  private schedulers = new Map<string, TestScheduler>();
  private deps: ExecutorDependencies;
  private startTime = Date.now();
  private lastScreenshot = new Map<string, number>();
  private flakinessDetector = new FlakinessDetector({ minRuns: 2 });

  constructor(deps: ExecutorDependencies) {
    this.deps = deps;
  }

  // -------------------------------------------------------------------------
  // Public API — subscriptions
  // -------------------------------------------------------------------------

  /** Subscribe to a specific dashboard event type. */
  on<T extends DashboardEvent["type"]>(
    type: T,
    handler: (event: Extract<DashboardEvent, { type: T }>) => void,
  ): Unsubscribe {
    return this.bus.on(type, handler);
  }

  /** Subscribe to ALL dashboard events. */
  onEvent(handler: (event: DashboardEvent) => void): Unsubscribe {
    return this.bus.onAny(handler);
  }

  // -------------------------------------------------------------------------
  // Public API — state
  // -------------------------------------------------------------------------

  /** Full state snapshot for initial client hydration. */
  getSnapshot(): DashboardSnapshot {
    return {
      runs: Array.from(this.runs.values()),
      summary: this.computeSummary(),
      flakiness: this.computeFlakinessReport(),
    };
  }

  /** Get a single run's state. */
  getRun(runId: string): DashboardRunState | undefined {
    return this.runs.get(runId);
  }

  // -------------------------------------------------------------------------
  // Public API — commands
  // -------------------------------------------------------------------------

  /**
   * Spawn a new set of test runs (one per device).
   * Returns the run IDs created.
   */
  async spawnRuns(config: DashboardSpawnConfig): Promise<string[]> {
    const devices = config.devices.map((name) => {
      const preset = getPreset(name);
      if (!preset) {
        throw new Error(`Unknown device preset: ${name}`);
      }
      return preset;
    });

    const baseConfig: Omit<ExecutionConfig, "device"> = {
      instruction: config.instruction,
      prompt: config.instruction,
      agent: config.agent ?? "claude",
      mode: config.mode ?? "hybrid",
      url: config.url,
      browser: config.browser ?? "chromium",
      headed: config.headed ?? false,
      a11y: config.a11y ?? false,
      lighthouse: config.lighthouse ?? false,
      security: false,
      maxSteps: 20,
      timeoutMs: 120_000,
      stepTimeoutMs: 30_000,
      verbose: false,
    };

    const runIds: string[] = [];
    const scheduler = new TestScheduler({ concurrency: 3 }, this.deps);
    const schedulerId = `sched_${Date.now()}`;
    this.schedulers.set(schedulerId, scheduler);

    // Pre-register runs so the dashboard sees them immediately
    for (const device of devices) {
      const runId = `run_${device.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      runIds.push(runId);

      const runState: DashboardRunState = {
        runId,
        testName: config.instruction,
        device: device.name,
        browser: config.browser ?? "chromium",
        agent: config.agent ?? "claude",
        status: "queued",
        phase: "planning",
        currentStep: 0,
        totalSteps: 0,
        steps: [],
        tokenCount: 0,
        elapsed: 0,
        logs: [],
        startedAt: Date.now(),
      };

      this.runs.set(runId, runState);
      this.bus.emit({ type: "run:started", data: { ...runState } });
    }

    this.emitSummary();

    // Execute in background — progress callbacks update the dashboard
    this.executeWithTracking(scheduler, baseConfig, devices, runIds).finally(() => {
      this.schedulers.delete(schedulerId);
    });

    return runIds;
  }

  /** Cancel a specific run. */
  cancelRun(runId: string): boolean {
    const run = this.runs.get(runId);
    if (
      !run ||
      run.status === "completed" ||
      run.status === "failed" ||
      run.status === "cancelled"
    ) {
      return false;
    }
    const updatedRun = { ...run, status: "cancelled" as const, completedAt: Date.now() };
    this.runs.set(runId, updatedRun);
    this.bus.emit({
      type: "run:completed",
      data: { runId, status: "cancelled", duration: updatedRun.elapsed, passed: false },
    });
    this.emitSummary();
    return true;
  }

  /** Cancel all active runs. */
  cancelAll(): void {
    for (const scheduler of this.schedulers.values()) {
      scheduler.abort();
    }
    for (const [runId, run] of this.runs) {
      if (run.status === "queued" || run.status === "running") {
        const updatedRun = { ...run, status: "cancelled" as const, completedAt: Date.now() };
        this.runs.set(runId, updatedRun);
        this.bus.emit({
          type: "run:completed",
          data: {
            runId: updatedRun.runId,
            status: "cancelled",
            duration: updatedRun.elapsed,
            passed: false,
          },
        });
      }
    }
    this.emitSummary();
  }

  /** Remove all completed/failed/cancelled runs from state. */
  clearCompleted(): void {
    for (const [id, run] of this.runs) {
      if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
        this.runs.delete(id);
      }
    }
    this.emitSummary();
  }

  // -------------------------------------------------------------------------
  // Internal — execution tracking
  // -------------------------------------------------------------------------

  private async executeWithTracking(
    scheduler: TestScheduler,
    baseConfig: Omit<ExecutionConfig, "device">,
    devices: DeviceConfig[],
    runIds: string[],
  ): Promise<void> {
    // We run devices sequentially here to attach per-run progress callbacks.
    // The TestScheduler handles its own concurrency internally.
    const promises = devices.map((device, i) => this.executeOneRun(baseConfig, device, runIds[i]));
    await Promise.allSettled(promises);
  }

  private async executeOneRun(
    baseConfig: Omit<ExecutionConfig, "device">,
    device: DeviceConfig,
    runId: string,
  ): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;

    const runningRun = { ...run, status: "running" as const };
    this.runs.set(runId, runningRun);

    // Lazy-import to avoid circular deps at module-load time
    const { TestExecutor } = await import("./executor.js");

    const executor = new TestExecutor({ ...baseConfig, device }, this.deps);

    executor.setProgressCallback((progress: ExecutionProgress) => {
      this.handleProgress(runId, progress);
    });

    try {
      const result = await executor.execute();

      const finalStatus = result.status === "pass" ? ("completed" as const) : ("failed" as const);
      const completedRun = {
        ...runningRun,
        status: finalStatus,
        completedAt: Date.now(),
        elapsed: result.totalDuration,
        tokenCount: result.tokenCount,
        phase: "done" as const,
        steps: result.steps.map((s) => this.toStepSnapshot(s)),
        totalSteps: result.steps.length,
        currentStep: result.steps.length,
      };
      this.runs.set(runId, completedRun);

      this.bus.emit({
        type: "run:completed",
        data: {
          runId,
          status: run.status === "completed" ? "completed" : "failed",
          duration: result.totalDuration,
          passed: result.status === "pass",
        },
      });

      // Record for flakiness detection
      this.flakinessDetector.record({
        testId: run.testName,
        testName: run.testName,
        passed: result.status === "pass",
        durationMs: result.totalDuration,
        error: result.error,
        retry: 0,
        timestamp: Date.now(),
        browser: run.browser,
        device: run.device,
      });
      this.emitFlakiness();
    } catch (err) {
      const updatedRun = {
        ...runningRun,
        status: "failed" as const,
        completedAt: Date.now(),
        phase: "done" as const,
      };
      this.runs.set(runId, updatedRun);

      const message = err instanceof Error ? err.message : String(err);
      this.addLog(runId, "error", message);

      this.bus.emit({
        type: "run:completed",
        data: { runId, status: "failed", duration: updatedRun.elapsed, passed: false },
      });
    }

    this.emitSummary();
  }

  private handleProgress(runId: string, progress: ExecutionProgress): void {
    const run = this.runs.get(runId);
    if (!run) return;

    const updatedRun = {
      ...run,
      phase: progress.phase as DashboardRunPhase,
      currentStep: progress.currentStep,
      totalSteps: progress.totalSteps,
      tokenCount: progress.tokenCount,
      elapsed: progress.elapsed,
      agentActivity: progress.currentToolCall
        ? {
            type: this.inferActivityType(progress.currentToolCall),
            target: progress.currentToolCall,
            description: progress.currentToolCall,
            timestamp: Date.now(),
          }
        : undefined,
      steps: run.steps,
    };

    // Emit step completion if a stepResult is present
    if (progress.stepResult) {
      const snapshot = this.toStepSnapshot(progress.stepResult);
      const updatedSteps = [...(updatedRun.steps ?? [])];
      updatedSteps[snapshot.index] = snapshot;
      (updatedRun as unknown as { steps: typeof updatedSteps }).steps = updatedSteps;

      this.bus.emit({
        type: "run:step_completed",
        data: { runId, step: snapshot },
      });

      this.addLog(
        runId,
        progress.stepResult.status === "fail" ? "warn" : "info",
        `Step ${snapshot.index}: ${snapshot.description} — ${snapshot.status}`,
      );
    }

    this.runs.set(runId, updatedRun);

    this.bus.emit({
      type: "run:progress",
      data: {
        runId,
        phase: updatedRun.phase,
        currentStep: updatedRun.currentStep,
        totalSteps: updatedRun.totalSteps,
        tokenCount: updatedRun.tokenCount,
        elapsed: updatedRun.elapsed,
        agentActivity: updatedRun.agentActivity,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Internal — helpers
  // -------------------------------------------------------------------------

  private toStepSnapshot(step: StepResult): DashboardStepSnapshot {
    return {
      index: step.index,
      description: step.description,
      status: step.status === "pass" ? "pass" : step.status === "fail" ? "fail" : "skipped",
      duration: step.duration,
      toolCall:
        step.toolCalls.length > 0
          ? `${step.toolCalls[step.toolCalls.length - 1].tool}(...)`
          : undefined,
    };
  }

  private addLog(runId: string, level: DashboardLogEntry["level"], message: string): void {
    const run = this.runs.get(runId);
    if (!run) return;

    const entry: DashboardLogEntry = { runId, level, message, timestamp: Date.now() };

    // Cap logs per run
    const updatedLogs = [...(run.logs ?? [])];
    if (updatedLogs.length >= MAX_LOGS_PER_RUN) {
      updatedLogs.shift();
    }
    updatedLogs.push(entry);
    this.runs.set(runId, { ...run, logs: updatedLogs });

    this.bus.emit({ type: "run:log", data: entry });
  }

  /** Emit a screenshot event, throttled per run. */
  emitScreenshot(runId: string, screenshot: string): void {
    const now = Date.now();
    const last = this.lastScreenshot.get(runId) ?? 0;
    if (now - last < SCREENSHOT_THROTTLE_MS) return;

    this.lastScreenshot.set(runId, now);

    const run = this.runs.get(runId);
    if (run) {
      this.runs.set(runId, { ...run, screenshot });
    }

    this.bus.emit({
      type: "run:screenshot",
      data: { runId, screenshot, timestamp: now },
    });
  }

  private computeSummary(): DashboardSummary {
    let completed = 0;
    let passed = 0;
    let failed = 0;
    let running = 0;
    let queued = 0;

    for (const run of this.runs.values()) {
      switch (run.status) {
        case "completed":
          completed++;
          passed++;
          break;
        case "failed":
        case "cancelled":
          completed++;
          failed++;
          break;
        case "running":
          running++;
          break;
        case "queued":
          queued++;
          break;
      }
    }

    return {
      totalRuns: this.runs.size,
      completed,
      passed,
      failed,
      running,
      queued,
      elapsed: Date.now() - this.startTime,
    };
  }

  private emitSummary(): void {
    this.bus.emit({ type: "summary:updated", data: this.computeSummary() });
  }

  private computeFlakinessReport(): DashboardFlakinessReport {
    const report = this.flakinessDetector.getReport();
    return {
      totalTests: report.totalTests,
      stableTests: report.stableTests,
      flakyTests: report.flakyTests,
      brokenTests: report.brokenTests,
      entries: report.scores.map(
        (s: {
          testName: string;
          score: number;
          passRate: number;
          totalRuns: number;
          recommendation: "stable" | "flaky" | "broken" | "needs-investigation";
        }) => ({
          testName: s.testName,
          score: s.score,
          passRate: s.passRate,
          totalRuns: s.totalRuns,
          recommendation: s.recommendation,
        }),
      ),
    };
  }

  private emitFlakiness(): void {
    this.bus.emit({ type: "flakiness:updated", data: this.computeFlakinessReport() });
  }

  private inferActivityType(toolCall: string): AgentActivityType {
    if (toolCall.includes("navigate")) return "navigating";
    if (toolCall.includes("click")) return "clicking";
    if (toolCall.includes("type") || toolCall.includes("fill")) return "typing";
    if (toolCall.includes("scroll")) return "scrolling";
    if (toolCall.includes("wait")) return "waiting";
    if (toolCall.includes("snapshot") || toolCall.includes("screenshot")) return "capturing";
    if (toolCall.includes("verify") || toolCall.includes("assert") || toolCall.includes("console"))
      return "verifying";
    return "thinking";
  }
}
