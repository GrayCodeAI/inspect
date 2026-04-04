/**
 * Act Phase - Effect-TS Implementation
 *
 * Executes the actions planned by the think phase using real browser interactions.
 * Part of: observe → think → act → finalize
 */

import { Effect, Schema } from "effect";
import type { AgentAction } from "../index.js";
import { BrowserManagerService } from "@inspect/browser";

export class ActInput extends Schema.Class<ActInput>("ActInput")({
  actions: Schema.Array(Schema.Unknown),
  browserState: Schema.Unknown,
  timeout: Schema.Number,
  maxRetries: Schema.Number,
}) {}

export class ActionExecutionResult extends Schema.Class<ActionExecutionResult>(
  "ActionExecutionResult",
)({
  action: Schema.Unknown,
  success: Schema.Boolean,
  output: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.String),
  duration: Schema.Number,
  retries: Schema.Number,
}) {}

export class ActOutput extends Schema.Class<ActOutput>("ActOutput")({
  results: Schema.Array(ActionExecutionResult),
  overallSuccess: Schema.Boolean,
  finalBrowserState: Schema.Unknown,
  totalDuration: Schema.Number,
  extractedContent: Schema.optional(Schema.Unknown),
}) {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBrowserService(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return BrowserManagerService as any;
}

export const actPhase = Effect.fn("ActPhase.execute")(function* (input: ActInput) {
  yield* Effect.annotateCurrentSpan({ actionCount: input.actions.length });

  const browser = yield* getBrowserService();
  const startTime = Date.now();
  const results: ActionExecutionResult[] = [];
  let extractedContent: Record<string, unknown> = {};
  let currentBrowserState = input.browserState;

  for (const action of input.actions) {
    const _actionStartTime = Date.now();

    const actionResult = yield* executeSingleAction(action as AgentAction, browser);

    results.push(actionResult);

    // Update browser state if action succeeded and returned state
    if (actionResult.success && actionResult.output) {
      const output = actionResult.output as Record<string, unknown>;
      if (output.url || output.title) {
        currentBrowserState = {
          ...(currentBrowserState as Record<string, unknown>),
          ...output,
          timestamp: Date.now(),
        };
      }
      if (output.extracted) {
        extractedContent = {
          ...extractedContent,
          ...(output.extracted as Record<string, unknown>),
        };
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  const overallSuccess = results.some((r) => r.success);

  return new ActOutput({
    results,
    overallSuccess,
    finalBrowserState: currentBrowserState,
    totalDuration,
    extractedContent: Object.keys(extractedContent).length > 0 ? extractedContent : undefined,
  });
});

const executeSingleAction = Effect.fn("ActPhase.executeSingleAction")(function* (
  action: AgentAction,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser: any,
) {
  const actionType = action.type as string;
  const params = action.params as Record<string, unknown>;
  const startTime = Date.now();

  switch (actionType) {
    case "click": {
      const selector = params.selector as string;
      if (!selector) {
        return yield* new ActionValidationError({
          actionType,
          reason: "Missing selector",
        }).asEffect();
      }
      const session = yield* browser.launch({ headless: true });
      yield* session.click(selector);
      const url = yield* session.url;
      const title = yield* session.title;
      return new ActionExecutionResult({
        action,
        success: true,
        output: { type: "click", selector, url, title },
        duration: Date.now() - startTime,
        retries: 0,
      });
    }

    case "type": {
      const selector = params.selector as string;
      const text = params.text as string;
      if (!selector || !text) {
        return yield* new ActionValidationError({
          actionType,
          reason: "Missing selector or text",
        }).asEffect();
      }
      const session = yield* browser.launch({ headless: true });
      yield* session.type(selector, text);
      return new ActionExecutionResult({
        action,
        success: true,
        output: { type: "type", selector, length: text.length },
        duration: Date.now() - startTime,
        retries: 0,
      });
    }

    case "navigate": {
      const url = params.url as string;
      if (!url) {
        return yield* new ActionValidationError({
          actionType,
          reason: "Missing url",
        }).asEffect();
      }
      const session = yield* browser.launch({ headless: true });
      yield* session.navigate(url);
      const finalUrl = yield* session.url;
      const title = yield* session.title;
      return new ActionExecutionResult({
        action,
        success: true,
        output: { type: "navigate", url: finalUrl, title },
        duration: Date.now() - startTime,
        retries: 0,
      });
    }

    case "wait": {
      const timeout = (params.timeout as number) ?? 5000;
      yield* Effect.sleep(timeout);
      return new ActionExecutionResult({
        action,
        success: true,
        output: { type: "wait", timeout },
        duration: Date.now() - startTime,
        retries: 0,
      });
    }

    case "extract": {
      const selector = params.selector as string;
      if (!selector) {
        return yield* new ActionValidationError({
          actionType,
          reason: "Missing selector",
        }).asEffect();
      }
      const session = yield* browser.launch({ headless: true });
      const text = yield* session.getText(selector);
      return new ActionExecutionResult({
        action,
        success: true,
        output: { type: "extract", selector, content: text, extracted: { [selector]: text } },
        duration: Date.now() - startTime,
        retries: 0,
      });
    }

    case "evaluate": {
      const script = params.script as string;
      if (!script) {
        return yield* new ActionValidationError({
          actionType,
          reason: "Missing script",
        }).asEffect();
      }
      const session = yield* browser.launch({ headless: true });
      const result = yield* session.evaluate(script);
      return new ActionExecutionResult({
        action,
        success: true,
        output: { type: "evaluate", script, result },
        duration: Date.now() - startTime,
        retries: 0,
      });
    }

    case "hover": {
      const selector = params.selector as string;
      if (!selector) {
        return yield* new ActionValidationError({
          actionType,
          reason: "Missing selector",
        }).asEffect();
      }
      return new ActionExecutionResult({
        action,
        success: true,
        output: { type: "hover", selector },
        duration: Date.now() - startTime,
        retries: 0,
      });
    }

    case "focus": {
      const selector = params.selector as string;
      if (!selector) {
        return yield* new ActionValidationError({
          actionType,
          reason: "Missing selector",
        }).asEffect();
      }
      const session = yield* browser.launch({ headless: true });
      yield* session.evaluate(`document.querySelector('${selector}')?.focus()`);
      return new ActionExecutionResult({
        action,
        success: true,
        output: { type: "focus", selector },
        duration: Date.now() - startTime,
        retries: 0,
      });
    }

    case "select": {
      const selector = params.selector as string;
      const value = params.value as string;
      if (!selector || !value) {
        return yield* new ActionValidationError({
          actionType,
          reason: "Missing selector or value",
        }).asEffect();
      }
      const session = yield* browser.launch({ headless: true });
      yield* session.evaluate(`
        const el = document.querySelector('${selector}');
        if (el) el.value = '${value}';
      `);
      return new ActionExecutionResult({
        action,
        success: true,
        output: { type: "select", selector, value },
        duration: Date.now() - startTime,
        retries: 0,
      });
    }

    case "scroll": {
      const direction = (params.direction as string) ?? "down";
      const session = yield* browser.launch({ headless: true });
      yield* session.evaluate(`
        window.scrollBy(0, ${direction === "down" ? 500 : -500});
      `);
      return new ActionExecutionResult({
        action,
        success: true,
        output: { type: "scroll", direction },
        duration: Date.now() - startTime,
        retries: 0,
      });
    }

    case "submit": {
      const selector = params.selector as string;
      if (!selector) {
        return yield* new ActionValidationError({
          actionType,
          reason: "Missing selector",
        }).asEffect();
      }
      const session = yield* browser.launch({ headless: true });
      yield* session.evaluate(`
        const form = document.querySelector('${selector}');
        if (form) form.submit();
      `);
      return new ActionExecutionResult({
        action,
        success: true,
        output: { type: "submit", selector },
        duration: Date.now() - startTime,
        retries: 0,
      });
    }

    case "screenshot": {
      const path = params.path as string | undefined;
      const session = yield* browser.launch({ headless: true });
      const screenshotPath = yield* session.screenshot(path);
      return new ActionExecutionResult({
        action,
        success: true,
        output: { type: "screenshot", path: screenshotPath },
        duration: Date.now() - startTime,
        retries: 0,
      });
    }

    case "getConsoleLogs": {
      const session = yield* browser.launch({ headless: true });
      const logs = yield* session.consoleLogs;
      return new ActionExecutionResult({
        action,
        success: true,
        output: { type: "getConsoleLogs", logs },
        duration: Date.now() - startTime,
        retries: 0,
      });
    }

    default: {
      const errorMsg = `Unknown action type: ${actionType}`;
      return new ActionExecutionResult({
        action,
        success: false,
        error: errorMsg,
        duration: Date.now() - startTime,
        retries: 0,
      });
    }
  }
});

export class ActionValidationError extends Schema.ErrorClass<ActionValidationError>(
  "ActionValidationError",
)({
  _tag: Schema.tag("ActionValidationError"),
  actionType: Schema.String,
  reason: Schema.String,
}) {
  message = `Action ${this.actionType} failed: ${this.reason}`;
}
