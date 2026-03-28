// ============================================================================
// @inspect/browser - Drag and Drop
//
// Implements drag-and-drop via Playwright mouse API.
// Supports element-to-element and coordinate-based dragging.
// Inspired by Stagehand's dragAndDrop action.
// ============================================================================

import type { Page } from "playwright";
import { createLogger } from "@inspect/observability";

const logger = createLogger("browser/actions/drag-drop");

export interface DragDropOptions {
  /** Duration of drag in ms. Default: 500 */
  durationMs?: number;
  /** Number of intermediate points. Default: 10 */
  steps?: number;
}

export interface DragDropResult {
  success: boolean;
  from: { x: number; y: number };
  to: { x: number; y: number };
  durationMs: number;
  error?: string;
}

/**
 * DragDrop implements drag-and-drop actions.
 */
export class DragDrop {
  /**
   * Drag from one element to another.
   */
  async dragElement(
    page: Page,
    sourceSelector: string,
    targetSelector: string,
    options: DragDropOptions = {},
  ): Promise<DragDropResult> {
    const start = Date.now();
    const steps = options.steps ?? 10;
    const duration = options.durationMs ?? 500;

    try {
      const source = page.locator(sourceSelector).first();
      const target = page.locator(targetSelector).first();

      const sourceBounds = await source.boundingBox();
      const targetBounds = await target.boundingBox();

      if (!sourceBounds || !targetBounds) {
        return { success: false, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, durationMs: Date.now() - start, error: "Could not get element bounds" };
      }

      const fromX = sourceBounds.x + sourceBounds.width / 2;
      const fromY = sourceBounds.y + sourceBounds.height / 2;
      const toX = targetBounds.x + targetBounds.width / 2;
      const toY = targetBounds.y + targetBounds.height / 2;

      return this.dragCoordinates(page, fromX, fromY, toX, toY, options);
    } catch (err) {
      return { success: false, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, durationMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Drag from coordinates to coordinates.
   */
  async dragCoordinates(
    page: Page,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    options: DragDropOptions = {},
  ): Promise<DragDropResult> {
    const start = Date.now();
    const steps = options.steps ?? 10;
    const duration = options.durationMs ?? 500;
    const stepDelay = duration / steps;

    try {
      // Move to start position
      await page.mouse.move(fromX, fromY);
      await page.mouse.down();

      // Move in steps
      for (let i = 1; i <= steps; i++) {
        const progress = i / steps;
        const x = fromX + (toX - fromX) * progress;
        const y = fromY + (toY - fromY) * progress;
        await page.mouse.move(x, y);
        if (stepDelay > 10) await page.waitForTimeout(stepDelay);
      }

      // Release
      await page.mouse.up();

      return {
        success: true,
        from: { x: Math.round(fromX), y: Math.round(fromY) },
        to: { x: Math.round(toX), y: Math.round(toY) },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      // Ensure mouse is released on error
      try { await page.mouse.up(); } catch (releaseError) { logger.debug("Failed to release mouse after drag error", { releaseError }); }
      return {
        success: false,
        from: { x: Math.round(fromX), y: Math.round(fromY) },
        to: { x: Math.round(toX), y: Math.round(toY) },
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
