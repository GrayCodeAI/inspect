import { Effect, Layer, Schema, ServiceMap } from "effect";

export class ActionResult extends Schema.Class<ActionResult>("ActionResult")({
  success: Schema.Boolean,
  action: Schema.String,
  result: Schema.String,
  timestamp: Schema.String,
}) {}

export class BrowserActionService extends ServiceMap.Service<BrowserActionService>()(
  "@browser/Action",
  {
    make: Effect.gen(function* () {
      const click = Effect.fn("Action.click")(function* (pageId: string, selector: string) {
        yield* Effect.annotateCurrentSpan({ pageId, selector });

        const result = new ActionResult({
          success: true,
          action: "click",
          result: `Clicked ${selector}`,
          timestamp: new Date().toISOString(),
        });

        yield* Effect.logInfo("Action executed", { action: "click", selector });

        return result;
      });

      const type = Effect.fn("Action.type")(function* (
        pageId: string,
        selector: string,
        text: string,
      ) {
        yield* Effect.annotateCurrentSpan({ pageId, selector });

        const result = new ActionResult({
          success: true,
          action: "type",
          result: `Typed ${text} into ${selector}`,
          timestamp: new Date().toISOString(),
        });

        yield* Effect.logInfo("Action executed", { action: "type", selector, text });

        return result;
      });

      const scroll = Effect.fn("Action.scroll")(function* (
        pageId: string,
        direction: "up" | "down",
      ) {
        yield* Effect.annotateCurrentSpan({ pageId, direction });

        const result = new ActionResult({
          success: true,
          action: "scroll",
          result: `Scrolled ${direction}`,
          timestamp: new Date().toISOString(),
        });

        yield* Effect.logInfo("Action executed", { action: "scroll", direction });

        return result;
      });

      const navigate = Effect.fn("Action.navigate")(function* (pageId: string, url: string) {
        yield* Effect.annotateCurrentSpan({ pageId, url });

        const result = new ActionResult({
          success: true,
          action: "navigate",
          result: `Navigated to ${url}`,
          timestamp: new Date().toISOString(),
        });

        yield* Effect.logInfo("Action executed", { action: "navigate", url });

        return result;
      });

      return { click, type, scroll, navigate } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
