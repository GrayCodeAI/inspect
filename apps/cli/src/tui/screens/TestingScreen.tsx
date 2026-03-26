import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { Spinner } from "../components/Spinner.js";
import { StatusBar } from "../components/StatusBar.js";

export interface TestConfig {
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

interface TestingScreenProps {
  config: TestConfig;
  onComplete: (results: TestResults) => void;
}

export function TestingScreen({
  config,
  onComplete,
}: TestingScreenProps): React.ReactElement {
  const { exit } = useApp();
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const [phase, setPhase] = useState<"planning" | "executing" | "verifying" | "done">(
    "planning"
  );
  const [liveToolCall, setLiveToolCall] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const startTime = useRef(Date.now());

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Simulate test execution phases
  useEffect(() => {
    const simulateExecution = async () => {
      // Phase 1: Planning
      setPhase("planning");
      setTokenCount((t) => t + 245);
      await delay(1500);

      // Generate test plan steps
      const plannedSteps: StepResult[] = [
        {
          index: 0,
          description: "Navigate to the application",
          status: "pending",
        },
        {
          index: 1,
          description: "Verify page loads without errors",
          status: "pending",
          assertion: "No console errors present",
        },
        {
          index: 2,
          description: "Test primary user interaction",
          status: "pending",
        },
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

      setSteps(plannedSteps);
      setPhase("executing");

      // Phase 2: Execute each step
      for (let i = 0; i < plannedSteps.length; i++) {
        setCurrentStep(i);

        // Mark step as running
        setSteps((prev) =>
          prev.map((s) => (s.index === i ? { ...s, status: "running" } : s))
        );

        // Simulate tool call
        const toolCalls = [
          { tool: "browser_navigate", args: { url: config.url ?? "http://localhost:3000" } },
          { tool: "browser_snapshot", args: { mode: "hybrid" } },
          { tool: "browser_click", args: { ref: `e${i + 1}` } },
          { tool: "browser_type", args: { ref: `e${i + 2}`, text: "test input" } },
          { tool: "browser_screenshot", args: { mode: "viewport" } },
          { tool: "browser_console", args: { level: "error" } },
        ];
        const call = toolCalls[i % toolCalls.length];
        setLiveToolCall(`${call.tool}(${JSON.stringify(call.args)})`);
        setTokenCount((t) => t + 120 + Math.floor(Math.random() * 80));

        await delay(800 + Math.random() * 1200);

        // Determine result (mostly pass, occasional fail for realism)
        const passed = Math.random() > 0.15;
        setSteps((prev) =>
          prev.map((s) =>
            s.index === i
              ? {
                  ...s,
                  status: passed ? "pass" : "fail",
                  duration: Date.now() - startTime.current - (i * 1500),
                  toolCalls: [{ ...call, result: passed ? "success" : "element not found" }],
                  error: passed ? undefined : "Assertion failed: expected element to be visible",
                }
              : s
          )
        );

        setLiveToolCall(null);
      }

      // Phase 3: Verification
      setPhase("verifying");
      setTokenCount((t) => t + 180);
      await delay(800);

      // Done
      setPhase("done");
      const finalSteps = await new Promise<StepResult[]>((resolve) => {
        setSteps((prev) => {
          resolve(prev);
          return prev;
        });
      });

      const results: TestResults = {
        instruction: config.instruction,
        status: finalSteps.every((s) => s.status === "pass") ? "pass" : "fail",
        steps: finalSteps,
        totalDuration: Date.now() - startTime.current,
        tokenCount,
        agent: config.agent,
        device: config.devices[0],
        timestamp: new Date().toISOString(),
      };

      await delay(500);
      onComplete(results);
    };

    simulateExecution();
  }, []);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    // Scroll steps
    if (key.upArrow) {
      setScrollOffset((o) => Math.max(0, o - 1));
    }
    if (key.downArrow) {
      setScrollOffset((o) => Math.min(steps.length - 1, o + 1));
    }
  });

  const formatElapsed = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const visibleSteps = steps.slice(scrollOffset, scrollOffset + 10);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Box>
          <Text bold color="blue">
            Inspect
          </Text>
          <Text dimColor> | </Text>
          <Text>{config.agent}</Text>
          <Text dimColor> | </Text>
          <Text>{config.mode}</Text>
          <Text dimColor> | </Text>
          <Text>{config.devices[0]}</Text>
        </Box>
        <Box>
          <Text dimColor>
            {formatElapsed(elapsed)} | {tokenCount} tokens
          </Text>
        </Box>
      </Box>

      {/* Instruction */}
      <Box marginBottom={1}>
        <Text dimColor>Instruction: </Text>
        <Text>{config.instruction}</Text>
      </Box>

      {/* Phase indicator */}
      <Box marginBottom={1}>
        {phase !== "done" ? (
          <Spinner
            label={
              phase === "planning"
                ? "Planning test steps..."
                : phase === "executing"
                  ? `Executing step ${currentStep + 1}/${steps.length}...`
                  : "Verifying results..."
            }
          />
        ) : (
          <Text color="green" bold>
            Test complete
          </Text>
        )}
      </Box>

      {/* Steps */}
      <Box flexDirection="column">
        {visibleSteps.map((step) => (
          <Box key={step.index} marginLeft={1}>
            <Box width={3}>
              {step.status === "pass" ? (
                <Text color="green">✓</Text>
              ) : step.status === "fail" ? (
                <Text color="red">✗</Text>
              ) : step.status === "running" ? (
                <Text color="yellow">●</Text>
              ) : (
                <Text dimColor>○</Text>
              )}
            </Box>
            <Box flexDirection="column">
              <Text
                color={
                  step.status === "pass"
                    ? "green"
                    : step.status === "fail"
                      ? "red"
                      : step.status === "running"
                        ? "yellow"
                        : "gray"
                }
              >
                {step.description}
              </Text>
              {step.assertion && step.status !== "pending" && (
                <Text dimColor>  Assert: {step.assertion}</Text>
              )}
              {step.error && (
                <Text color="red">  Error: {step.error}</Text>
              )}
            </Box>
          </Box>
        ))}
      </Box>

      {/* Live tool call */}
      {liveToolCall && (
        <Box marginTop={1} marginLeft={2}>
          <Text dimColor>Tool: </Text>
          <Text color="cyan">{liveToolCall}</Text>
        </Box>
      )}

      {/* Status bar */}
      <StatusBar
        items={[
          { label: "Phase", value: phase },
          { label: "Steps", value: `${steps.filter((s) => s.status === "pass" || s.status === "fail").length}/${steps.length}` },
          { label: "Esc", value: "cancel" },
        ]}
      />
    </Box>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
