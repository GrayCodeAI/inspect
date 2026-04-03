import { Effect, Layer, Schema, ServiceMap } from "effect";

export interface DesktopAction {
  readonly type:
    | "screenshot"
    | "mouse_move"
    | "mouse_click"
    | "mouse_double_click"
    | "mouse_drag"
    | "scroll"
    | "key"
    | "type"
    | "wait";
  readonly coordinates?: { readonly x: number; readonly y: number };
  readonly text?: string;
  readonly duration?: number;
}

export interface DesktopScreenshot {
  readonly data: string;
  readonly width: number;
  readonly height: number;
}

export class DesktopActionError extends Schema.ErrorClass<DesktopActionError>("DesktopActionError")(
  {
    _tag: Schema.tag("DesktopActionError"),
    action: Schema.String,
    cause: Schema.Unknown,
  },
) {
  message = `Desktop action failed: ${this.action}`;
}

export class ScreenshotError extends Schema.ErrorClass<ScreenshotError>("ScreenshotError")({
  _tag: Schema.tag("ScreenshotError"),
  cause: Schema.Unknown,
}) {
  message = "Failed to capture screenshot";
}

let robotjs: typeof import("robotjs") | undefined;
let screenshotDesktop: typeof import("screenshot-desktop") | undefined;

try {
  robotjs = require("robotjs");
} catch {
  robotjs = undefined;
}

try {
  screenshotDesktop = require("screenshot-desktop");
} catch {
  screenshotDesktop = undefined;
}

export class ComputerUseController extends ServiceMap.Service<ComputerUseController>()(
  "@inspect/ComputerUseController",
  {
    make: Effect.gen(function* () {
      const captureScreenshot = Effect.fn("ComputerUseController.captureScreenshot")(function* () {
        if (!screenshotDesktop) {
          return yield* new ScreenshotError({
            cause: "screenshot-desktop package not installed",
          });
        }

        const result = yield* Effect.tryPromise({
          try: async () => {
            const imgBuffer = await screenshotDesktop();
            const displays = await screenshotDesktop.listDisplays();
            const primary = displays.find((d: { id: string }) => d.id === "default") ?? displays[0];

            return {
              data: imgBuffer.toString("base64"),
              width: primary?.width ?? 1920,
              height: primary?.height ?? 1080,
            } as const satisfies DesktopScreenshot;
          },
          catch: (cause) => new ScreenshotError({ cause }),
        });

        yield* Effect.logDebug("Screenshot captured", {
          width: result.width,
          height: result.height,
        });
        return result;
      });

      const moveMouse = Effect.fn("ComputerUseController.moveMouse")(function* (
        x: number,
        y: number,
      ) {
        if (!robotjs) {
          return yield* new DesktopActionError({
            action: "mouse_move",
            cause: "robotjs not installed",
          });
        }

        yield* Effect.try({
          try: () => robotjs.moveMouse(x, y),
          catch: (cause) => new DesktopActionError({ action: "mouse_move", cause }),
        });

        yield* Effect.logDebug("Mouse moved", { x, y });
      });

      const click = Effect.fn("ComputerUseController.click")(function* (
        x: number,
        y: number,
        button?: "left" | "right" | "middle",
      ) {
        if (!robotjs) {
          return yield* new DesktopActionError({
            action: "mouse_click",
            cause: "robotjs not installed",
          });
        }

        const robotButton = button ?? "left";

        yield* Effect.try({
          try: () => {
            robotjs.moveMouse(x, y);
            robotjs.mouseClick(robotButton);
          },
          catch: (cause) => new DesktopActionError({ action: "mouse_click", cause }),
        });

        yield* Effect.logDebug("Mouse clicked", { x, y, button: robotButton });
      });

      const doubleClick = Effect.fn("ComputerUseController.doubleClick")(function* (
        x: number,
        y: number,
      ) {
        if (!robotjs) {
          return yield* new DesktopActionError({
            action: "mouse_double_click",
            cause: "robotjs not installed",
          });
        }

        yield* Effect.try({
          try: () => {
            robotjs.moveMouse(x, y);
            robotjs.mouseClick("left", true);
          },
          catch: (cause) => new DesktopActionError({ action: "mouse_double_click", cause }),
        });

        yield* Effect.logDebug("Mouse double-clicked", { x, y });
      });

      const drag = Effect.fn("ComputerUseController.drag")(function* (
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
      ) {
        if (!robotjs) {
          return yield* new DesktopActionError({
            action: "mouse_drag",
            cause: "robotjs not installed",
          });
        }

        yield* Effect.try({
          try: () => {
            robotjs.moveMouse(fromX, fromY);
            robotjs.mouseToggle("down");
            robotjs.moveMouse(toX, toY);
            robotjs.mouseToggle("up");
          },
          catch: (cause) => new DesktopActionError({ action: "mouse_drag", cause }),
        });

        yield* Effect.logDebug("Mouse dragged", { fromX, fromY, toX, toY });
      });

      const scroll = Effect.fn("ComputerUseController.scroll")(function* (
        amount: number,
        direction: "up" | "down" | "left" | "right" = "down",
      ) {
        if (!robotjs) {
          return yield* new DesktopActionError({
            action: "scroll",
            cause: "robotjs not installed",
          });
        }

        yield* Effect.try({
          try: () => {
            const x = direction === "left" ? -amount : direction === "right" ? amount : 0;
            const y = direction === "up" ? amount : direction === "down" ? -amount : 0;
            robotjs.scrollMouse(x, y);
          },
          catch: (cause) => new DesktopActionError({ action: "scroll", cause }),
        });

        yield* Effect.logDebug("Scrolled", { amount, direction });
      });

      const type = Effect.fn("ComputerUseController.type")(function* (text: string) {
        if (!robotjs) {
          return yield* new DesktopActionError({ action: "type", cause: "robotjs not installed" });
        }

        yield* Effect.try({
          try: () => robotjs.typeString(text),
          catch: (cause) => new DesktopActionError({ action: "type", cause }),
        });

        yield* Effect.logDebug("Text typed", { length: text.length });
      });

      const key = Effect.fn("ComputerUseController.key")(function* (
        keyName: string,
        modifiers?: string[],
      ) {
        if (!robotjs) {
          return yield* new DesktopActionError({ action: "key", cause: "robotjs not installed" });
        }

        const keyMap: Record<string, string> = {
          enter: "return",
          return: "return",
          tab: "tab",
          escape: "escape",
          esc: "escape",
          space: "space",
          backspace: "backspace",
          delete: "delete",
          up: "up",
          down: "down",
          left: "left",
          right: "right",
          home: "home",
          end: "end",
          pageup: "pageup",
          pagedown: "pagedown",
        };

        const normalizedKey = keyMap[keyName.toLowerCase()] ?? keyName;

        yield* Effect.try({
          try: () => {
            if (modifiers && modifiers.length > 0) {
              const normalizedMods = modifiers.map((mod) => {
                const lower = mod.toLowerCase();
                if (lower === "ctrl" || lower === "control") return "control";
                if (lower === "alt") return "alt";
                if (lower === "shift") return "shift";
                if (lower === "meta" || lower === "command" || lower === "cmd") return "command";
                return lower;
              });

              for (const mod of normalizedMods) {
                robotjs.keyToggle(mod, "down");
              }
              robotjs.keyTap(normalizedKey);
              for (const mod of normalizedMods) {
                robotjs.keyToggle(mod, "up");
              }
            } else {
              robotjs.keyTap(normalizedKey);
            }
          },
          catch: (cause) => new DesktopActionError({ action: "key", cause }),
        });

        yield* Effect.logDebug("Key pressed", { key: normalizedKey, modifiers });
      });

      const wait = Effect.fn("ComputerUseController.wait")(function* (ms: number) {
        yield* Effect.sleep(ms);
        yield* Effect.logDebug("Waited", { milliseconds: ms });
      });

      const execute = Effect.fn("ComputerUseController.execute")(function* (action: DesktopAction) {
        switch (action.type) {
          case "screenshot": {
            yield* captureScreenshot();
            break;
          }
          case "mouse_move": {
            if (action.coordinates) {
              yield* moveMouse(action.coordinates.x, action.coordinates.y);
            }
            break;
          }
          case "mouse_click": {
            if (action.coordinates) {
              yield* click(action.coordinates.x, action.coordinates.y);
            }
            break;
          }
          case "mouse_double_click": {
            if (action.coordinates) {
              yield* doubleClick(action.coordinates.x, action.coordinates.y);
            }
            break;
          }
          case "mouse_drag": {
            if (action.coordinates) {
              yield* drag(
                action.coordinates.x,
                action.coordinates.y,
                action.coordinates.x,
                action.coordinates.y,
              );
            }
            break;
          }
          case "scroll": {
            yield* scroll(action.duration ?? 500);
            break;
          }
          case "key": {
            if (action.text) {
              yield* key(action.text);
            }
            break;
          }
          case "type": {
            if (action.text) {
              yield* type(action.text);
            }
            break;
          }
          case "wait": {
            yield* wait(action.duration ?? 1000);
            break;
          }
        }

        yield* Effect.logInfo("Desktop action executed", { type: action.type });
      });

      const getScreenSize = Effect.fn("ComputerUseController.getScreenSize")(function* () {
        if (!robotjs) {
          return { width: 1920, height: 1080 };
        }

        return Effect.try({
          try: () => robotjs.getScreenSize(),
          catch: () => ({ width: 1920, height: 1080 }),
        });
      });

      return {
        captureScreenshot,
        moveMouse,
        click,
        doubleClick,
        drag,
        scroll,
        type,
        key,
        wait,
        execute,
        getScreenSize,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
