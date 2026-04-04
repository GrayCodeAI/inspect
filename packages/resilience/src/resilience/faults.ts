// ============================================================================
// @inspect/quality - Fault Injector
// ============================================================================

import type { NetworkFault } from "@inspect/shared";
import { generateId } from "@inspect/shared";
import { createToxic, type Toxic } from "./toxics.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("quality/faults");

/** Page-like interface with route() method */
interface PageHandle {
  route(
    urlOrPredicate: string | RegExp | ((url: URL) => boolean),
    handler: (route: RouteHandle) => Promise<void>,
  ): Promise<void>;
  unroute(
    urlOrPredicate: string | RegExp | ((url: URL) => boolean),
    handler?: (route: RouteHandle) => Promise<void>,
  ): Promise<void>;
}

/** Route handle interface */
interface RouteHandle {
  request(): { url(): string; method(): string; resourceType(): string };
  fulfill(options: {
    status?: number;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<void>;
  continue(): Promise<void>;
  abort(errorCode?: string): Promise<void>;
}

/** Fault injection configuration */
export interface FaultConfig {
  /** Unique fault ID (auto-generated if not provided) */
  id?: string;
  /** The network fault to inject */
  fault: NetworkFault;
  /** URL pattern to match (glob, regex, or string) */
  urlPattern?: string | RegExp;
  /** Resource types to match */
  resourceTypes?: string[];
  /** HTTP methods to match */
  methods?: string[];
  /** Probability of applying the fault (0-100) */
  toxicity?: number;
  /** Stream direction */
  stream?: "upstream" | "downstream";
  /** Whether the fault is enabled */
  enabled?: boolean;
}

/** Fault injection statistics */
export interface FaultStats {
  /** Total requests intercepted */
  totalIntercepted: number;
  /** Requests where faults were applied */
  faultsApplied: number;
  /** Requests passed through */
  passedThrough: number;
  /** Per-fault stats */
  perFault: Map<string, { applied: number; skipped: number }>;
}

/**
 * FaultInjector intercepts page requests and simulates network faults
 * such as latency, timeouts, disconnects, and bandwidth limits.
 */
export class FaultInjector {
  private faults: Map<string, { config: FaultConfig; toxic: Toxic }> = new Map();
  private page: PageHandle | null = null;
  private routeHandler: ((route: RouteHandle) => Promise<void>) | null = null;
  private stats: FaultStats = {
    totalIntercepted: 0,
    faultsApplied: 0,
    passedThrough: 0,
    perFault: new Map(),
  };
  private active = false;

  /**
   * Add a fault configuration.
   * Returns the fault ID.
   */
  addFault(config: FaultConfig): string {
    const id = config.id ?? generateId();
    const toxic = createToxic(config.fault);

    this.faults.set(id, { config: { ...config, id }, toxic });
    this.stats.perFault.set(id, { applied: 0, skipped: 0 });

    return id;
  }

  /**
   * Remove a fault by ID.
   */
  removeFault(id: string): boolean {
    return this.faults.delete(id);
  }

  /**
   * Enable or disable a fault.
   */
  setEnabled(id: string, enabled: boolean): void {
    const fault = this.faults.get(id);
    if (fault) {
      fault.config.enabled = enabled;
    }
  }

  /**
   * Update the toxicity (probability) of a fault.
   */
  setToxicity(id: string, toxicity: number): void {
    const fault = this.faults.get(id);
    if (fault) {
      fault.config.toxicity = Math.max(0, Math.min(100, toxicity));
    }
  }

  /**
   * Start fault injection on a page.
   */
  async start(page: PageHandle): Promise<void> {
    this.page = page;
    this.active = true;
    this.resetStats();

    this.routeHandler = async (route: RouteHandle) => {
      await this.handleRoute(route);
    };

    await page.route("**/*", this.routeHandler);
  }

  /**
   * Stop fault injection.
   */
  async stop(): Promise<void> {
    this.active = false;

    if (this.page && this.routeHandler) {
      try {
        await this.page.unroute("**/*", this.routeHandler);
      } catch (error) {
        logger.debug("Failed to unroute fault injector, page may already be closed", { error });
      }
    }

    this.routeHandler = null;
  }

  /**
   * Get current fault injection statistics.
   */
  getStats(): FaultStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      totalIntercepted: 0,
      faultsApplied: 0,
      passedThrough: 0,
      perFault: new Map(),
    };
    for (const id of this.faults.keys()) {
      this.stats.perFault.set(id, { applied: 0, skipped: 0 });
    }
  }

  /**
   * List all configured faults.
   */
  listFaults(): FaultConfig[] {
    return Array.from(this.faults.values()).map((f) => ({ ...f.config }));
  }

  /**
   * Remove all faults.
   */
  clearFaults(): void {
    this.faults.clear();
  }

  /**
   * Handle an intercepted route.
   */
  private async handleRoute(route: RouteHandle): Promise<void> {
    this.stats.totalIntercepted++;

    const request = route.request();
    const url = request.url();
    const method = request.method();
    const resourceType = request.resourceType();

    // Find matching fault
    for (const [id, { config, toxic }] of this.faults) {
      if (config.enabled === false) continue;

      // Check URL pattern match
      if (config.urlPattern) {
        const matches =
          config.urlPattern instanceof RegExp
            ? config.urlPattern.test(url)
            : this.globMatch(config.urlPattern, url);
        if (!matches) continue;
      }

      // Check resource type match
      if (config.resourceTypes?.length && !config.resourceTypes.includes(resourceType)) {
        continue;
      }

      // Check method match
      if (config.methods?.length && !config.methods.includes(method)) {
        continue;
      }

      // Apply toxicity (probability)
      const toxicity = config.toxicity ?? 100;
      if (Math.random() * 100 >= toxicity) {
        const faultStats = this.stats.perFault.get(id);
        if (faultStats) faultStats.skipped++;
        continue;
      }

      // Apply the toxic
      try {
        await toxic.apply(route);
        this.stats.faultsApplied++;
        const faultStats = this.stats.perFault.get(id);
        if (faultStats) faultStats.applied++;
        return; // Only apply first matching fault
      } catch (error) {
        logger.debug("Toxic application failed, continuing to next fault or passthrough", {
          id,
          url,
          error,
        });
      }
    }

    // No fault matched, pass through
    this.stats.passedThrough++;
    await route.continue();
  }

  /**
   * Simple glob pattern matching for URLs.
   */
  private globMatch(pattern: string, url: string): boolean {
    // Convert glob to regex
    const regex = new RegExp(
      "^" +
        pattern
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, ".*")
          .replace(/\?/g, ".") +
        "$",
    );
    return regex.test(url);
  }
}
