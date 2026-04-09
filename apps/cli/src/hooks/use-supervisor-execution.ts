import { useEffect, useState, useCallback, useRef } from "react";
import { TestPlanStepStatus, TestReport } from "@inspect/shared";

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
  onUpdate?: (executed: ExecutedTestPlanData) => void;
  onComplete?: (report: TestReport) => void;
}

export interface UseSupervisorExecutionState {
  executedPlan: ExecutedTestPlanData | null;
  report: TestReport | null;
  phase: "idle" | "planning" | "executing" | "reporting" | "done";
  error: string | null;
  elapsed: number;
}

// Fallback simulation (to be replaced by real orchestrator)
// TODO: Replace with actual SupervisorExecutor from @inspect/orchestrator
const MIN_STEP_DELAY_MS = 800;
const MAX_STEP_DELAY_MS = 2000;
const SUCCESS_THRESHOLD = 0.15;

function getRandomDelay(): number {
  return MIN_STEP_DELAY_MS + Math.random() * (MAX_STEP_DELAY_MS - MIN_STEP_DELAY_MS);
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

    // TODO: Here we should call the real orchestrator
    // For now, using placeholder until Effect-TS layer wiring is resolved

    await new Promise((r) => setTimeout(r, 1500));
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
      baseUrl: options.baseUrl,
      isHeadless: options.isHeadless ?? true,
      requiresCookies: options.requiresCookies ?? false,
      instruction: options.instruction,
      createdAt: Date.now(),
    };

    setState((s) => ({ ...s, phase: "executing", executedPlan: plan }));

    for (let i = 0; i < steps.length; i++) {
      if (abortRef.current) {
        setState((s) => ({ ...s, phase: "done" }));
        return;
      }

      const step = steps[i];

      setState((s) => {
        if (!s.executedPlan) return s;
        const newSteps = s.executedPlan.steps.map((st) =>
          st.id === step.id ? { ...st, status: "active" as const } : st,
        );
        return { ...s, executedPlan: { ...s.executedPlan, steps: newSteps } };
      });

      await new Promise((r) => setTimeout(r, getRandomDelay()));
      if (abortRef.current) return;

      const passed = Math.random() > SUCCESS_THRESHOLD;

      setState((s) => {
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

    setState((s) => ({ ...s, phase: "reporting" }));
    await new Promise((r) => setTimeout(r, 800));

    const finalSteps = state.executedPlan?.steps ?? [];
    const allPassed = finalSteps.every((s) => s.status === "passed");
    const report: TestReport = {
      plan: state.executedPlan as any,
      summary: allPassed ? "All tests passed" : "Some tests failed",
      steps: finalSteps.map((s) => ({
        stepId: s.id as any,
        title: s.instruction,
        status: s.status === "passed" ? "passed" : s.status === "failed" ? "failed" : "not-run",
        summary: s.summary ?? "",
      })),
      screenshotPaths: [],
      status: allPassed ? "passed" : "failed",
    } as TestReport;

    setState((s) => ({ ...s, phase: "done", report }));
    options.onComplete?.(report);
  }, [options, state.executedPlan]);

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
