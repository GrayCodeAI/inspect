// ============================================================================
// @inspect/quality - Chaos Engine
// ============================================================================

import type { ChaosReport, GremlinSpecies, FPSDrop } from "@inspect/shared";
import { createTimer, sleep } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("quality/gremlins");
import {
  DEFAULT_GREMLIN_COUNT,
  DEFAULT_GREMLIN_DELAY,
  DEFAULT_CHAOS_MAX_ERRORS,
  ALL_GREMLIN_SPECIES,
} from "@inspect/shared";
import { createGremlin, type Gremlin, type GremlinInjectionOptions } from "./species.js";
import {
  FPS_MONITOR_SCRIPT,
  FPS_MONITOR_STOP_SCRIPT,
  ERROR_MONITOR_SCRIPT,
  ERROR_MONITOR_RESULTS_SCRIPT,
  ALERT_MONITOR_SCRIPT,
  type FPSMonitorResult,
  type ErrorMonitorResult,
} from "./monitors.js";

/** Page-like interface */
interface PageHandle {
  url(): string;
  evaluate<R>(fn: string | ((...args: unknown[]) => R), ...args: unknown[]): Promise<R>;
  viewportSize(): { width: number; height: number } | null;
}

/** Options for chaos testing */
export interface ChaosOptions {
  /** Which gremlin species to use */
  species?: GremlinSpecies[];
  /** Total number of random interactions */
  count?: number;
  /** Delay between interactions in ms */
  delay?: number;
  /** CSS selectors to exclude from interactions */
  excludeSelectors?: string[];
  /** Maximum errors before stopping */
  maxErrors?: number;
  /** Show visual markers for interactions */
  showMarkers?: boolean;
  /** FPS threshold for drop detection */
  fpsThreshold?: number;
  /** Callback after each interaction */
  onInteraction?: (index: number, result: unknown) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * ChaosEngine unleashes random interactions on a page to find
 * robustness issues, crashes, and performance problems.
 */
export class ChaosEngine {
  /**
   * Unleash gremlins on a page.
   * Performs random interactions and monitors for errors and FPS drops.
   */
  async unleash(page: PageHandle, options: ChaosOptions = {}): Promise<ChaosReport> {
    const timer = createTimer();
    const species = options.species ?? [...ALL_GREMLIN_SPECIES];
    const count = options.count ?? DEFAULT_GREMLIN_COUNT;
    const delay = options.delay ?? DEFAULT_GREMLIN_DELAY;
    const maxErrors = options.maxErrors ?? DEFAULT_CHAOS_MAX_ERRORS;
    const showMarkers = options.showMarkers ?? true;
    const excludeSelectors = options.excludeSelectors ?? [];

    // Create gremlin instances
    const gremlins: Gremlin[] = species.map((s) => createGremlin(s));

    // Get viewport size
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

    // Injection options
    const injectionOptions: GremlinInjectionOptions = {
      excludeSelectors,
      maxX: viewport.width,
      maxY: viewport.height,
      showMarkers,
    };

    // Inject monitors
    await page.evaluate(FPS_MONITOR_SCRIPT);
    await page.evaluate(ERROR_MONITOR_SCRIPT);
    await page.evaluate(ALERT_MONITOR_SCRIPT);

    // Tracking
    let interactions = 0;
    const runtimeErrors: Array<{ message: string; stack?: string; timestamp: number }> = [];
    let pageCrashed = false;

    // Run chaos
    for (let i = 0; i < count; i++) {
      if (runtimeErrors.length >= maxErrors) break;

      try {
        // Pick a random gremlin
        const gremlin = gremlins[Math.floor(Math.random() * gremlins.length)];
        const script = gremlin.getInjectionScript(injectionOptions);

        const result = await page.evaluate(script);
        interactions++;

        if (options.onInteraction) {
          options.onInteraction(i, result);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        // Check if this is a page crash
        if (
          err.message.includes("Execution context was destroyed") ||
          err.message.includes("Target closed") ||
          err.message.includes("Page crashed")
        ) {
          pageCrashed = true;
          runtimeErrors.push({
            message: `Page crashed: ${err.message}`,
            stack: err.stack,
            timestamp: Date.now(),
          });
          break;
        }

        runtimeErrors.push({
          message: err.message,
          stack: err.stack,
          timestamp: Date.now(),
        });

        if (options.onError) {
          options.onError(err);
        }
      }

      if (delay > 0) {
        await sleep(delay);
      }
    }

    // Collect monitor results
    let fpsDrops: FPSDrop[] = [];
    let consoleErrors: string[] = [];
    let unhandledRejections: string[] = [];

    if (!pageCrashed) {
      try {
        const fpsResult = (await page.evaluate(FPS_MONITOR_STOP_SCRIPT)) as FPSMonitorResult;
        fpsDrops = (fpsResult.drops ?? []).map((d) => ({
          fps: d.fps,
          timestamp: d.timestamp,
          duration: d.duration,
        }));

        const errorResult = (await page.evaluate(
          ERROR_MONITOR_RESULTS_SCRIPT,
        )) as ErrorMonitorResult;
        consoleErrors = errorResult.consoleErrors ?? [];
        unhandledRejections = errorResult.unhandledRejections ?? [];

        // Merge page errors into runtimeErrors
        for (const err of errorResult.errors) {
          runtimeErrors.push({
            message: err.message,
            stack: err.stack,
            timestamp: err.timestamp,
          });
        }
      } catch (error) {
        logger.debug("Failed to collect monitor results, page may have navigated away or crashed", {
          error,
        });
      }
    }

    return {
      interactions,
      errors: runtimeErrors,
      fpsDrops,
      consoleErrors,
      duration: timer.elapsed(),
      species,
      pageCrashed,
      unhandledRejections,
    };
  }

  /**
   * Quick chaos test with fewer interactions for CI.
   */
  async quickTest(page: PageHandle): Promise<ChaosReport> {
    return this.unleash(page, {
      count: 100,
      delay: 5,
      maxErrors: 5,
      showMarkers: false,
    });
  }

  /**
   * Stress test with maximum interactions and no delay.
   */
  async stressTest(page: PageHandle, duration: number = 30_000): Promise<ChaosReport> {
    const estimatedCount = Math.floor(duration / 2); // ~2ms per interaction
    return this.unleash(page, {
      count: estimatedCount,
      delay: 0,
      maxErrors: 100,
      showMarkers: false,
    });
  }
}
