// ============================================================================
// Agent Loop — Autonomous AI-driven test execution
//
// Instead of pre-planning all steps, the agent observes the current page state
// and decides the next action each iteration. This works for ANY website
// because the LLM adapts to what it sees in real-time.
//
// Loop: observe snapshot → LLM decides next action → execute → repeat
// ============================================================================

import type {} from "./playwright-types.js";
import type { Page } from "@inspect/browser";
import {
  AnnotatedScreenshot,
  DOMDiff,
  createNLAct,
  DiffElement as DOMDiffElement,
  AnnotatedElement,
} from "@inspect/browser";
import type { TestStep, TestPlan, LLMCall, ProgressCallback } from "./types.js";
import { detectPageType } from "./planner.js";
import { ActionLoopDetector } from "@inspect/agent";
import type { SyncSpeculativePlanner } from "@inspect/core";
import { ActionCache, type CacheEntry } from "./action-cache.js";

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
  const historyText =
    history.length > 0
      ? history
          .map(
            (h) =>
              `  ${h.step}. [${h.result}] ${h.action}${h.target ? ` "${h.target}"` : ""} → ${h.summary}${h.pageChanged ? " (page changed)" : ""}`,
          )
          .join("\n")
      : "  (none yet — this is the first action)";

  const routeHint =
    spaRoutes.length > 0
      ? `\nDiscovered SPA routes to explore:\n${spaRoutes
          .filter((r) => !r.includes(":") && !r.includes("["))
          .slice(0, 10)
          .map((r) => `  - ${r}`)
          .join("\n")}\n`
      : "";

  // Trim snapshot to fit in context — keep the interactive elements
  const trimmedSnapshot =
    snapshot.length > 6000 ? snapshot.slice(0, 6000) + "\n... (truncated)" : snapshot;

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
  const beforeLines = new Set(
    before
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const afterLines = new Set(
    after
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
  let newLines = 0;
  for (const line of afterLines) {
    if (!beforeLines.has(line)) newLines++;
  }
  return afterLines.size > 0 && newLines / afterLines.size > 0.4;
}

// ---------------------------------------------------------------------------
// Main agent loop
// ---------------------------------------------------------------------------

// Dashboard event emitter type
type DashboardEmitter = (event: {
  type: string;
  sessionId: string;
  timestamp: number;
  [key: string]: unknown;
}) => void;

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
  AriaSnapshotBuilder: typeof import("@inspect/browser").AriaSnapshotBuilder;
  networkMonitor: {
    failures: import("./types.js").NetworkFailure[];
    slowResponses: Array<{ url: string; duration: number }>;
    start: () => void;
    stop: () => import("./types.js").NetworkFailure[];
  };
  consoleMonitor: { errors: string[]; start: () => void; stop: () => string[] };
  specPlanner?: SyncSpeculativePlanner;
  sessionRecorder?: import("@inspect/browser").SessionRecorder;
  selfHealer?: import("@inspect/core").SelfHealer;
  hitlChecker?: () => Promise<{ pending: boolean; approved: boolean }>;
  dashboardEmitter?: DashboardEmitter;
  testId?: string;
  testName?: string;
}): Promise<AgentLoopResult> {
  const {
    page,
    llm,
    onProgress,
    maxSteps,
    executeStep,
    validateStep,
    screenshotDir,
    AriaSnapshotBuilder,
    networkMonitor,
    consoleMonitor,
    specPlanner,
  } = opts;

  let snapshotText = opts.snapshot;
  const spaRoutes = opts.spaRoutes ?? [];
  const history: ActionHistoryEntry[] = [];
  const results: TestStep[] = [];
  let stepId = 1;

  // --- Feature integrations (Browser Use / Stagehand / Shortest patterns) ---
  const loopDetector = new ActionLoopDetector({ windowSize: 10, threshold: 3, maxNudges: 2 });
  const actionCache = new ActionCache();

  // Dashboard integration
  const startTime = Date.now();
  const sessionId = opts.testId ?? `test-${startTime}`;
  const testName = opts.testName ?? `Test ${new URL(opts.url).hostname}`;
  const dashboard = opts.dashboardEmitter;

  const emitDashboardEvent = (event: { type: string; [key: string]: unknown }) => {
    if (dashboard) {
      dashboard({
        ...event,
        sessionId,
        timestamp: Date.now(),
      });
    }
  };

  // Emit test started event
  emitDashboardEvent({
    type: "test:started",
    testId: sessionId,
    testName,
    url: opts.url,
    startTime: Date.now(),
  });

  // Start session recording if provided
  if (opts.sessionRecorder) {
    try {
      await opts.sessionRecorder.startRecording(page);
    } catch (err) {
      // Recording is best-effort, log for debugging
      onProgress(
        "warn",
        `Session recording failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Always start with a screenshot
  const { join } = await import("node:path");
  const initialStep: TestStep = {
    id: stepId++,
    action: "screenshot",
    description: "Capture initial page state",
    status: "pending",
    priority: 4,
  };
  const initialResult = await executeStep(initialStep, page, snapshotText, llm, onProgress);
  results.push(initialResult);
  try {
    const ssPath = join(screenshotDir, `step-0-${Date.now()}.png`);
    await page.screenshot({ path: ssPath });
    initialResult.screenshot = ssPath;
  } catch (err) {
    onProgress(
      "warn",
      `Initial screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let consecutiveFailures = 0;

  while (results.length < maxSteps) {
    // Get page state atomically to avoid race conditions
    const [currentUrl, currentTitle] = await Promise.all([
      Promise.resolve(page.url()),
      page.title().catch(() => opts.title),
    ]);

    // --- Loop detection: check before next action ---
    const loopCheck = loopDetector.check();
    if (loopCheck.forceStop) {
      onProgress("warn", "Loop detected — agent is stuck, stopping");
      break;
    }

    // --- Speculative Planning (Skyvern pattern): try pre-computed prompt ---
    let prompt: string;
    const specPlan = specPlanner?.get(results.length, currentUrl);
    if (specPlan) {
      prompt = specPlan.prompt;
    } else {
      prompt = buildAgentPrompt(currentUrl, currentTitle, snapshotText, history, spaRoutes);
    }
    if (loopCheck.detected && loopCheck.message) {
      prompt += `\n\nWARNING: ${loopCheck.message}`;
    }

    // --- Cache lookup: skip LLM if we have a cached action for this state ---
    const cacheInstruction = `${currentUrl}|${snapshotText.slice(0, 200)}`;
    const cached = actionCache.get(cacheInstruction, currentUrl);
    let action: AgentAction | null;

    if (cached) {
      action = {
        action: cached.type,
        target: cached.target,
        value: cached.value,
        reasoning: "(cached — replaying previous action)",
      };
    } else {
      // Ask the agent what to do next
      let agentResponse: string;
      try {
        agentResponse = await llm([{ role: "user", content: prompt }]);
      } catch (err: unknown) {
        onProgress(
          "warn",
          `Agent LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        break;
      }

      action = parseAgentAction(agentResponse);

      if (!action) {
        onProgress("warn", "Agent returned unparseable response, retrying...");
        // One retry with corrective prompt
        try {
          const retryResp = await llm([
            {
              role: "user",
              content: `Your response was not valid JSON. Return ONLY: {"action": "...", "target": "...", "assertion": "..."}\n\nFix this:\n${agentResponse.slice(0, 500)}`,
            },
          ]);
          const retryAction = parseAgentAction(retryResp);
          if (!retryAction) {
            onProgress("warn", "Agent response still unparseable — stopping");
            break;
          }
          action = retryAction;
        } catch {
          break;
        }
      }
    } // end cache else

    // Agent says it's done testing
    if (action.action === "done") {
      onProgress(
        "info",
        `Agent completed testing: ${action.reasoning ?? "all major features covered"}`,
      );
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

    // Human-in-the-loop checkpoint: pause for approval before executing
    if (opts.hitlChecker) {
      const hitl = await opts.hitlChecker();
      if (hitl.pending && !hitl.approved) {
        onProgress("warn", `Step paused for human approval: ${step.description}`);
        break;
      }
    }

    // Clear monitoring
    networkMonitor.failures.length = 0;
    const prevConsoleErrors = [...consoleMonitor.errors];

    // --- Two-Step Actions (Stagehand pattern): DOMDiff for select/dropdown ---
    const isTwoStep = action.action === "select" || action.action === "hover";
    const domDiff = new DOMDiff();
    if (isTwoStep) {
      try {
        await domDiff.captureBefore(page);
      } catch (err) {
        onProgress(
          "info",
          `DOM capture before failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Emit step started event
    emitDashboardEvent({
      type: "step:started",
      stepId: `step-${step.id}`,
      stepNumber: step.id,
      totalSteps: maxSteps,
      instruction: step.description,
    });

    // Execute the step
    step.status = "running";
    const stepStartTime = Date.now();
    const result = await executeStep(step, page, snapshotText, llm, onProgress);
    results.push(result);

    // Emit step completed event
    emitDashboardEvent({
      type: "step:completed",
      stepId: `step-${step.id}`,
      success: result.status === "pass",
      duration: Date.now() - stepStartTime,
      action: { type: step.action, description: step.description },
      error: result.error,
    });

    // --- Two-Step: capture diff and let LLM pick from new options ---
    if (isTwoStep && result.status === "pass") {
      try {
        await page.waitForTimeout(300);
        const diff = await domDiff.captureAfter(page);
        if (diff.added.length > 0) {
          const optionsList = diff.added
            .filter(
              (el: DOMDiffElement) =>
                el.role === "option" ||
                el.tagName === "option" ||
                el.tagName === "li" ||
                el.tagName === "a",
            )
            .map((el: DOMDiffElement) => el.text)
            .filter(Boolean)
            .join(", ");
          if (optionsList) {
            // Inject diff context into next iteration's history
            history.push({
              step: results.length,
              action: "dom_diff",
              target: undefined,
              result: "pass",
              pageChanged: true,
              url: page.url(),
              summary: `Dropdown opened — options: ${optionsList.slice(0, 200)}`,
            });
          }
        }
      } catch {
        /* non-critical */
      }
    }

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

    const newConsoleErrors = consoleMonitor.errors.filter(
      (e: string) => !prevConsoleErrors.includes(e),
    );
    const pageChanged = snapshotChangedSignificantly(beforeSnapshot, snapshotText);

    // --- Vision+DOM Fusion (Skyvern pattern): on failure, capture annotated context ---
    if (result.status === "fail") {
      try {
        const annotator = new AnnotatedScreenshot({ maxElements: 20 });
        const annotated = await annotator.capture(page);
        // Inject vision context into next prompt via history
        const elSummary = annotated.elements
          .map(
            (el: AnnotatedElement) =>
              `[${el.id}] ${el.tagName}${el.role ? `(${el.role})` : ""} "${el.text?.slice(0, 40) ?? ""}"`,
          )
          .join("\n  ");
        if (elSummary) {
          history.push({
            step: results.length,
            action: "vision_scan",
            target: undefined,
            result: "pass",
            pageChanged: false,
            url: page.url(),
            summary: `Visual scan found ${annotated.elements.length} interactive elements:\n  ${elSummary}`,
          });
        }
      } catch {
        /* vision is non-critical fallback */
      }

      // Self-healing: attempt to find alternative element when step fails
      if (opts.selfHealer && step.target) {
        try {
          const builder = new AriaSnapshotBuilder();
          await builder.buildTree(page);
          const snapshot = builder.getFormattedTree();
          const elements: Array<{ ref: number; role: string; name?: string }> = snapshot
            .split("\n")
            .filter((line) => line.includes("role="))
            .map((line, i) => ({
              ref: i,
              role: line.match(/role="([^"]+)"/)?.[1] ?? "",
              name: line.match(/name="([^"]+)"/)?.[1],
            }))
            .filter((el) => el.role != null);
          const healed = await opts.selfHealer.heal(step.target, elements);
          if (healed.success) {
            onProgress(
              "info",
              `Self-heal: replaced selector "${step.target}" with "${healed.healedSelector ?? healed.originalSelector}"`,
            );
            step.target = healed.healedSelector ?? step.target;
          }
        } catch {
          /* self-healing is best-effort */
        }
      }

      // NL Fallback: try natural language when both action and self-healing fail
      if (result.status === "fail" && step.description) {
        try {
          onProgress("info", `NL fallback: attempting "${step.description}"`);
          const nl = createNLAct(page, {
            llm,
            snapshot: async () => {
              const builder = new AriaSnapshotBuilder();
              await builder.buildTree(page);
              return {
                text: builder.getFormattedTree(),
                url: page.url(),
                title: await page.title(),
              };
            },
          });

          const nlResult = await nl.act(step.description);
          if (nlResult.success) {
            onProgress("info", `NL fallback succeeded for "${step.description}"`);
            result.status = "pass";
            result.error = undefined;
          } else {
            onProgress("warn", `NL fallback failed: ${nlResult.error}`);
          }
        } catch (nlError) {
          onProgress("warn", `NL fallback error: ${nlError}`);
        }
      }
    }

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
    } catch {
      /* intentionally empty */
    }

    // Record history for context in next iteration
    history.push({
      step: results.length,
      action: step.action,
      target: step.target,
      result: result.status as "pass" | "fail" | "skip",
      pageChanged,
      url: page.url(),
      summary:
        result.status === "pass"
          ? step.assertion
            ? "verified"
            : "ok"
          : (result.error ?? "failed"),
    });

    // --- Loop detection: record action ---
    loopDetector.record(step.action, step.target ?? "", page.url());

    // --- Speculative Planning: pre-build next step's prompt while we can ---
    if (specPlanner && result.status === "pass") {
      const nextUrl = page.url();
      const nextTitle = await page.title().catch(() => opts.title);
      const nextPrompt = buildAgentPrompt(nextUrl, nextTitle, snapshotText, history, spaRoutes);
      specPlanner.precompute(results.length + 1, snapshotText, nextPrompt, nextUrl);
    }

    // --- Cache: store successful actions for future replay ---
    if (result.status === "pass" && !cached) {
      actionCache.set(cacheInstruction, currentUrl, {
        type: step.action,
        target: step.target,
        value: step.value,
        description: step.description,
      } as CacheEntry);
    }

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

  // Emit test completed event
  const passedSteps = results.filter((r) => r.status === "pass").length;
  const failedSteps = results.filter((r) => r.status === "fail").length;

  emitDashboardEvent({
    type: "test:completed",
    testId: sessionId,
    success: failedSteps === 0,
    duration: Date.now() - startTime,
    stepCount: results.length,
    passed: passedSteps,
    failed: failedSteps,
  });

  // Emit cache stats
  const cacheStats = actionCache.getStats();
  emitDashboardEvent({
    type: "stats:update",
    stats: {
      cacheSize: cacheStats.size,
      totalTests: 1,
      passedTests: failedSteps === 0 ? 1 : 0,
      failedTests: failedSteps > 0 ? 1 : 0,
      activeTests: 0,
      lastUpdated: Date.now(),
    },
  });

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
