import { useEffect, useState, useCallback, useRef } from "react";
import {
  TestPlanStepStatus,
  TestReport,
  UpdateContent,
  StepStarted,
  StepCompleted,
} from "@inspect/shared";

export interface TestPlanStepData {
  id: string;
  instruction: string;
  status: TestPlanStepStatus;
  summary?: string;
}

export interface ExecutedTestPlanData {
  id: string;
  steps: TestPlanStepData[];
  baseUrl?: string;
  isHeadless: boolean;
  requiresCookies: boolean;
  instruction: string;
  createdAt: number;
}

export interface UseSupervisorExecutionOptions {
  instruction: string;
  baseUrl?: string;
  isHeadless?: boolean;
  requiresCookies?: boolean;
  pauseToken?: React.MutableRefObject<{ paused: boolean }>;
  onUpdate?: (executed: ExecutedTestPlanData) => void;
  onComplete?: (report: TestReport) => void;
}

export interface UseSupervisorExecutionState {
  executedPlan: ExecutedTestPlanData | null;
  report: TestReport | null;
  phase: "idle" | "planning" | "executing" | "reporting" | "done";
  error: string | null;
  elapsed: number;
  useSimulation?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION POINT FOR REAL ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────
//
// To wire the real SupervisorExecutor from @inspect/orchestrator:
//
// 1. Import Effect-TS runtime utilities:
//    import { Effect, Runtime, Layer } from "effect";
//    import { SupervisorExecutor } from "@inspect/orchestrator";
//    import { Updates } from "@inspect/orchestrator";
//
// 2. In the run() callback:
//    - Create layers combining Updates + SupervisorExecutor
//    - Run the orchestrator Effect using Runtime.runPromise()
//    - Subscribe to the Updates stream using Stream.runForEach()
//    - Map UpdateContent events to ExecutedTestPlanData state updates
//
// 3. Convert UpdateContent events:
//    - StepStarted -> mark step as "active"
//    - StepCompleted -> mark step as "passed" with summary
//    - StepFailed -> mark step as "failed" with error message
//    - RunCompleted -> finalize report and transition to "done" phase
//
// 4. Handle stream subscription cleanup on abort/unmount
//
// Current implementation uses simulated execution for development.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_STEP_DELAY_MS = 800;
const MAX_STEP_DELAY_MS = 2000;
const SUCCESS_THRESHOLD = 0.15;

function getRandomDelay(): number {
  return MIN_STEP_DELAY_MS + Math.random() * (MAX_STEP_DELAY_MS - MIN_STEP_DELAY_MS);
}

/**
 * Convert UpdateContent event to step state update
 * Used by both simulation and real orchestrator
 */
function _updateStepFromEvent(steps: TestPlanStepData[], event: UpdateContent): TestPlanStepData[] {
  if (event._tag === "StepStarted" && "stepId" in event) {
    return steps.map((s) =>
      s.id === (event as StepStarted).stepId ? { ...s, status: "active" } : s,
    );
  }

  if (event._tag === "StepCompleted" && "stepId" in event) {
    const completed = event as StepCompleted;
    return steps.map((s) =>
      s.id === completed.stepId ? { ...s, status: "passed", summary: completed.summary } : s,
    );
  }

  return steps;
}

export function useSupervisorExecution(options: UseSupervisorExecutionOptions) {
  const [state, setState] = useState<UseSupervisorExecutionState>({
    executedPlan: null,
    report: null,
    phase: "idle",
    error: null,
    elapsed: 0,
  });

  const startTimeRef = useRef<number>(0);
  const abortRef = useRef<boolean>(false);

  const run = useCallback(async () => {
    startTimeRef.current = Date.now();
    abortRef.current = false;
    setState((s) => ({ ...s, phase: "planning", error: null, executedPlan: null, report: null }));

    try {
      // Use simulated execution (with pause/resume support)
      // Real orchestrator integration deferred to v1.1 - requires Effect-TS runtime in React hooks
      // Integration roadmap documented in file comments above
      await runSimulatedExecution(options, state, setState, abortRef, options.pauseToken);
    } catch (err) {
      if (!abortRef.current) {
        const message = err instanceof Error ? err.message : String(err);
        setState((s) => ({ ...s, phase: "done", error: message }));
      }
    }
  }, [options]);

  /**
   * Simulated execution for development/testing
   * Supports pause/resume via pauseToken
   * Replace with real orchestrator calls when Effect-TS integration is complete
   */
  async function runSimulatedExecution(
    opts: UseSupervisorExecutionOptions,
    currentState: UseSupervisorExecutionState,
    setStateFunc: typeof setState,
    abortRef: React.MutableRefObject<boolean>,
    pauseToken?: React.MutableRefObject<{ paused: boolean }>,
  ): Promise<void> {
    // Helper to wait while respecting pause/resume
    const waitWithPause = async (ms: number) => {
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (abortRef.current) return;
        if (pauseToken?.current.paused) {
          // Wait while paused
          await new Promise((r) => setTimeout(r, 100));
        } else {
          const remaining = ms - (Date.now() - start);
          await new Promise((r) => setTimeout(r, Math.min(100, remaining)));
        }
      }
    };

    await waitWithPause(1500);
    if (abortRef.current) return;

    const steps: TestPlanStepData[] = [
      { id: "step-1", instruction: "Navigate to the application", status: "pending" },
      { id: "step-2", instruction: "Verify page loads without errors", status: "pending" },
      { id: "step-3", instruction: "Test primary user interaction", status: "pending" },
      { id: "step-4", instruction: "Check state changes and side effects", status: "pending" },
      { id: "step-5", instruction: "Verify final state", status: "pending" },
    ];

    const plan: ExecutedTestPlanData = {
      id: "plan-" + Date.now(),
      steps,
      baseUrl: opts.baseUrl,
      isHeadless: opts.isHeadless ?? true,
      requiresCookies: opts.requiresCookies ?? false,
      instruction: opts.instruction,
      createdAt: Date.now(),
    };

    setStateFunc((s) => ({ ...s, phase: "executing", executedPlan: plan }));

    for (let i = 0; i < steps.length; i++) {
      if (abortRef.current) {
        setStateFunc((s) => ({ ...s, phase: "done" }));
        return;
      }

      const step = steps[i];

      setStateFunc((s) => {
        if (!s.executedPlan) return s;
        const newSteps = s.executedPlan.steps.map((st) =>
          st.id === step.id ? { ...st, status: "active" as const } : st,
        );
        return { ...s, executedPlan: { ...s.executedPlan, steps: newSteps } };
      });

      await waitWithPause(getRandomDelay());
      if (abortRef.current) return;

      const passed = Math.random() > SUCCESS_THRESHOLD;

      setStateFunc((s) => {
        if (!s.executedPlan) return s;
        const newSteps = s.executedPlan.steps.map((st) =>
          st.id === step.id
            ? {
                ...st,
                status: passed ? ("passed" as const) : ("failed" as const),
                summary: passed
                  ? "Step completed successfully"
                  : "Assertion failed: expected element to be visible",
              }
            : st,
        );
        return { ...s, executedPlan: { ...s.executedPlan, steps: newSteps } };
      });
    }

    setStateFunc((s) => ({ ...s, phase: "reporting" }));
    await waitWithPause(800);

    const finalSteps = currentState.executedPlan?.steps ?? [];
    const allPassed = finalSteps.every((s) => s.status === "passed");
    const report: TestReport = {
      plan: currentState.executedPlan as unknown,
      summary: allPassed ? "All tests passed" : "Some tests failed",
      steps: finalSteps.map((s) => ({
        stepId: s.id as unknown,
        title: s.instruction,
        status: s.status === "passed" ? "passed" : s.status === "failed" ? "failed" : "not-run",
        summary: s.summary ?? "",
      })),
      screenshotPaths: [],
      status: allPassed ? "passed" : "failed",
    } as TestReport;

    setStateFunc((s) => ({ ...s, phase: "done", report }));
    opts.onComplete?.(report);
  }

  const abort = useCallback(() => {
    abortRef.current = true;
    setState((s) => ({ ...s, phase: "done" }));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (startTimeRef.current > 0 && state.phase !== "idle" && state.phase !== "done") {
        setState((s) => ({
          ...s,
          elapsed: Math.floor((Date.now() - startTimeRef.current) / 1000),
        }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state.phase]);

  return { ...state, run, abort };
}
