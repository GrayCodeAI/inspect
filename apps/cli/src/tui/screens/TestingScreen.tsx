import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { Spinner } from "../components/Spinner.js";
import { StatusBar } from "../components/StatusBar.js";
import { PALETTE, ICONS } from "../../utils/theme.js";
import {
  createInitialState,
  formatElapsed,
  generateTestPlanSteps,
  getToolCallsForStep,
  type TestExecutionConfig,
  type TestExecutionState,
  type TestResults,
  type StepResult,
} from "../services/test-execution.js";

interface TestingScreenProps {
  config: TestExecutionConfig;
  onComplete: (results: TestResults) => void;
}

export function TestingScreen({ config, onComplete }: TestingScreenProps): React.ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState<TestExecutionState>(createInitialState);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setState((s) => ({ ...s, elapsed: Math.floor((Date.now() - startTime.current) / 1000) }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    void runTestExecution(config, setState, onComplete, startTime);
  }, []);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      exit();
      return;
    }
    if (key.upArrow) {
      setState((s) => ({ ...s, scrollOffset: Math.max(0, s.scrollOffset - 1) }));
    }
    if (key.downArrow) {
      setState((s) => ({
        ...s,
        scrollOffset: Math.min(state.steps.length - 1, s.scrollOffset + 1),
      }));
    }
  });

  const visibleSteps = state.steps.slice(state.scrollOffset, state.scrollOffset + 10);
  const completedCount = state.steps.filter(
    (s) => s.status === "pass" || s.status === "fail",
  ).length;

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
        {state.phase !== "done" ? (
          <Spinner
            label={
              state.phase === "planning"
                ? "Planning test steps..."
                : state.phase === "executing"
                  ? `Executing step ${state.currentStep + 1}/${state.steps.length}...`
                  : "Verifying results..."
            }
            color="magenta"
          />
        ) : (
          <Text color={PALETTE.green} bold>
            {ICONS.pass} Test complete
          </Text>
        )}
      </Box>

      <Box flexDirection="column">
        {visibleSteps.map((step) => (
          <Box key={step.index} marginLeft={1}>
            <Box width={3}>
              {step.status === "pass" ? (
                <Text color={PALETTE.green}>{ICONS.pass}</Text>
              ) : step.status === "fail" ? (
                <Text color={PALETTE.red}>{ICONS.fail}</Text>
              ) : step.status === "running" ? (
                <Text color={PALETTE.yellow}>{ICONS.running}</Text>
              ) : (
                <Text color={PALETTE.subtle}>{ICONS.pending}</Text>
              )}
            </Box>
            <Box flexDirection="column">
              <Text
                color={
                  step.status === "pass"
                    ? PALETTE.green
                    : step.status === "fail"
                      ? PALETTE.red
                      : step.status === "running"
                        ? PALETTE.yellow
                        : PALETTE.muted
                }
              >
                {step.description}
              </Text>
              {step.assertion && step.status !== "pending" && (
                <Text color={PALETTE.dim}> Assert: {step.assertion}</Text>
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

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTestExecution(
  config: TestExecutionConfig,
  setState: React.Dispatch<React.SetStateAction<TestExecutionState>>,
  onComplete: (results: TestResults) => void,
  startTimeRef: React.MutableRefObject<number>,
): Promise<void> {
  setState((s) => ({ ...s, phase: "planning", tokenCount: s.tokenCount + 245 }));
  await delay(1500);

  const plannedSteps = generateTestPlanSteps();
  setState((s) => ({ ...s, steps: plannedSteps, phase: "executing" }));

  for (let i = 0; i < plannedSteps.length; i++) {
    setState((s) => ({ ...s, currentStep: i }));
    setState((s) => ({
      ...s,
      steps: s.steps.map((step) => (step.index === i ? { ...step, status: "running" } : step)),
    }));

    const call = getToolCallsForStep(i, config.url ?? "http://localhost:3000");
    const toolCallDisplay = `${call.tool}(${JSON.stringify(call.args)})`;
    setState((s) => ({
      ...s,
      liveToolCall: toolCallDisplay,
      tokenCount: s.tokenCount + 120 + Math.floor(Math.random() * 80),
    }));

    await delay(800 + Math.random() * 1200);

    const passed = Math.random() > 0.15;
    setState((s) => ({
      ...s,
      steps: s.steps.map((step) =>
        step.index === i
          ? {
              ...step,
              status: passed ? "pass" : "fail",
              duration: Date.now() - startTimeRef.current - i * 1500,
              toolCalls: [{ ...call, result: passed ? "success" : "element not found" }],
              error: passed ? undefined : "Assertion failed: expected element to be visible",
            }
          : step,
      ),
      liveToolCall: null,
    }));
  }

  setState((s) => ({ ...s, phase: "verifying", tokenCount: s.tokenCount + 180 }));
  await delay(800);

  setState((s) => ({ ...s, phase: "done" }));

  const finalSteps = await new Promise<StepResult[]>((resolve) => {
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
    status: finalSteps.every((s) => s.status === "pass") ? "pass" : "fail",
    steps: finalSteps,
    totalDuration: Date.now() - startTimeRef.current,
    tokenCount,
    agent: config.agent,
    device: config.devices[0],
    timestamp: new Date().toISOString(),
  };

  await delay(500);
  onComplete(results);
}
