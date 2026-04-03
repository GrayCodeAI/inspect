import { create } from "zustand";
import type {
  DashboardEvent,
  DashboardRunState,
  DashboardSummary,
  DashboardLogEntry,
  DashboardFlakinessReport,
} from "@inspect/shared";

const MAX_LOG_ENTRIES = 500;

interface DashboardState {
  runs: Map<string, DashboardRunState>;
  summary: DashboardSummary;
  flakiness: DashboardFlakinessReport | null;
  logs: DashboardLogEntry[];
  selectedRunId: string | null;

  // Actions
  handleEvent: (event: DashboardEvent) => void;
  selectRun: (runId: string | null) => void;
  reset: () => void;
}

function emptySummary(): DashboardSummary {
  return { totalRuns: 0, completed: 0, passed: 0, failed: 0, running: 0, queued: 0, elapsed: 0 };
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  runs: new Map(),
  summary: emptySummary(),
  flakiness: null,
  logs: [],
  selectedRunId: null,

  handleEvent: (event: DashboardEvent) => {
    const state = get();

    switch (event.type) {
      case "run:started": {
        const runs = new Map(state.runs);
        runs.set(event.data.runId, event.data);
        set({ runs });
        break;
      }

      case "run:progress": {
        const run = state.runs.get(event.data.runId);
        if (!run) break;
        const runs = new Map(state.runs);
        runs.set(event.data.runId, {
          ...run,
          phase: event.data.phase,
          currentStep: event.data.currentStep,
          totalSteps: event.data.totalSteps,
          tokenCount: event.data.tokenCount,
          elapsed: event.data.elapsed,
          agentActivity: event.data.agentActivity ?? run.agentActivity,
        });
        set({ runs });
        break;
      }

      case "run:step_completed": {
        const run = state.runs.get(event.data.runId);
        if (!run) break;
        const runs = new Map(state.runs);
        const steps = [...(run.steps ?? [])];
        steps[event.data.step.index] = event.data.step;
        runs.set(event.data.runId, { ...run, steps });
        set({ runs });
        break;
      }

      case "run:screenshot": {
        const run = state.runs.get(event.data.runId);
        if (!run) break;
        const runs = new Map(state.runs);
        runs.set(event.data.runId, { ...run, screenshot: event.data.screenshot });
        set({ runs });
        break;
      }

      case "run:log": {
        const logs = [...state.logs, event.data];
        if (logs.length > MAX_LOG_ENTRIES) {
          logs.splice(0, logs.length - MAX_LOG_ENTRIES);
        }
        set({ logs });
        break;
      }

      case "run:completed": {
        const run = state.runs.get(event.data.runId);
        if (!run) break;
        const runs = new Map(state.runs);
        runs.set(event.data.runId, {
          ...run,
          status: event.data.status,
          completedAt: Date.now(),
          phase: "done",
        });
        set({ runs });
        break;
      }

      case "summary:updated": {
        set({ summary: event.data });
        break;
      }

      case "flakiness:updated": {
        set({ flakiness: event.data });
        break;
      }
    }
  },

  selectRun: (runId) => set({ selectedRunId: runId }),

  reset: () =>
    set({
      runs: new Map(),
      summary: emptySummary(),
      flakiness: null,
      logs: [],
      selectedRunId: null,
    }),
}));
