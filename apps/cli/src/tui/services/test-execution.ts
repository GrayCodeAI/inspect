import { TestPlanStep, TestPlanStepStatus } from "@inspect/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MIN_STEP_DELAY_MS = 800;
const MAX_STEP_DELAY_MS = 2000;
const INITIAL_TOKEN_COUNT = 245;
const TOKEN_INCREMENT_PER_STEP = 120;
const MAX_RANDOM_TOKEN_BONUS = 80;
const SECONDS_PER_MINUTE = 60;
const ELAPSED_PAD_LENGTH = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Types (UI-local, mapped from domain models)
// ─────────────────────────────────────────────────────────────────────────────

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

export type TestPhase = "planning" | "executing" | "verifying" | "done";

export interface TestExecutionState {
  steps: TestPlanStep[];
  currentStep: number;
  elapsed: number;
  tokenCount: number;
  phase: TestPhase;
  liveToolCall: string | null;
  scrollOffset: number;
}

export interface ToolCallInfo {
  tool: string;
  args: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Formatting Utilities
// ─────────────────────────────────────────────────────────────────────────────

export function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainingSeconds = seconds % SECONDS_PER_MINUTE;
  return `${minutes}:${remainingSeconds.toString().padStart(ELAPSED_PAD_LENGTH, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Step Generation
// ─────────────────────────────────────────────────────────────────────────────

export function generateTestPlanSteps(): TestPlanStep[] {
  const steps: Array<{ description: string; assertion?: string }> = [
    { description: "Navigate to the application" },
    {
      description: "Verify page loads without errors",
      assertion: "No console errors present",
    },
    { description: "Test primary user interaction" },
    {
      description: "Check state changes and side effects",
      assertion: "UI updates correctly after action",
    },
    {
      description: "Test edge case with empty/invalid input",
      assertion: "Error handling works properly",
    },
    {
      description: "Verify navigation and URL state",
      assertion: "URL reflects current state",
    },
  ];

  return steps.map(
    (step, index) =>
      new TestPlanStep({
        id: `step-${index}`,
        instruction: step.description,
        status: "pending" as TestPlanStepStatus,
        summary: step.assertion,
      }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Call Simulation
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_CALLS: Array<{ tool: string; args: Record<string, unknown> }> = [
  { tool: "browser_navigate", args: { url: "" } },
  { tool: "browser_snapshot", args: { mode: "hybrid" } },
  { tool: "browser_click", args: { ref: "" } },
  { tool: "browser_type", args: { ref: "", text: "test input" } },
  { tool: "browser_screenshot", args: { mode: "viewport" } },
  { tool: "browser_console", args: { level: "error" } },
];

export function getToolCallsForStep(stepIndex: number, url: string): ToolCallInfo {
  const toolCall = TOOL_CALLS[stepIndex % TOOL_CALLS.length];

  const args = { ...toolCall.args };
  if (args.url === "") {
    args.url = url;
  }
  if (args.ref === "") {
    args.ref = `e${stepIndex + 1}`;
  }

  return { tool: toolCall.tool, args };
}

// ─────────────────────────────────────────────────────────────────────────────
// Delay Utility
// ─────────────────────────────────────────────────────────────────────────────

export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Random Step Delay
// ─────────────────────────────────────────────────────────────────────────────

export function getRandomStepDelay(): number {
  return MIN_STEP_DELAY_MS + Math.random() * (MAX_STEP_DELAY_MS - MIN_STEP_DELAY_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Count Utilities
// ─────────────────────────────────────────────────────────────────────────────

export function getInitialTokenCount(): number {
  return INITIAL_TOKEN_COUNT;
}

export function getStepTokenIncrement(): number {
  return TOKEN_INCREMENT_PER_STEP + Math.floor(Math.random() * MAX_RANDOM_TOKEN_BONUS);
}

export function getVerificationTokenCount(): number {
  return 180;
}
