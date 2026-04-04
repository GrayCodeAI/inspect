// ============================================================================
// @inspect/browser - Mobile Gesture Simulator
//
// Simulates touch gestures on mobile viewports: swipe, pinch, long-press,
// double-tap, drag. Uses Playwright's touchscreen API.
// ============================================================================

import type { Page } from "playwright";

export interface GestureOptions {
  /** Duration of the gesture in ms. Default varies by gesture. */
  durationMs?: number;
  /** Number of steps in the gesture animation. Default: 10 */
  steps?: number;
}

export interface SwipeOptions extends GestureOptions {
  /** Starting point */
  startX: number;
  startY: number;
  /** Ending point */
  endX: number;
  endY: number;
}

export interface PinchOptions extends GestureOptions {
  /** Center point of the pinch */
  centerX: number;
  centerY: number;
  /** Starting distance between fingers (pixels) */
  startDistance: number;
  /** Ending distance between fingers (pixels) */
  endDistance: number;
}

export interface GestureResult {
  gesture: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

/**
 * GestureSimulator provides mobile touch gesture simulation.
 *
 * Usage:
 * ```ts
 * const gestures = new GestureSimulator(page);
 * await gestures.swipeLeft();
 * await gestures.swipeUp({ startY: 600, endY: 100 });
 * await gestures.longPress(200, 300);
 * await gestures.doubleTap(200, 300);
 * ```
 */
export class GestureSimulator {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Swipe in a direction with custom start/end points.
   */
  async swipe(options: SwipeOptions): Promise<GestureResult> {
    const start = Date.now();
    const steps = options.steps ?? 10;
    const duration = options.durationMs ?? 300;
    const stepDelay = duration / steps;

    try {
      await this.page.touchscreen.tap(options.startX, options.startY);

      for (let i = 1; i <= steps; i++) {
        const progress = i / steps;
        const x = options.startX + (options.endX - options.startX) * progress;
        const y = options.startY + (options.endY - options.startY) * progress;

        await this.page.evaluate(
          ({ x, y }) => {
            const touch = new Touch({
              identifier: 0,
              target: document.elementFromPoint(x, y) ?? document.body,
              clientX: x,
              clientY: y,
            });
            document.dispatchEvent(
              new TouchEvent("touchmove", {
                touches: [touch],
                changedTouches: [touch],
                bubbles: true,
              }),
            );
          },
          { x: Math.round(x), y: Math.round(y) },
        );

        if (stepDelay > 0) await this.page.waitForTimeout(stepDelay);
      }

      // End touch
      await this.page.evaluate(
        ({ x, y }) => {
          const touch = new Touch({
            identifier: 0,
            target: document.elementFromPoint(x, y) ?? document.body,
            clientX: x,
            clientY: y,
          });
          document.dispatchEvent(
            new TouchEvent("touchend", {
              touches: [],
              changedTouches: [touch],
              bubbles: true,
            }),
          );
        },
        { x: options.endX, y: options.endY },
      );

      return { gesture: "swipe", success: true, durationMs: Date.now() - start };
    } catch (err) {
      return {
        gesture: "swipe",
        success: false,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Swipe left (right to left).
   */
  async swipeLeft(options?: GestureOptions): Promise<GestureResult> {
    const vp = this.page.viewportSize() ?? { width: 375, height: 812 };
    return this.swipe({
      startX: vp.width * 0.8,
      startY: vp.height * 0.5,
      endX: vp.width * 0.2,
      endY: vp.height * 0.5,
      ...options,
    });
  }

  /**
   * Swipe right (left to right).
   */
  async swipeRight(options?: GestureOptions): Promise<GestureResult> {
    const vp = this.page.viewportSize() ?? { width: 375, height: 812 };
    return this.swipe({
      startX: vp.width * 0.2,
      startY: vp.height * 0.5,
      endX: vp.width * 0.8,
      endY: vp.height * 0.5,
      ...options,
    });
  }

  /**
   * Swipe up (bottom to top).
   */
  async swipeUp(options?: GestureOptions): Promise<GestureResult> {
    const vp = this.page.viewportSize() ?? { width: 375, height: 812 };
    return this.swipe({
      startX: vp.width * 0.5,
      startY: vp.height * 0.8,
      endX: vp.width * 0.5,
      endY: vp.height * 0.2,
      ...options,
    });
  }

  /**
   * Swipe down (top to bottom).
   */
  async swipeDown(options?: GestureOptions): Promise<GestureResult> {
    const vp = this.page.viewportSize() ?? { width: 375, height: 812 };
    return this.swipe({
      startX: vp.width * 0.5,
      startY: vp.height * 0.2,
      endX: vp.width * 0.5,
      endY: vp.height * 0.8,
      ...options,
    });
  }

  /**
   * Long press at a specific point.
   */
  async longPress(x: number, y: number, durationMs = 800): Promise<GestureResult> {
    const start = Date.now();

    try {
      // Dispatch touchstart
      await this.page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y) ?? document.body;
          const touch = new Touch({ identifier: 0, target: el, clientX: x, clientY: y });
          el.dispatchEvent(
            new TouchEvent("touchstart", {
              touches: [touch],
              changedTouches: [touch],
              bubbles: true,
            }),
          );
        },
        { x, y },
      );

      // Hold
      await this.page.waitForTimeout(durationMs);

      // Dispatch touchend
      await this.page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y) ?? document.body;
          const touch = new Touch({ identifier: 0, target: el, clientX: x, clientY: y });
          el.dispatchEvent(
            new TouchEvent("touchend", {
              touches: [],
              changedTouches: [touch],
              bubbles: true,
            }),
          );
        },
        { x, y },
      );

      return { gesture: "longPress", success: true, durationMs: Date.now() - start };
    } catch (err) {
      return {
        gesture: "longPress",
        success: false,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Double tap at a specific point.
   */
  async doubleTap(x: number, y: number): Promise<GestureResult> {
    const start = Date.now();

    try {
      await this.page.touchscreen.tap(x, y);
      await this.page.waitForTimeout(100);
      await this.page.touchscreen.tap(x, y);

      return { gesture: "doubleTap", success: true, durationMs: Date.now() - start };
    } catch (err) {
      return {
        gesture: "doubleTap",
        success: false,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Drag from one point to another.
   */
  async drag(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    options?: GestureOptions,
  ): Promise<GestureResult> {
    return this.swipe({
      startX,
      startY,
      endX,
      endY,
      durationMs: options?.durationMs ?? 500,
      steps: options?.steps ?? 20,
    });
  }

  /**
   * Tap at a specific point.
   */
  async tap(x: number, y: number): Promise<GestureResult> {
    const start = Date.now();

    try {
      await this.page.touchscreen.tap(x, y);
      return { gesture: "tap", success: true, durationMs: Date.now() - start };
    } catch (err) {
      return {
        gesture: "tap",
        success: false,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
