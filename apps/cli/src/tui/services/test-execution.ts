export interface TestExecutionConfig {
  instruction: string;
  prompt: string;
  agent: string;
  mode: string;
  headed: boolean;
  url?: string;
  devices: string[];
  a11y: boolean;
  lighthouse: boolean;
  mockFile?: string;
  faultProfile?: string;
  browser: string;
  verbose: boolean;
}

export interface StepResult {
  index: number;
  description: string;
  status: "pass" | "fail" | "running" | "pending";
  duration?: number;
  assertion?: string;
  error?: string;
  screenshot?: string;
  toolCalls?: Array<{ tool: string; args: Record<string, unknown>; result?: string }>;
}

export interface TestResults {
  instruction: string;
  status: "pass" | "fail";
  steps: StepResult[];
  totalDuration: number;
  tokenCount: number;
  agent: string;
  device: string;
  timestamp: string;
}

export type TestPhase = "planning" | "executing" | "verifying" | "done";

export interface TestExecutionState {
  steps: StepResult[];
  currentStep: number;
  elapsed: number;
  tokenCount: number;
  phase: TestPhase;
  liveToolCall: string | null;
  scrollOffset: number;
}

export function createInitialState(): TestExecutionState {
  return {
    steps: [],
    currentStep: 0,
    elapsed: 0,
    tokenCount: 0,
    phase: "planning",
    liveToolCall: null,
    scrollOffset: 0,
  };
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function generateTestPlanSteps(): StepResult[] {
  return [
    { index: 0, description: "Navigate to the application", status: "pending" },
    {
      index: 1,
      description: "Verify page loads without errors",
      status: "pending",
      assertion: "No console errors present",
    },
    { index: 2, description: "Test primary user interaction", status: "pending" },
    {
      index: 3,
      description: "Check state changes and side effects",
      status: "pending",
      assertion: "UI updates correctly after action",
    },
    {
      index: 4,
      description: "Test edge case with empty/invalid input",
      status: "pending",
      assertion: "Error handling works properly",
    },
    {
      index: 5,
      description: "Verify navigation and URL state",
      status: "pending",
      assertion: "URL reflects current state",
    },
  ];
}

export interface ToolCallInfo {
  tool: string;
  args: Record<string, unknown>;
}

export function getToolCallsForStep(stepIndex: number, url: string): ToolCallInfo {
  const toolCalls = [
    { tool: "browser_navigate", args: { url } },
    { tool: "browser_snapshot", args: { mode: "hybrid" } },
    { tool: "browser_click", args: { ref: `e${stepIndex + 1}` } },
    { tool: "browser_type", args: { ref: `e${stepIndex + 2}`, text: "test input" } },
    { tool: "browser_screenshot", args: { mode: "viewport" } },
    { tool: "browser_console", args: { level: "error" } },
  ];
  return toolCalls[stepIndex % toolCalls.length];
}
