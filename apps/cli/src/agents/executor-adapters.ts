/**
 * Adapters that wire the real agent system (planner, tester, browser)
 * to the TestExecutor dependency injection points in @inspect/core.
 *
 * This bridges the gap between:
 *   - TestExecutor's generic interfaces (ExecutionConfig, StepPlan, etc.)
 *   - The real agent implementations (planTests, executeStep, BrowserManager)
 */

import type { AgentRouter } from "@inspect/agent";
import type { BrowserManager } from "@inspect/browser";
import type { ExecutorDependencies, ExecutionConfig, StepPlan, StepResult } from "@inspect/core";

type ToolCall = StepResult["toolCalls"][number];

/**
 * Shared state between the step executor, recovery executors, and governance.
 */
interface SharedPageState {
  page: unknown | null;
  auditTrail?: unknown;
  session?: { id: string; tenantId?: string };
}

/**
 * Map StepPlan types to agent action names.
 */
function stepTypeToAction(type: StepPlan["type"]): string {
  switch (type) {
    case "navigate":
      return "navigate";
    case "interact":
      return "click";
    case "verify":
      return "assert";
    case "extract":
      return "extract";
    case "wait":
      return "wait";
    default:
      return "assert";
  }
}

/**
 * Resolve agent name to provider string.
 */
function resolveProviderName(agent: string): string {
  switch (agent) {
    case "claude":
    case "anthropic":
      return "anthropic";
    case "gpt":
    case "openai":
      return "openai";
    case "gemini":
    case "google":
      return "gemini";
    case "deepseek":
      return "deepseek";
    case "ollama":
      return "ollama";
    default:
      return "anthropic";
  }
}

/**
 * Create an LLMCall function from a router and agent name.
 */
function createLLMCall(
  router: AgentRouter,
  agent: string,
): (messages: Array<{ role: string; content: string }>) => Promise<string> {
  const provider = router.getProvider(
    resolveProviderName(agent) as Parameters<typeof router.getProvider>[0],
  );
  return async (messages) => {
    const response = await provider.chat(
      messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
    );
    return response.content;
  };
}

/**
 * Create a plan generator that uses the real LLM planner.
 */
export function createPlanGenerator(
  router: AgentRouter,
): NonNullable<ExecutorDependencies["planGenerator"]> {
  return async (config: ExecutionConfig): Promise<StepPlan[]> => {
    const { planTests } = await import("./planner.js");
    const llmCall = createLLMCall(router, config.agent);
    const noopProgress = () => {};

    const snapshot = "Interactive page - awaiting snapshot from browser";

    const testPlan = await planTests(config.url ?? "", snapshot, "", llmCall, noopProgress);

    return testPlan.steps.map((step, i) => ({
      index: i,
      description: step.description,
      assertion: step.assertion,
      type: (step.action === "navigate"
        ? "navigate"
        : step.action === "wait"
          ? "wait"
          : step.action === "extract"
            ? "extract"
            : step.action === "assert"
              ? "verify"
              : "interact") as StepPlan["type"],
    }));
  };
}

/**
 * Create a step executor that opens a real browser and executes actions.
 * Returns both the executor and a shared state object for recovery executors.
 */
export function createStepExecutor(
  router: AgentRouter,
  browserManager: BrowserManager,
  sharedState: SharedPageState,
): NonNullable<ExecutorDependencies["stepExecutor"]> {
  return async (step: StepPlan, config: ExecutionConfig, toolCalls: ToolCall[]): Promise<void> => {
    const { AriaSnapshotBuilder } = await import("@inspect/browser");

    const deviceConfig = config.device as { viewport: { width: number; height: number } };

    // Lazy-init: launch browser and navigate on first step
    if (!sharedState.page) {
      await browserManager.launchBrowser({
        name: "chromium",
        browser: config.browser,
        headless: !config.headed,
        viewport: deviceConfig.viewport,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      sharedState.page = browserManager.newPage();

      if (config.url) {
        const navStart = Date.now();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sharedState.page as any).goto(config.url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        toolCalls.push({
          tool: "browser_navigate",
          args: { url: config.url },
          result: { url: config.url, status: 200 },
          duration: Date.now() - navStart,
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = sharedState.page as any;
    const llmCall = createLLMCall(router, config.agent);
    const noopProgress = () => {};

    // Re-snapshot before each step
    let snapshotText = "";
    try {
      const builder = new AriaSnapshotBuilder();
      await builder.buildTree(page);
      snapshotText = builder.getFormattedTree();
    } catch {
      /* keep empty snapshot */
    }

    const action = stepTypeToAction(step.type);

    const testStep = {
      id: step.index + 1,
      action,
      description: step.description,
      target: step.type === "navigate" ? config.url : undefined,
      assertion: step.assertion,
      status: "pending" as const,
      priority: 3,
    };

    const { executeStep } = await import("./tester.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await executeStep(testStep as any, page, snapshotText, llmCall, noopProgress);

    // Record tool calls from the step execution
    toolCalls.push({
      tool: `agent_${action}`,
      args: { description: step.description, target: testStep.target },
      result: { status: result.status },
      duration: result.duration ?? 0,
    });

    // Take screenshot
    try {
      const { mkdirSync, existsSync } = await import("node:fs");
      const dir = ".inspect/screenshots";
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      await page.screenshot({
        path: `${dir}/step-${step.index}-${Date.now()}.png`,
        fullPage: false,
      });
    } catch {
      /* screenshot is best-effort */
    }

    if (result.status === "fail") {
      throw new Error(result.error ?? `Step failed: ${step.description}`);
    }
  };
}

/**
 * Create a combined factory that returns both step executor and recovery executors
 * that share the same page state and governance modules.
 *
 * Governance modules are lazily initialized in the background — if the agent
 * package isn't available, execution continues without audit/autonomy tracking.
 */
export function createExecutorAdapters(
  router: AgentRouter,
  browserManager: BrowserManager,
): {
  planGenerator: NonNullable<ExecutorDependencies["planGenerator"]>;
  stepExecutor: NonNullable<ExecutorDependencies["stepExecutor"]>;
  recoveryExecutors: {
    reScan: () => Promise<boolean>;
    waitForLoad: () => Promise<boolean>;
    scrollIntoView: (selector?: string) => Promise<boolean>;
    dismissOverlay: () => Promise<boolean>;
    refreshPage: () => Promise<boolean>;
    clearState: () => Promise<boolean>;
  };
} {
  const sharedState: SharedPageState = { page: null };

  // Lazy init: governance modules (non-blocking, best-effort)
  initGovernance(sharedState);

  return {
    planGenerator: createPlanGenerator(router),
    stepExecutor: createStepExecutor(router, browserManager, sharedState),
    recoveryExecutors: createRecoveryExecutorsFromState(sharedState),
  };
}

/**
 * Initialize governance modules asynchronously. Failures are silently ignored.
 */
function initGovernance(sharedState: SharedPageState): void {
  import("@inspect/agent")
    .then(({ AuditTrail, AutonomyManager, PermissionManager }) => {
      const auditTrail = new AuditTrail(".inspect/audit");
      const autonomyManager = new AutonomyManager({ level: 2 });
      const permissionManager = new PermissionManager({
        allowedDomains: ["*"],
        allowedActions: ["*"],
      });
      sharedState.auditTrail = { auditTrail, autonomyManager, permissionManager };
    })
    .catch(() => {
      /* governance not available — graceful degradation */
    });
}

/**
 * Create real recovery executors that use the shared browser page state.
 */
function createRecoveryExecutorsFromState(sharedState: SharedPageState): {
  reScan: () => Promise<boolean>;
  waitForLoad: () => Promise<boolean>;
  scrollIntoView: (selector?: string) => Promise<boolean>;
  dismissOverlay: () => Promise<boolean>;
  refreshPage: () => Promise<boolean>;
  clearState: () => Promise<boolean>;
} {
  return {
    reScan: async () => {
      try {
        if (!sharedState.page) return false;
        const { AriaSnapshotBuilder } = await import("@inspect/browser");
        const builder = new AriaSnapshotBuilder();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await builder.buildTree(sharedState.page as any);
        return true;
      } catch {
        return false;
      }
    },

    waitForLoad: async () => {
      try {
        if (!sharedState.page) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sharedState.page as any).waitForLoadState?.("domcontentloaded", {
          timeout: 5000,
        });
        await new Promise((r) => setTimeout(r, 1000));
        return true;
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
        return true;
      }
    },

    scrollIntoView: async (selector?: string) => {
      try {
        if (!sharedState.page || !selector) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sharedState.page as any).locator(selector).scrollIntoViewIfNeeded({ timeout: 3000 });
        return true;
      } catch {
        return false;
      }
    },

    dismissOverlay: async () => {
      try {
        if (!sharedState.page) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = sharedState.page as any;
        const dismissSelectors = [
          'button:has-text("Accept")',
          'button:has-text("Got it")',
          'button:has-text("OK")',
          'button:has-text("Close")',
          '[aria-label="Close"]',
          ".cookie-banner button",
          "#cookie-consent button",
        ];
        for (const sel of dismissSelectors) {
          try {
            const btn = ctx.locator(sel).first();
            if (await btn.isVisible({ timeout: 500 })) {
              await btn.click();
              await new Promise((r) => setTimeout(r, 500));
              return true;
            }
          } catch {
            /* try next selector */
          }
        }
        return false;
      } catch {
        return false;
      }
    },

    refreshPage: async () => {
      try {
        if (!sharedState.page) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sharedState.page as any).reload?.({
          waitUntil: "domcontentloaded",
          timeout: 10000,
        });
        return true;
      } catch {
        return false;
      }
    },

    clearState: async () => {
      try {
        if (!sharedState.page) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sharedState.page as any).evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}
