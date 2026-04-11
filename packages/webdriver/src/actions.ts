import { Data, Effect, Schema } from "effect";
import type { WebDriverClient } from "./webdriver-client.js";

// W3C WebDriver locator strategies
export const LOCATOR_STRATEGIES = {
  CSS_SELECTOR: "css selector",
  XPATH: "xpath",
  ID: "id",
  NAME: "name",
  TAG_NAME: "tag name",
  CLASS_NAME: "class name",
  LINK_TEXT: "link text",
  PARTIAL_LINK_TEXT: "partial link text",
  ACCESSIBILITY_ID: "accessibility id",
  IMAGE: "-image",
  CUSTOM: "-custom",
} as const;

export type LocatorStrategy = (typeof LOCATOR_STRATEGIES)[keyof typeof LOCATOR_STRATEGIES];

// Key input types
export interface KeyInput {
  type: "keyDown" | "keyUp" | "pause";
  value?: string;
  duration?: number;
}

// Pointer input types
export interface PointerInput {
  type: "pointerDown" | "pointerUp" | "pointerMove" | "pointerCancel" | "pause";
  button?: number;
  x?: number;
  y?: number;
  duration?: number;
  origin?: "viewport" | "pointer" | { elementId: string };
}

export class Actions {
  constructor(private readonly client: WebDriverClient) {}

  click(
    sessionId: string,
    elementId: string,
  ): Effect.Effect<void, import("./errors.js").WebDriverError> {
    return this.client.elementClick(sessionId, elementId).pipe(
      Effect.withSpan("Actions.click"),
    );
  }

  sendKeys(
    sessionId: string,
    elementId: string,
    text: string,
  ): Effect.Effect<void, import("./errors.js").WebDriverError> {
    return this.client.elementSendKeys(sessionId, elementId, text).pipe(
      Effect.withSpan("Actions.sendKeys"),
    );
  }

  moveTo(
    sessionId: string,
    options: {
      elementId?: string;
      x?: number;
      y?: number;
      duration?: number;
      origin?: "viewport" | "pointer";
    },
  ): Effect.Effect<void, import("./errors.js").WebDriverError> {
    const actions = {
      actions: [
        {
          type: "pointer" as const,
          id: "mouse",
          parameters: { pointerType: "mouse" as const },
          actions: [
            {
              type: "pointerMove" as const,
              duration: options.duration ?? 100,
              x: options.x ?? 0,
              y: options.y ?? 0,
              origin: options.elementId
                ? { "element-6066-11e4-a52e-4f735466cecf": options.elementId }
                : options.origin ?? "viewport",
            },
          ],
        },
      ],
    };

    return this.client
      .executeScript(sessionId, "", [actions])
      .pipe(Effect.flatMap(() => this.client.elementClick(sessionId, options.elementId ?? "")))
      .pipe(
        Effect.catchTags({
          WebDriverError: () => Effect.void,
        }),
        Effect.withSpan("Actions.moveTo"),
      );
  }

  dragAndDrop(
    sessionId: string,
    sourceElementId: string,
    targetElementId: string,
  ): Effect.Effect<void, import("./errors.js").WebDriverError> {
    const actions = {
      actions: [
        {
          type: "pointer" as const,
          id: "drag",
          parameters: { pointerType: "mouse" as const },
          actions: [
            { type: "pointerMove" as const, duration: 100, x: 0, y: 0, origin: { "element-6066-11e4-a52e-4f735466cecf": sourceElementId } },
            { type: "pointerDown" as const, button: 0 },
            { type: "pointerMove" as const, duration: 200, x: 0, y: 0, origin: { "element-6066-11e4-a52e-4f735466cecf": targetElementId } },
            { type: "pointerUp" as const, button: 0 },
          ],
        },
      ],
    };

    return this.client.executeScript(sessionId, "", [actions]).pipe(
      Effect.catchTags({
        WebDriverError: () => Effect.void,
      }),
      Effect.withSpan("Actions.dragAndDrop"),
    );
  }

  clearElement(
    sessionId: string,
    elementId: string,
  ): Effect.Effect<void, import("./errors.js").WebDriverError> {
    return this.client.executeScript(sessionId, "arguments[0].value = '';", [
      { "element-6066-11e4-a52e-4f735466cecf": elementId },
    ]).pipe(Effect.withSpan("Actions.clearElement"));
  }

  selectOption(
    sessionId: string,
    selectElementId: string,
    value: string,
  ): Effect.Effect<void, import("./errors.js").WebDriverError> {
    return this.client
      .executeScript(
        sessionId,
        `
          const select = arguments[0];
          const value = arguments[1];
          for (const option of select.options) {
            option.selected = option.value === value || option.text === value;
          }
          select.dispatchEvent(new Event('change'));
        `,
        [{ "element-6066-11e4-a52e-4f735466cecf": selectElementId }, value],
      )
      .pipe(Effect.withSpan("Actions.selectOption"));
  }

  getText(
    sessionId: string,
    elementId: string,
  ): Effect.Effect<string, import("./errors.js").WebDriverError> {
    return this.client.getElementText(sessionId, elementId).pipe(
      Effect.withSpan("Actions.getText"),
    );
  }

  getAttribute(
    sessionId: string,
    elementId: string,
    attributeName: string,
  ): Effect.Effect<string | null, import("./errors.js").WebDriverError> {
    return this.client
      .executeScript(
        sessionId,
        "return arguments[0].getAttribute(arguments[1]);",
        [
          { "element-6066-11e4-a52e-4f735466cecf": elementId },
          attributeName,
        ],
      )
      .pipe(Effect.withSpan("Actions.getAttribute"));
  }

  isChecked(
    sessionId: string,
    elementId: string,
  ): Effect.Effect<boolean, import("./errors.js").WebDriverError> {
    return this.client
      .executeScript(
        sessionId,
        "return arguments[0].checked;",
        [{ "element-6066-11e4-a52e-4f735466cecf": elementId }],
      )
      .pipe(Effect.withSpan("Actions.isChecked"));
  }

  waitForElement(
    sessionId: string,
    strategy: string,
    selector: string,
    timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
  ): Effect.Effect<import("./webdriver-client.js").WebElement, import("./errors.js").ElementNotFoundError | import("./errors.js").WebDriverError> {
    return this.client.findElement(sessionId, strategy, selector).pipe(
      Effect.retry({
        times: MAX_RETRIES,
        schedule: Effect.schedule.spaced(RETRY_INTERVAL_MS),
      }),
      Effect.timeout(timeoutMs),
      Effect.withSpan("Actions.waitForElement"),
    );
  }

  waitForUrl(
    sessionId: string,
    expectedUrl: string,
    timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
  ): Effect.Effect<boolean, import("./errors.js").WebDriverError> {
    return Effect.gen(function* () {
      const client = this.client;
      const startTime = Date.now();

      while (Date.now() - startTime < timeoutMs) {
        const currentUrl = yield* client.getCurrentUrl(sessionId);
        if (currentUrl.includes(expectedUrl)) {
          return true;
        }
        yield* Effect.sleep(POLL_INTERVAL_MS);
      }

      return false;
    }).pipe(Effect.withSpan("Actions.waitForUrl"));
  }

  waitForTitle(
    sessionId: string,
    expectedTitle: string,
    timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
  ): Effect.Effect<boolean, import("./errors.js").WebDriverError> {
    return Effect.gen(function* () {
      const client = this.client;
      const startTime = Date.now();

      while (Date.now() - startTime < timeoutMs) {
        const title = yield* client.getTitle(sessionId);
        if (title.includes(expectedTitle)) {
          return true;
        }
        yield* Effect.sleep(POLL_INTERVAL_MS);
      }

      return false;
    }).pipe(Effect.withSpan("Actions.waitForTitle"));
  }
}

const DEFAULT_WAIT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 10;
const RETRY_INTERVAL_MS = 500;
const POLL_INTERVAL_MS = 200;
