import type { Page } from "playwright";
import { Effect, Layer, ServiceMap } from "effect";
import { ComponentInteractionError } from "./errors.js";

export class ComponentInteractions extends ServiceMap.Service<
  ComponentInteractions,
  {
    readonly click: (selector: string) => Effect.Effect<void, ComponentInteractionError>;
    readonly type: (
      selector: string,
      text: string,
    ) => Effect.Effect<void, ComponentInteractionError>;
    readonly select: (
      selector: string,
      value: string,
    ) => Effect.Effect<void, ComponentInteractionError>;
    readonly hover: (selector: string) => Effect.Effect<void, ComponentInteractionError>;
    readonly submit: (selector: string) => Effect.Effect<void, ComponentInteractionError>;
    readonly upload: (
      selector: string,
      filePath: string,
    ) => Effect.Effect<void, ComponentInteractionError>;
    readonly dragAndDrop: (
      fromSelector: string,
      toSelector: string,
    ) => Effect.Effect<void, ComponentInteractionError>;
  }
>()("@component-testing/ComponentInteractions") {
  static layer = (page: Page) =>
    Layer.succeed(this, {
      click: (selector: string) =>
        performInteraction(page, "click", selector, async () => {
          await page.locator(selector).click();
        }),

      type: (selector: string, text: string) =>
        performInteraction(page, "type", selector, async () => {
          await page.locator(selector).fill(text);
        }),

      select: (selector: string, value: string) =>
        performInteraction(page, "select", selector, async () => {
          await page.locator(selector).selectOption(value);
        }),

      hover: (selector: string) =>
        performInteraction(page, "hover", selector, async () => {
          await page.locator(selector).hover();
        }),

      submit: (selector: string) =>
        performInteraction(page, "submit", selector, async () => {
          await page.locator(selector).evaluate((el) => {
            const formEl = el.closest("form") ?? el;
            formEl.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          });
        }),

      upload: (selector: string, filePath: string) =>
        performInteraction(page, "upload", selector, async () => {
          await page.locator(selector).setInputFiles(filePath);
        }),

      dragAndDrop: (fromSelector: string, toSelector: string) =>
        performInteraction(page, "dragAndDrop", fromSelector, async () => {
          await page.locator(fromSelector).dragTo(page.locator(toSelector));
        }),
    });
}

function performInteraction(
  page: Page,
  action: string,
  selector: string,
  fn: () => Promise<void>,
): Effect.Effect<void, ComponentInteractionError> {
  return Effect.tryPromise({
    try: fn,
    catch: (cause) =>
      new ComponentInteractionError({
        action,
        selector,
        cause: String(cause),
      }),
  }).pipe(Effect.asVoid, Effect.withSpan("ComponentInteractions." + action));
}
