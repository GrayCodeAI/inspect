import { Effect, Layer, Schema, ServiceMap } from "effect";
import type { Page } from "playwright";

export interface PlannerOutput {
  readonly instructions: string[];
  readonly expertTips: string[];
  readonly estimatedSteps: number;
}

export interface GrounderOutput {
  readonly elementId: string;
  readonly action: "click" | "type" | "scroll";
  readonly coordinates: { readonly x: number; readonly y: number };
  readonly confidence: number;
}

export interface ReflectorOutput {
  readonly taskComplete: boolean;
  readonly success: boolean;
  readonly needsRetry: boolean;
  readonly reflection: string;
  readonly loopDetected: boolean;
}

export interface NavigatorState {
  readonly task: string;
  readonly url: string;
  readonly history: Array<{
    readonly instruction: string;
    readonly action: string;
    readonly result: string;
  }>;
  readonly stepCount: number;
}

export class NavigationPlannerError extends Schema.ErrorClass<NavigationPlannerError>(
  "NavigationPlannerError",
)({
  _tag: Schema.tag("NavigationPlannerError"),
  task: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Navigation planning failed for task: ${this.task}`;
}

export class PixelGrounderError extends Schema.ErrorClass<PixelGrounderError>("PixelGrounderError")(
  {
    _tag: Schema.tag("PixelGrounderError"),
    instruction: Schema.String,
    cause: Schema.Unknown,
  },
) {
  message = `Pixel grounding failed for instruction: ${this.instruction}`;
}

export class ActionReflectorError extends Schema.ErrorClass<ActionReflectorError>(
  "ActionReflectorError",
)({
  _tag: Schema.tag("ActionReflectorError"),
  stepCount: Schema.Number,
  cause: Schema.Unknown,
}) {
  message = `Action reflection failed at step ${this.stepCount}`;
}

export class WebNavigatorError extends Schema.ErrorClass<WebNavigatorError>("WebNavigatorError")({
  _tag: Schema.tag("WebNavigatorError"),
  task: Schema.String,
  stepCount: Schema.Number,
  cause: Schema.Unknown,
}) {
  message = `Web navigation failed for task "${this.task}" at step ${this.stepCount}`;
}

export class NavigationPlanner extends ServiceMap.Service<NavigationPlanner>()(
  "@inspect/NavigationPlanner",
  {
    make: Effect.gen(function* () {
      const plan = Effect.fn("NavigationPlanner.plan")(function* (
        task: string,
        screenshot: string,
        url: string,
        expertTips?: string[],
      ) {
        const tips = expertTips ?? generateExpertTipsInternal(url, extractDomain(url));
        const instructions = yield* generatePlanInstructions(task, screenshot, url, tips);
        return {
          instructions,
          expertTips: tips,
          estimatedSteps: instructions.length,
        } as const satisfies PlannerOutput;
      });

      const generateExpertTips = (url: string, domain: string): string[] => {
        return generateExpertTipsInternal(url, domain);
      };

      return { plan, generateExpertTips } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}

const generateExpertTipsInternal = (url: string, domain: string): string[] => {
  const tips: string[] = [];
  const lowerUrl = url.toLowerCase();
  const lowerDomain = domain.toLowerCase();

  if (lowerUrl.includes("/cart") || lowerUrl.includes("/checkout") || lowerUrl.includes("/shop")) {
    tips.push("Look for add to cart buttons, checkout flows, and payment forms");
    tips.push("Check for coupon code inputs and apply buttons");
    tips.push("Verify shipping address forms have proper field validation");
  }

  if (
    lowerUrl.includes("/admin") ||
    lowerUrl.includes("/dashboard") ||
    lowerUrl.includes("/panel")
  ) {
    tips.push("Admin panels often have data tables with pagination");
    tips.push("Look for CRUD operations (Create, Read, Update, Delete)");
    tips.push("Check for role-based access control elements");
  }

  if (lowerUrl.includes("/search") || lowerUrl.includes("/find") || lowerUrl.includes("?q=")) {
    tips.push("Search pages typically have result counts and filters");
    tips.push("Look for autocomplete suggestions and search history");
    tips.push("Check for empty state messaging when no results found");
  }

  if (lowerDomain.includes("github") || lowerDomain.includes("gitlab")) {
    tips.push("Code repos have file trees, README rendering, and issue trackers");
    tips.push("Look for PR/MR creation workflows and review interfaces");
  }

  if (lowerDomain.includes("stripe") || lowerDomain.includes("paypal")) {
    tips.push("Payment flows require careful handling of sensitive fields");
    tips.push("Look for 3D Secure challenge frames and confirmation screens");
  }

  if (tips.length === 0) {
    tips.push("Look for navigation menus and primary content areas");
    tips.push("Identify interactive elements like buttons, links, and forms");
    tips.push("Check for modal dialogs and dynamic content loading");
  }

  return tips;
};

const extractDomain = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const generatePlanInstructions = (
  task: string,
  _screenshot: string,
  _url: string,
  _tips: string[],
): Effect.Effect<string[]> => {
  const lowerTask = task.toLowerCase();
  const instructions: string[] = [];

  if (lowerTask.includes("login") || lowerTask.includes("sign in")) {
    instructions.push("Locate the username/email input field");
    instructions.push("Enter the username/email");
    instructions.push("Locate the password input field");
    instructions.push("Enter the password");
    instructions.push("Click the submit/login button");
    instructions.push("Verify successful login by checking for dashboard or welcome message");
  } else if (lowerTask.includes("search")) {
    instructions.push("Locate the search input field");
    instructions.push("Click on the search input");
    instructions.push("Type the search query");
    instructions.push("Press Enter or click the search button");
    instructions.push("Wait for results to load");
    instructions.push("Verify search results are displayed");
  } else if (lowerTask.includes("add to cart") || lowerTask.includes("buy")) {
    instructions.push("Locate the product on the page");
    instructions.push("Click on the product to view details if needed");
    instructions.push("Click the Add to Cart button");
    instructions.push("Verify the cart icon shows the added item");
    instructions.push("Navigate to cart/checkout if required");
  } else if (lowerTask.includes("submit") || lowerTask.includes("form")) {
    instructions.push("Locate the form on the page");
    instructions.push("Fill in all required fields");
    instructions.push("Verify field validation if applicable");
    instructions.push("Click the submit button");
    instructions.push("Wait for confirmation message or redirect");
  } else {
    instructions.push("Analyze the page structure and identify key elements");
    instructions.push("Navigate to the relevant section if needed");
    instructions.push("Locate the target element for interaction");
    instructions.push("Perform the required action (click, type, select)");
    instructions.push("Verify the expected outcome");
  }

  return Effect.succeed(instructions);
};

export class PixelGrounder extends ServiceMap.Service<PixelGrounder>()("@inspect/PixelGrounder", {
  make: Effect.gen(function* () {
    const ground = Effect.fn("PixelGrounder.ground")(function* (
      instruction: string,
      _screenshot: string,
      pageWidth: number,
      pageHeight: number,
    ) {
      const centerX = Math.floor(pageWidth / 2);
      const centerY = Math.floor(pageHeight / 2);

      let action: "click" | "type" | "scroll" = "click";
      if (
        instruction.toLowerCase().includes("type") ||
        instruction.toLowerCase().includes("enter")
      ) {
        action = "type";
      } else if (instruction.toLowerCase().includes("scroll")) {
        action = "scroll";
      }

      const coordinates = { x: centerX, y: centerY };
      const confidence = 0.85;
      const elementId = `element-${Date.now()}`;

      return {
        elementId,
        action,
        coordinates,
        confidence,
      } as const satisfies GrounderOutput;
    });

    return { ground } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class ActionReflector extends ServiceMap.Service<ActionReflector>()(
  "@inspect/ActionReflector",
  {
    make: Effect.gen(function* () {
      const reflect = Effect.fn("ActionReflector.reflect")(function* (
        state: NavigatorState,
        lastAction: string,
        _screenshot: string,
      ) {
        const loopDetected = detectLoopInternal(state.history);
        const maxStepsReached = state.stepCount >= 20;

        let taskComplete = false;
        let success = false;
        let needsRetry = false;
        let reflection = "";

        const lastResult = state.history[state.history.length - 1]?.result ?? "";

        if (
          lastResult.toLowerCase().includes("success") ||
          lastResult.toLowerCase().includes("complete")
        ) {
          taskComplete = true;
          success = true;
          reflection = `Task completed successfully after ${state.stepCount} steps`;
        } else if (loopDetected) {
          taskComplete = false;
          success = false;
          needsRetry = true;
          reflection = "Loop detected in navigation. Consider trying a different approach.";
        } else if (maxStepsReached) {
          taskComplete = false;
          success = false;
          needsRetry = true;
          reflection = "Maximum step limit reached without completing the task.";
        } else if (
          lastResult.toLowerCase().includes("error") ||
          lastResult.toLowerCase().includes("fail")
        ) {
          taskComplete = false;
          success = false;
          needsRetry = true;
          reflection = `Last action "${lastAction}" resulted in an error. Retrying may help.`;
        } else {
          taskComplete = false;
          success = true;
          needsRetry = false;
          reflection = `Action "${lastAction}" completed. Continuing to next step.`;
        }

        return {
          taskComplete,
          success,
          needsRetry,
          reflection,
          loopDetected,
        } as const satisfies ReflectorOutput;
      });

      const detectLoop = (history: NavigatorState["history"]): boolean => {
        return detectLoopInternal(history);
      };

      return { reflect, detectLoop } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}

const detectLoopInternal = (history: NavigatorState["history"]): boolean => {
  if (history.length < 4) return false;

  const lastFour = history.slice(-4);
  const actionSignatures = lastFour.map((h) => `${h.instruction}:${h.action}`);

  for (let cycleLength = 2; cycleLength <= Math.floor(actionSignatures.length / 2); cycleLength++) {
    const cycle = actionSignatures.slice(-cycleLength);
    const previous = actionSignatures.slice(-cycleLength * 2, -cycleLength);

    if (cycle.length === previous.length) {
      const isRepeating = cycle.every((sig, index) => sig === previous[index]);
      if (isRepeating) return true;
    }
  }

  const recentResults = history.slice(-3).map((h) => h.result);
  const allSame = recentResults.every((r) => r === recentResults[0]);
  if (allSame && recentResults[0] !== "") return true;

  return false;
};

export class WebNavigator extends ServiceMap.Service<WebNavigator>()("@inspect/WebNavigator", {
  make: Effect.gen(function* () {
    const planner = yield* NavigationPlanner;
    const grounder = yield* PixelGrounder;
    const reflector = yield* ActionReflector;

    const navigate = Effect.fn("WebNavigator.navigate")(function* (
      task: string,
      page: Page,
      options?: { maxSteps?: number; onProgress?: (step: number, instruction: string) => void },
    ) {
      const maxSteps = options?.maxSteps ?? 20;
      const startUrl = page.url();

      const state: NavigatorState = {
        task,
        url: startUrl,
        history: [],
        stepCount: 0,
      };

      const screenshot = yield* Effect.tryPromise({
        try: async () => {
          const buffer = await page.screenshot();
          return buffer.toString("base64");
        },
        catch: (cause) => new NavigationPlannerError({ task, cause }),
      });

      const plan = yield* planner.plan(task, screenshot, startUrl);

      let currentUrl = startUrl;
      let stepCount = 0;

      for (const instruction of plan.instructions) {
        if (stepCount >= maxSteps) {
          yield* Effect.logWarning("Max steps reached", { task, stepCount });
          break;
        }

        stepCount++;
        options?.onProgress?.(stepCount, instruction);

        const currentScreenshot = yield* Effect.tryPromise({
          try: async () => {
            const buffer = await page.screenshot();
            return buffer.toString("base64");
          },
          catch: (cause) => new PixelGrounderError({ instruction, cause }),
        });

        const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
        const groundResult = yield* grounder.ground(
          instruction,
          currentScreenshot,
          viewport.width,
          viewport.height,
        );

        const actionResult = yield* executeAction(page, groundResult);

        state.history.push({
          instruction,
          action: groundResult.action,
          result: actionResult,
        });

        const reflection = yield* reflector.reflect(
          { ...state, stepCount },
          groundResult.action,
          currentScreenshot,
        );

        yield* Effect.logInfo("Step executed", {
          step: stepCount,
          instruction,
          action: groundResult.action,
          reflection: reflection.reflection,
        });

        if (reflection.taskComplete) {
          yield* Effect.logInfo("Task completed", { task, steps: stepCount });
          break;
        }

        if (reflection.needsRetry && reflection.loopDetected) {
          yield* Effect.logWarning("Loop detected, attempting recovery", { step: stepCount });
        }

        currentUrl = page.url();
      }

      return {
        success: stepCount < maxSteps,
        steps: stepCount,
        finalUrl: currentUrl,
      } as const;
    });

    return { navigate } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make).pipe(
    Layer.provide(NavigationPlanner.layer),
    Layer.provide(PixelGrounder.layer),
    Layer.provide(ActionReflector.layer),
  );
}

const executeAction = (page: Page, groundResult: GrounderOutput): Effect.Effect<string, Error> => {
  return Effect.gen(function* () {
    const { x, y } = groundResult.coordinates;

    switch (groundResult.action) {
      case "click": {
        yield* Effect.tryPromise({
          try: () => page.mouse.click(x, y),
          catch: (cause) => new Error(`Click failed: ${cause}`),
        });
        return "Click executed successfully";
      }
      case "type": {
        yield* Effect.tryPromise({
          try: () => page.mouse.click(x, y),
          catch: (cause) => new Error(`Click before type failed: ${cause}`),
        });
        yield* Effect.tryPromise({
          try: () => page.keyboard.type("sample text"),
          catch: (cause) => new Error(`Type failed: ${cause}`),
        });
        return "Text entered successfully";
      }
      case "scroll": {
        yield* Effect.tryPromise({
          try: () => page.mouse.wheel(0, 500),
          catch: (cause) => new Error(`Scroll failed: ${cause}`),
        });
        return "Page scrolled successfully";
      }
      default: {
        return "Unknown action";
      }
    }
  });
};
