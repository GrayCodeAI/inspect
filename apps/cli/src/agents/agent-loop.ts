// ============================================================================
// Agent Loop — Autonomous AI-driven test execution
//
// Instead of pre-planning all steps, the agent observes the current page state
// and decides the next action each iteration. This works for ANY website
// because the LLM adapts to what it sees in real-time.
//
// Loop: observe snapshot → LLM decides next action → execute → repeat
// ============================================================================

import type { Page } from "@inspect/browser";
import type { TestStep, TestPlan, LLMCall, ProgressCallback, ValidationResult } from "./types.js";
import { detectPageType } from "./planner.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentAction {
  action: string;
  target?: string;
  value?: string;
  assertion?: string;
  reasoning?: string;
}

interface ActionHistoryEntry {
  step: number;
  action: string;
  target?: string;
  result: "pass" | "fail" | "skip";
  pageChanged: boolean;
  url: string;
  summary: string;
}

export interface AgentLoopResult {
  steps: TestStep[];
  plan: TestPlan;
}

// ---------------------------------------------------------------------------
// Parse LLM response into a single action
// ---------------------------------------------------------------------------

function parseAgentAction(response: string): AgentAction | null {
  try {
    let jsonStr = response.trim();

    // Strip markdown fences
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    // Find object boundaries
    const objStart = jsonStr.indexOf("{");
    const objEnd = jsonStr.lastIndexOf("}");
    if (objStart >= 0 && objEnd > objStart) {
      jsonStr = jsonStr.slice(objStart, objEnd + 1);
    }

    // Fix trailing commas
    jsonStr = jsonStr.replace(/,\s*}/g, "}");

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    if (!parsed.action || typeof parsed.action !== "string") return null;

    return {
      action: parsed.action as string,
      target: parsed.target as string | undefined,
      value: parsed.value as string | undefined,
      assertion: parsed.assertion as string | undefined,
      reasoning: parsed.reasoning as string | undefined,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Build the agent prompt for deciding the next action
// ---------------------------------------------------------------------------

function buildAgentPrompt(
  url: string,
  title: string,
  snapshot: string,
  history: ActionHistoryEntry[],
  spaRoutes: string[],
): string {
  const historyText = history.length > 0
    ? history.map(h =>
        `  ${h.step}. [${h.result}] ${h.action}${h.target ? ` "${h.target}"` : ""} → ${h.summary}${h.pageChanged ? " (page changed)" : ""}`,
      ).join("\n")
    : "  (none yet — this is the first action)";

  const routeHint = spaRoutes.length > 0
    ? `\nDiscovered SPA routes to explore:\n${spaRoutes.filter(r => !r.includes(":") && !r.includes("[")).slice(0, 10).map(r => `  - ${r}`).join("\n")}\n`
    : "";

  // Trim snapshot to fit in context — keep the interactive elements
  const trimmedSnapshot = snapshot.length > 6000
    ? snapshot.slice(0, 6000) + "\n... (truncated)"
    : snapshot;

  return `You are an autonomous web testing agent. Your job is to thoroughly test this website by exploring all features — clicking buttons, filling forms, navigating pages, and verifying behavior.

CURRENT PAGE STATE:
  URL: ${url}
  Title: ${title}

Accessibility snapshot (ARIA tree of visible elements):
${trimmedSnapshot}
${routeHint}
Actions taken so far:
${historyText}

Decide the SINGLE next action to take. Pick the most valuable UNEXPLORED interaction.

Available actions:
  click    — click a button, link, or interactive element
  fill     — type text into an input field
  select   — select a dropdown option
  navigate — go to a different URL
  assert   — verify something about the page
  screenshot — capture current state
  scroll   — scroll the page
  hover    — hover over an element
  press    — press a keyboard key
  tab      — test keyboard navigation
  done     — you have thoroughly tested the main features

Return ONLY a JSON object (no markdown, no explanation):
{"action": "...", "target": "element text or label", "value": "for fill/press/navigate", "assertion": "what to verify after action", "reasoning": "brief: why this matters"}

RULES:
- Do NOT repeat actions you already took (check history above)
- After clicking something that changed the page, explore the NEW screen
- Test primary features first (main buttons, CTAs), then secondary
- Fill forms with realistic test data
- If you see a game, play it. If you see a form, fill it. If you see navigation, use it.
- Return {"action": "done"} ONLY when you've tested all major interactive features
- Be thorough — explore every distinct screen/state of the app`;
}

// ---------------------------------------------------------------------------
// Detect if snapshot changed significantly
// ---------------------------------------------------------------------------

function snapshotChangedSignificantly(before: string, after: string): boolean {
  if (before === after) return false;
  const beforeLines = new Set(before.split("\n").map(l => l.trim()).filter(Boolean));
  const afterLines = new Set(after.split("\n").map(l => l.trim()).filter(Boolean));
  let newLines = 0;
  for (const line of afterLines) {
    if (!beforeLines.has(line)) newLines++;
  }
  return afterLines.size > 0 && (newLines / afterLines.size) > 0.4;
}

// ---------------------------------------------------------------------------
// Main agent loop
// ---------------------------------------------------------------------------

export async function runAgentLoop(opts: {
  page: Page;
  url: string;
  snapshot: string;
  title: string;
  llm: LLMCall;
  onProgress: ProgressCallback;
  maxSteps: number;
  spaRoutes?: string[];
  executeStep: typeof import("./tester.js").executeStep;
  validateStep: typeof import("./validator.js").validateStep;
  screenshotDir: string;
  AriaSnapshotBuilder: any;
  networkMonitor: any;
  consoleMonitor: any;
}): Promise<AgentLoopResult> {
  const {
    page, llm, onProgress, maxSteps,
    executeStep, validateStep,
    screenshotDir, AriaSnapshotBuilder,
    networkMonitor, consoleMonitor,
  } = opts;

  let snapshotText = opts.snapshot;
  const spaRoutes = opts.spaRoutes ?? [];
  const history: ActionHistoryEntry[] = [];
  const results: TestStep[] = [];
  let stepId = 1;

  // Always start with a screenshot
  const { join } = await import("node:path");
  const initialStep: TestStep = {
    id: stepId++, action: "screenshot",
    description: "Capture initial page state",
    status: "pending", priority: 4,
  };
  const initialResult = await executeStep(initialStep, page, snapshotText, llm, onProgress);
  results.push(initialResult);
  try {
    const ssPath = join(screenshotDir, `step-0-${Date.now()}.png`);
    await page.screenshot({ path: ssPath });
    initialResult.screenshot = ssPath;
  } catch {}

  let consecutiveFailures = 0;

  while (results.length < maxSteps) {
    const currentUrl = page.url();
    const currentTitle = await page.title().catch(() => opts.title);

    // Ask the agent what to do next
    const prompt = buildAgentPrompt(currentUrl, currentTitle, snapshotText, history, spaRoutes);

    let agentResponse: string;
    try {
      agentResponse = await llm([{ role: "user", content: prompt }]);
    } catch (err: unknown) {
      onProgress("warn", `Agent LLM call failed: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }

    const action = parseAgentAction(agentResponse);

    if (!action) {
      onProgress("warn", "Agent returned unparseable response, retrying...");
      // One retry with corrective prompt
      try {
        const retryResp = await llm([{
          role: "user",
          content: `Your response was not valid JSON. Return ONLY: {"action": "...", "target": "...", "assertion": "..."}\n\nFix this:\n${agentResponse.slice(0, 500)}`,
        }]);
        const retryAction = parseAgentAction(retryResp);
        if (!retryAction) {
          onProgress("warn", "Agent response still unparseable — stopping");
          break;
        }
        Object.assign(action ?? {}, retryAction);
        if (!action) break;
      } catch {
        break;
      }
    }

    // Agent says it's done testing
    if (action.action === "done") {
      onProgress("info", `Agent completed testing: ${action.reasoning ?? "all major features covered"}`);
      break;
    }

    // Log the agent's reasoning
    if (action.reasoning) {
      onProgress("info", `Agent: ${action.reasoning}`);
    }

    // Build the TestStep from the agent's decision
    const step: TestStep = {
      id: stepId++,
      action: action.action,
      description: action.target
        ? `${action.action === "click" ? "Click" : action.action === "fill" ? "Fill" : action.action === "navigate" ? "Navigate to" : action.action.charAt(0).toUpperCase() + action.action.slice(1)} "${action.target}"`
        : action.action.charAt(0).toUpperCase() + action.action.slice(1),
      target: action.target,
      value: action.value,
      assertion: action.assertion,
      status: "pending",
      priority: 2,
    };

    const beforeSnapshot = snapshotText;
    const beforeUrl = page.url();

    // Clear monitoring
    networkMonitor.failures.length = 0;
    const prevConsoleErrors = [...consoleMonitor.errors];

    // Execute the step
    step.status = "running";
    const result = await executeStep(step, page, snapshotText, llm, onProgress);
    results.push(result);

    // Wait for page to settle
    await page.waitForTimeout(500);

    // Re-snapshot
    try {
      const newBuilder = new AriaSnapshotBuilder();
      await newBuilder.buildTree(page);
      snapshotText = newBuilder.getFormattedTree();
    } catch {
      // Keep old snapshot if page is navigating
    }

    const newConsoleErrors = consoleMonitor.errors.filter((e: string) => !prevConsoleErrors.includes(e));
    const pageChanged = snapshotChangedSignificantly(beforeSnapshot, snapshotText);

    // Validate
    if (result.status === "pass" && step.assertion) {
      await validateStep(result, beforeSnapshot, snapshotText, llm, onProgress, {
        networkMonitor,
        consoleErrors: newConsoleErrors,
        beforeUrl,
        afterUrl: page.url(),
        page,
      });
    }

    // Screenshot
    try {
      const ssPath = join(screenshotDir, `step-${step.id}-${Date.now()}.png`);
      await page.screenshot({ path: ssPath });
      result.screenshot = ssPath;
    } catch {}

    // Record history for context in next iteration
    history.push({
      step: results.length,
      action: step.action,
      target: step.target,
      result: result.status as "pass" | "fail" | "skip",
      pageChanged,
      url: page.url(),
      summary: result.status === "pass"
        ? (step.assertion ? "verified" : "ok")
        : (result.error ?? "failed"),
    });

    // Track consecutive failures
    if (result.status === "fail") {
      consecutiveFailures++;
      if (consecutiveFailures >= 5) {
        onProgress("warn", "5 consecutive failures — agent stopping");
        break;
      }
    } else {
      consecutiveFailures = 0;
    }
  }

  // Construct a TestPlan from what the agent actually did
  const pageType = detectPageType(opts.url, opts.snapshot);
  const plan: TestPlan = {
    url: opts.url,
    title: opts.title,
    steps: results,
    createdAt: Date.now(),
    pageType,
    flows: [],
    estimatedDuration: results.length * 3000,
  };

  return { steps: results, plan };
}
