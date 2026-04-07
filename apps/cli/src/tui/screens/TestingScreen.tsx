import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { TestPlanStep } from "@inspect/shared";
import { Spinner } from "../components/Spinner.js";
import { StatusBar } from "../components/StatusBar.js";
import { PALETTE, ICONS } from "../../utils/theme.js";
import {
  createInitialState,
  formatElapsed,
  generateTestPlanSteps,
  getToolCallsForStep,
  delay,
  getRandomStepDelay,
  getInitialTokenCount,
  getStepTokenIncrement,
  getVerificationTokenCount,
  type TestExecutionConfig,
  type TestExecutionState,
  type TestPhase,
} from "../services/test-execution.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ELAPSED_INTERVAL_MS = 1000;
const PLANNING_DELAY_MS = 1500;
const VERIFICATION_DELAY_MS = 800;
const COMPLETION_DELAY_MS = 500;
const VISIBLE_STEP_COUNT = 10;
const SCROLL_OFFSET_STEP = 1;
const SUCCESS_THRESHOLD = 0.15;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TestResults {
  instruction: string;
  status: "passed" | "failed";
  steps: TestPlanStep[];
  totalDuration: number;
  tokenCount: number;
  agent: string;
  device: string;
  timestamp: string;
}

interface TestingScreenProps {
  config: TestExecutionConfig;
  onComplete: (results: TestResults) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isCompletedStatus(status: string): boolean {
  return status === "passed" || status === "failed" || status === "skipped";
}

function getStatusIcon(status: string): string {
  if (status === "passed") return ICONS.pass;
  if (status === "failed") return ICONS.fail;
  if (status === "active") return ICONS.running;
  return ICONS.pending;
}

function getStatusColor(status: string): string {
  if (status === "passed") return PALETTE.green;
  if (status === "failed") return PALETTE.red;
  if (status === "active") return PALETTE.yellow;
  return PALETTE.muted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function TestingScreen({ config, onComplete }: TestingScreenProps): React.ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState<TestExecutionState>(createInitialState);
  const startTime = useRef(Date.now());
  const abortRef = useRef<(() => void) | null>(null);

  const handleComplete = useCallback(
    (results: TestResults) => {
      onComplete(results);
    },
    [onComplete],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setState((s) => ({
        ...s,
        elapsed: Math.floor((Date.now() - startTime.current) / ELAPSED_INTERVAL_MS),
      }));
    }, ELAPSED_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cleanupRan = false;

    runTestExecution(config, setState, handleComplete, startTime).then(({ abort }) => {
      if (!cleanupRan) {
        abortRef.current = abort;
      }
    });

    return () => {
      cleanupRan = true;
      if (abortRef.current) {
        abortRef.current();
      }
    };
  }, [config, handleComplete]);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      if (abortRef.current) {
        abortRef.current();
      }
      exit();
      return;
    }
    if (key.upArrow) {
      setState((s) => ({ ...s, scrollOffset: Math.max(0, s.scrollOffset - SCROLL_OFFSET_STEP) }));
    }
    if (key.downArrow) {
      setState((s) => ({
        ...s,
        scrollOffset: Math.min(state.steps.length - 1, s.scrollOffset + SCROLL_OFFSET_STEP),
      }));
    }
  });

  const visibleSteps = state.steps.slice(
    state.scrollOffset,
    state.scrollOffset + VISIBLE_STEP_COUNT,
  );
  const completedCount = state.steps.filter((s) => isCompletedStatus(s.status)).length;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Box>
          <Text bold color={PALETTE.brand}>
            {ICONS.diamond} Inspect
          </Text>
          <Text color={PALETTE.subtle}> | </Text>
          <Text color={PALETTE.orange}>{config.agent}</Text>
          <Text color={PALETTE.subtle}> | </Text>
          <Text color={PALETTE.cyan}>{config.mode}</Text>
          <Text color={PALETTE.subtle}> | </Text>
          <Text color={PALETTE.amber}>{config.devices[0]}</Text>
        </Box>
        <Box>
          <Text color={PALETTE.muted}>
            {formatElapsed(state.elapsed)} {ICONS.separator} {state.tokenCount} tokens
          </Text>
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text color={PALETTE.muted}>Instruction: </Text>
        <Text color={PALETTE.text}>{config.instruction}</Text>
      </Box>

      <Box marginBottom={1}>
        {state.phase !== "done" && (
          <Spinner
            label={getPhaseLabel(state.phase, state.currentStep, state.steps.length)}
            color="magenta"
          />
        )}
        {state.phase === "done" && (
          <Text color={PALETTE.green} bold>
            {ICONS.pass} Test complete
          </Text>
        )}
      </Box>

      <Box flexDirection="column">
        {visibleSteps.map((step) => (
          <Box key={step.id} marginLeft={1}>
            <Box width={3}>
              <Text color={getStatusColor(step.status)}>{getStatusIcon(step.status)}</Text>
            </Box>
            <Box flexDirection="column">
              <Text color={getStatusColor(step.status)}>{step.instruction}</Text>
              {step.summary && step.status !== "pending" && (
                <Text color={PALETTE.dim}> Assert: {step.summary}</Text>
              )}
              {step.error && (
                <Text color={PALETTE.red}>
                  {" "}
                  {ICONS.fail} Error: {step.error}
                </Text>
              )}
            </Box>
          </Box>
        ))}
      </Box>

      {state.liveToolCall && (
        <Box marginTop={1} marginLeft={2}>
          <Text color={PALETTE.muted}>Tool: </Text>
          <Text color={PALETTE.cyan}>{state.liveToolCall}</Text>
        </Box>
      )}

      <StatusBar
        items={[
          { label: "Phase", value: state.phase },
          {
            label: "Steps",
            value: `${completedCount}/${state.steps.length}`,
          },
          { label: "Esc", value: "cancel" },
        ]}
      />
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function getPhaseLabel(phase: TestPhase, currentStep: number, totalSteps: number): string {
  if (phase === "planning") return "Planning test steps...";
  if (phase === "executing") return `Executing step ${currentStep + 1}/${totalSteps}...`;
  return "Verifying results...";
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Execution Logic
// ─────────────────────────────────────────────────────────────────────────────

async function runTestExecution(
  config: TestExecutionConfig,
  setState: React.Dispatch<React.SetStateAction<TestExecutionState>>,
  onComplete: (results: TestResults) => void,
  startTimeRef: React.MutableRefObject<number>,
): Promise<{ abort: () => void }> {
  let aborted = false;
  const abort = () => {
    aborted = true;
  };

  setState((s) => ({ ...s, phase: "planning", tokenCount: s.tokenCount + getInitialTokenCount() }));
  await delay(PLANNING_DELAY_MS);

  const plannedSteps = generateTestPlanSteps();
  setState((s) => ({ ...s, steps: plannedSteps, phase: "executing" }));

  for (let i = 0; i < plannedSteps.length; i++) {
    if (aborted) {
      setState((s) => ({ ...s, phase: "done" }));
      return { abort };
    }

    const currentStepId = plannedSteps[i].id;

    setState((s) => ({ ...s, currentStep: i }));
    setState((s) => ({
      ...s,
      steps: s.steps.map((step) =>
        step.id === currentStepId ? step.update({ status: "active" }) : step,
      ),
    }));

    const call = getToolCallsForStep(i, config.url ?? "http://localhost:3000");
    const toolCallDisplay = `${call.tool}(${JSON.stringify(call.args)})`;
    setState((s) => ({
      ...s,
      liveToolCall: toolCallDisplay,
      tokenCount: s.tokenCount + getStepTokenIncrement(),
    }));

    await delay(getRandomStepDelay());

    const passed = Math.random() > SUCCESS_THRESHOLD;
    setState((s) => ({
      ...s,
      steps: s.steps.map((step) =>
        step.id === currentStepId
          ? step.update({
              status: passed ? "passed" : "failed",
              duration: Date.now() - startTimeRef.current - i * PLANNING_DELAY_MS,
              error: passed ? undefined : "Assertion failed: expected element to be visible",
            })
          : step,
      ),
      liveToolCall: null,
    }));
  }

  setState((s) => ({
    ...s,
    phase: "verifying",
    tokenCount: s.tokenCount + getVerificationTokenCount(),
  }));
  await delay(VERIFICATION_DELAY_MS);

  setState((s) => ({ ...s, phase: "done" }));

  const finalSteps = await new Promise<TestPlanStep[]>((resolve) => {
    setState((prev) => {
      resolve(prev.steps);
      return prev;
    });
  });

  const tokenCount = await new Promise<number>((resolve) => {
    setState((prev) => {
      resolve(prev.tokenCount);
      return prev;
    });
  });

  const results: TestResults = {
    instruction: config.instruction,
    status: finalSteps.every((s) => s.status === "passed") ? "passed" : "failed",
    steps: finalSteps,
    totalDuration: Date.now() - startTimeRef.current,
    tokenCount,
    agent: config.agent,
    device: config.devices[0],
    timestamp: new Date().toISOString(),
  };

  await delay(COMPLETION_DELAY_MS);
  onComplete(results);

  return { abort: () => void 0 };
}
