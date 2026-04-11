// ──────────────────────────────────────────────────────────────────────────────
// Mobile Actions Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { AppiumClient } from "./appium-client.js";
import { MobileError } from "./errors.js";

export class TapAction extends Schema.Class<TapAction>("TapAction")({
  type: Schema.Literal("tap"),
  x: Schema.Number,
  y: Schema.Number,
  duration: Schema.optional(Schema.Number),
}) {}

export class SwipeAction extends Schema.Class<SwipeAction>("SwipeAction")({
  type: Schema.Literal("swipe"),
  startX: Schema.Number,
  startY: Schema.Number,
  endX: Schema.Number,
  endY: Schema.Number,
  duration: Schema.optional(Schema.Number),
}) {}

export class PinchAction extends Schema.Class<PinchAction>("PinchAction")({
  type: Schema.Literal("pinch"),
  centerX: Schema.Number,
  centerY: Schema.Number,
  scale: Schema.Number,
  speed: Schema.optional(Schema.Number),
}) {}

export class ActionPerformed extends Schema.Class<ActionPerformed>("ActionPerformed")({
  action: Schema.String,
  success: Schema.Boolean,
  duration: Schema.Number,
  elementId: Schema.optional(Schema.String),
}) {}

export interface MobileActionsService {
  readonly tap: (
    elementId: string,
    options?: { duration?: number },
  ) => Effect.Effect<ActionPerformed, MobileError>;
  readonly swipe: (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration?: number,
  ) => Effect.Effect<ActionPerformed, MobileError>;
  readonly pinch: (
    centerX: number,
    centerY: number,
    scale: number,
    speed?: number,
  ) => Effect.Effect<ActionPerformed, MobileError>;
  readonly rotate: (
    angle: number,
    centerX?: number,
    centerY?: number,
  ) => Effect.Effect<ActionPerformed, MobileError>;
  readonly back: () => Effect.Effect<ActionPerformed, MobileError>;
  readonly home: () => Effect.Effect<ActionPerformed, MobileError>;
}

export class MobileActions extends ServiceMap.Service<
  MobileActions,
  MobileActionsService
>()("@inspect/MobileActions") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const appium = yield* AppiumClient;

      const tap = (elementId: string, options?: { duration?: number }) =>
        Effect.gen(function* () {
          const start = Date.now();

          yield* appium.sendCommand({
            method: "POST",
            endpoint: `/element/${elementId}/click`,
            body: { duration: options?.duration },
          });

          return new ActionPerformed({
            action: "tap",
            success: true,
            duration: Date.now() - start,
            elementId,
          });
        }).pipe(
          Effect.catchTag("AppiumConnectionError", (err) =>
            new MobileError({
              message: `Failed to tap element: ${err.message}`,
              cause: err,
            }).asEffect(),
          ),
          Effect.withSpan("MobileActions.tap"),
        );

      const swipe = (startX: number, startY: number, endX: number, endY: number, duration = 300) =>
        Effect.gen(function* () {
          const start = Date.now();

          yield* appium.sendCommand({
            method: "POST",
            endpoint: "/actions",
            body: {
              actions: [
                {
                  type: "pointer",
                  id: "finger1",
                  parameters: { pointerType: "touch" },
                  actions: [
                    { type: "pointerMove", duration: 0, x: startX, y: startY },
                    { type: "pointerDown", button: 0 },
                    { type: "pause", duration },
                    { type: "pointerMove", duration, x: endX, y: endY },
                    { type: "pointerUp", button: 0 },
                  ],
                },
              ],
            },
          });

          return new ActionPerformed({
            action: "swipe",
            success: true,
            duration: Date.now() - start,
          });
        }).pipe(
          Effect.catchTag("AppiumConnectionError", (err) =>
            new MobileError({
              message: `Failed to swipe: ${err.message}`,
              cause: err,
            }).asEffect(),
          ),
          Effect.withSpan("MobileActions.swipe"),
        );

      const pinch = (centerX: number, centerY: number, scale: number, speed = 500) =>
        Effect.gen(function* () {
          const start = Date.now();

          yield* appium.sendCommand({
            method: "POST",
            endpoint: "/actions",
            body: {
              actions: [
                {
                  type: "pointer",
                  id: "finger1",
                  parameters: { pointerType: "touch" },
                  actions: [
                    { type: "pointerMove", duration: 0, x: centerX - 50, y: centerY },
                    { type: "pointerDown", button: 0 },
                    { type: "pause", duration: 100 },
                    { type: "pointerMove", duration: speed, x: centerX, y: centerY },
                    { type: "pointerUp", button: 0 },
                  ],
                },
                {
                  type: "pointer",
                  id: "finger2",
                  parameters: { pointerType: "touch" },
                  actions: [
                    { type: "pointerMove", duration: 0, x: centerX + 50, y: centerY },
                    { type: "pointerDown", button: 0 },
                    { type: "pause", duration: 100 },
                    { type: "pointerMove", duration: speed, x: centerX, y: centerY },
                    { type: "pointerUp", button: 0 },
                  ],
                },
              ],
            },
          });

          return new ActionPerformed({
            action: "pinch",
            success: true,
            duration: Date.now() - start,
          });
        }).pipe(
          Effect.catchTag("AppiumConnectionError", (err) =>
            new MobileError({
              message: `Failed to pinch: ${err.message}`,
              cause: err,
            }).asEffect(),
          ),
          Effect.withSpan("MobileActions.pinch"),
        );

      const rotate = (angle: number, centerX = 0, centerY = 0) =>
        Effect.gen(function* () {
          const start = Date.now();

          yield* appium.sendCommand({
            method: "POST",
            endpoint: "/actions",
            body: {
              actions: [
                {
                  type: "pointer",
                  id: "finger1",
                  parameters: { pointerType: "touch" },
                  actions: [
                    { type: "pointerMove", duration: 0, x: centerX, y: centerY - 50 },
                    { type: "pointerDown", button: 0 },
                    { type: "pointerMove", duration: 200, x: centerX + 50, y: centerY },
                    { type: "pointerMove", duration: 200, x: centerX, y: centerY + 50 },
                    { type: "pointerMove", duration: 200, x: centerX - 50, y: centerY },
                    { type: "pointerUp", button: 0 },
                  ],
                },
              ],
            },
          });

          return new ActionPerformed({
            action: `rotate:${angle}`,
            success: true,
            duration: Date.now() - start,
          });
        }).pipe(
          Effect.catchTag("AppiumConnectionError", (err) =>
            new MobileError({
              message: `Failed to rotate: ${err.message}`,
              cause: err,
            }).asEffect(),
          ),
          Effect.withSpan("MobileActions.rotate"),
        );

      const back = Effect.gen(function* () {
        const start = Date.now();

        yield* appium.sendCommand({
          method: "POST",
          endpoint: "/back",
        });

        return new ActionPerformed({
          action: "back",
          success: true,
          duration: Date.now() - start,
        });
      }).pipe(
        Effect.catchTag("AppiumConnectionError", (err) =>
          new MobileError({
            message: `Failed to navigate back: ${err.message}`,
            cause: err,
          }).asEffect(),
        ),
        Effect.withSpan("MobileActions.back"),
      );

      const home = Effect.gen(function* () {
        const start = Date.now();

        yield* appium.sendCommand({
          method: "POST",
          endpoint: "/url",
          body: { url: "about:blank" },
        });

        return new ActionPerformed({
          action: "home",
          success: true,
          duration: Date.now() - start,
        });
      }).pipe(
        Effect.catchTag("AppiumConnectionError", (err) =>
          new MobileError({
            message: `Failed to navigate home: ${err.message}`,
            cause: err,
          }).asEffect(),
        ),
        Effect.withSpan("MobileActions.home"),
      );

      return { tap, swipe, pinch, rotate, back, home } as const;
    }),
  ).pipe(Layer.provide(AppiumClient.layer));
}
