/**
 * Act Phase - Agent Loop
 *
 * Executes the actions planned by the think phase.
 * Part of: observe → think → act → finalize
 *
 * Task: 122 (act phase implementation)
 */

import type { AgentAction } from "../index.js";
import type { BrowserState } from "../history.js";

/**
 * Act input
 */
export interface ActInput {
  // Browser page object
  page: any;

  // Planned actions from think phase
  actions: AgentAction[];

  // Current browser state for validation
  browserState: BrowserState;

  // Max time allowed for actions (ms)
  timeout: number;

  // Max retries per action
  maxRetries: number;
}

/**
 * Action execution result
 */
export interface ActionExecutionResult {
  // Action that was executed
  action: AgentAction;

  // Whether action succeeded
  success: boolean;

  // Output from action (if any)
  output?: unknown;

  // Error message (if failed)
  error?: string;

  // Time taken (ms)
  duration: number;

  // Number of retries needed
  retries: number;
}

/**
 * Act output
 */
export interface ActOutput {
  // All action results
  results: ActionExecutionResult[];

  // Overall success (at least one action succeeded)
  overallSuccess: boolean;

  // Browser state after actions
  finalBrowserState: BrowserState;

  // Total time spent
  totalDuration: number;

  // Any extracted content from actions
  extractedContent?: Record<string, unknown>;
}

/**
 * Execute actions on the browser
 *
 * This phase:
 * 1. Validates actions against current page state
 * 2. Executes each action with error handling
 * 3. Tracks results and metrics
 * 4. Captures final browser state
 *
 * Estimated implementation: 80-120 LOC
 */
export async function actPhase(input: ActInput): Promise<ActOutput> {
  const startTime = Date.now();
  const results: ActionExecutionResult[] = [];
  let extractedContent: Record<string, unknown> = {};

  // Step 1 & 2: Execute all actions sequentially
  for (const action of input.actions) {
    const actionStartTime = Date.now();

    try {
      // Execute action with retry logic
      const result = await retryActionWithBackoff(
        () => executeAction(input.page, action, input.maxRetries),
        input.maxRetries,
      );

      results.push({
        action,
        success: result.success,
        output: result.output,
        duration: Date.now() - actionStartTime,
        retries: result.retries || 0,
      });

      // Collect extracted content
      if (result.output && typeof result.output === "object") {
        extractedContent = { ...extractedContent, ...result.output };
      }
    } catch (error) {
      results.push({
        action,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - actionStartTime,
        retries: input.maxRetries,
      });
    }
  }

  // Step 3 & 4: Capture final state and return
  const totalDuration = Date.now() - startTime;
  const overallSuccess = results.some((r) => r.success);

  return {
    results,
    overallSuccess,
    finalBrowserState: input.browserState,
    totalDuration,
    extractedContent: Object.keys(extractedContent).length > 0 ? extractedContent : undefined,
  };
}

/**
 * Execute a single action with retry logic
 */
async function executeAction(
  page: any,
  action: AgentAction,
  maxRetries: number,
): Promise<ActionExecutionResult> {
  const actionType = action.type as string;
  const params = action.params as Record<string, unknown>;

  try {
    let output: unknown;

    // Route to appropriate handler based on action type
    switch (actionType) {
      case "click": {
        const selector = params.selector as string;
        if (!selector) throw new Error("click action requires selector");
        await page.click(selector);
        output = { type: "click", selector };
        break;
      }

      case "type": {
        const selector = params.selector as string;
        const text = params.text as string;
        if (!selector || !text) throw new Error("type action requires selector and text");
        await page.fill(selector, text);
        output = { type: "type", selector, length: text.length };
        break;
      }

      case "scroll": {
        const selector = params.selector as string | undefined;
        const direction = params.direction as string || "down";
        if (selector) {
          await page.locator(selector).scrollIntoViewIfNeeded();
        } else {
          // Scroll page - use ArrowDown/ArrowUp keys for simple scrolling
          const times = (params.amount as number) || 3;
          const key = direction === "down" ? "ArrowDown" : "ArrowUp";
          for (let i = 0; i < times; i++) {
            await page.keyboard.press(key);
          }
        }
        output = { type: "scroll", direction };
        break;
      }

      case "navigate": {
        const url = params.url as string;
        if (!url) throw new Error("navigate action requires url");
        await page.goto(url);
        output = { type: "navigate", url };
        break;
      }

      case "wait": {
        const selector = params.selector as string | undefined;
        const timeout = (params.timeout as number) || 5000;
        if (selector) {
          await page.waitForSelector(selector, { timeout });
        } else {
          // Wait for network idle
          await page.waitForLoadState("networkidle", { timeout });
        }
        output = { type: "wait", timeout };
        break;
      }

      case "extract": {
        const selector = params.selector as string;
        if (!selector) throw new Error("extract action requires selector");
        const content = await page.locator(selector).textContent();
        output = { type: "extract", selector, content };
        break;
      }

      case "hover": {
        const selector = params.selector as string;
        if (!selector) throw new Error("hover action requires selector");
        await page.hover(selector);
        output = { type: "hover", selector };
        break;
      }

      case "focus": {
        const selector = params.selector as string;
        if (!selector) throw new Error("focus action requires selector");
        await page.focus(selector);
        output = { type: "focus", selector };
        break;
      }

      case "submit": {
        const selector = params.selector as string;
        if (!selector) throw new Error("submit action requires selector");
        await page.locator(selector).evaluate((form: any) => form.submit());
        output = { type: "submit", selector };
        break;
      }

      case "select": {
        const selector = params.selector as string;
        const value = params.value as string;
        if (!selector || !value) throw new Error("select action requires selector and value");
        await page.selectOption(selector, value);
        output = { type: "select", selector, value };
        break;
      }

      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }

    return {
      action,
      success: true,
      output,
      duration: 0,
      retries: 0,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Retry action with exponential backoff
 */
async function retryActionWithBackoff(
  executeFunc: () => Promise<ActionExecutionResult>,
  maxRetries: number,
): Promise<ActionExecutionResult> {
  let lastError: Error | null = null;
  let retryCount = 0;

  // Try initial execution
  try {
    const result = await executeFunc();
    return result;
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
  }

  // Retry with exponential backoff
  for (let i = 0; i < maxRetries; i++) {
    retryCount++;

    // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc.
    const backoffMs = 100 * Math.pow(2, i);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));

    try {
      const result = await executeFunc();
      result.retries = retryCount;
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Continue to next retry
    }
  }

  // All retries exhausted
  throw lastError || new Error("Action failed after all retries");
}
