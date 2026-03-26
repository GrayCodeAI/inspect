import type { DeviceConfig } from "./presets.js";

/**
 * Result of running a test function on a specific device.
 */
export interface DeviceRunResult<T = unknown> {
  device: DeviceConfig;
  status: "success" | "error";
  result?: T;
  error?: string;
  duration: number;
}

/**
 * Comparison of results across devices.
 */
interface CrossDeviceComparison<T = unknown> {
  /** Devices that all produced the same result. */
  consistent: boolean;
  /** Results grouped by outcome. */
  groups: Array<{
    devices: string[];
    result: T | undefined;
    error?: string;
  }>;
  /** Devices where the test failed. */
  failures: string[];
  /** Summary string. */
  summary: string;
}

/**
 * DevicePool manages parallel test execution across multiple device configurations.
 * It handles concurrency, result aggregation, and cross-device comparison.
 */
export class DevicePool {
  private concurrency: number;

  constructor(concurrency: number = 3) {
    this.concurrency = concurrency;
  }

  /**
   * Run a test function on multiple devices in parallel (up to concurrency limit).
   */
  async runOnDevices<T>(
    devices: DeviceConfig[],
    testFn: (device: DeviceConfig) => Promise<T>
  ): Promise<DeviceRunResult<T>[]> {
    const results: DeviceRunResult<T>[] = [];
    const queue = [...devices];
    let activeCount = 0;

    return new Promise((resolve) => {
      const checkDone = () => {
        if (results.length === devices.length) {
          resolve(results);
        }
      };

      const processNext = () => {
        while (activeCount < this.concurrency && queue.length > 0) {
          const device = queue.shift()!;
          activeCount++;

          const startTime = Date.now();

          testFn(device)
            .then((result) => {
              results.push({
                device,
                status: "success",
                result,
                duration: Date.now() - startTime,
              });
            })
            .catch((err) => {
              results.push({
                device,
                status: "error",
                error:
                  err instanceof Error
                    ? err.message
                    : String(err),
                duration: Date.now() - startTime,
              });
            })
            .finally(() => {
              activeCount--;
              processNext();
              checkDone();
            });
        }

        // Edge case: if queue was already empty
        checkDone();
      };

      processNext();
    });
  }

  /**
   * Run a test function on devices sequentially (useful for debugging).
   */
  async runSequential<T>(
    devices: DeviceConfig[],
    testFn: (device: DeviceConfig) => Promise<T>
  ): Promise<DeviceRunResult<T>[]> {
    const results: DeviceRunResult<T>[] = [];

    for (const device of devices) {
      const startTime = Date.now();
      try {
        const result = await testFn(device);
        results.push({
          device,
          status: "success",
          result,
          duration: Date.now() - startTime,
        });
      } catch (err) {
        results.push({
          device,
          status: "error",
          error:
            err instanceof Error ? err.message : String(err),
          duration: Date.now() - startTime,
        });
      }
    }

    return results;
  }

  /**
   * Compare results across devices to identify device-specific issues.
   * Uses a stringification-based equality check by default.
   */
  compareResults<T>(
    results: DeviceRunResult<T>[],
    equalityFn?: (a: T, b: T) => boolean
  ): CrossDeviceComparison<T> {
    const failures = results
      .filter((r) => r.status === "error")
      .map((r) => r.device.name);

    const successes = results.filter(
      (r) => r.status === "success"
    );

    // Group by result equality
    const groups: CrossDeviceComparison<T>["groups"] = [];

    for (const run of results) {
      let foundGroup = false;

      for (const group of groups) {
        if (run.status === "error" && group.error) {
          // Group errors together
          group.devices.push(run.device.name);
          foundGroup = true;
          break;
        }

        if (
          run.status === "success" &&
          group.result !== undefined
        ) {
          const isEqual = equalityFn
            ? equalityFn(run.result!, group.result as T)
            : JSON.stringify(run.result) ===
              JSON.stringify(group.result);

          if (isEqual) {
            group.devices.push(run.device.name);
            foundGroup = true;
            break;
          }
        }
      }

      if (!foundGroup) {
        groups.push({
          devices: [run.device.name],
          result: run.result,
          error: run.error,
        });
      }
    }

    const consistent =
      groups.length <= 1 && failures.length === 0;

    const summary = consistent
      ? `All ${results.length} devices produced consistent results`
      : `${groups.length} different outcomes across ${results.length} devices` +
        (failures.length > 0
          ? ` (${failures.length} failures)`
          : "");

    return {
      consistent,
      groups,
      failures,
      summary,
    };
  }

  /**
   * Get a summary of which devices are available in the pool.
   */
  getCapabilities(devices: DeviceConfig[]): {
    desktops: string[];
    phones: string[];
    tablets: string[];
    browsers: string[];
    touchDevices: string[];
  } {
    const desktops: string[] = [];
    const phones: string[] = [];
    const tablets: string[] = [];
    const browsers = new Set<string>();
    const touchDevices: string[] = [];

    for (const device of devices) {
      browsers.add(device.defaultBrowserType);

      if (device.hasTouch) {
        touchDevices.push(device.name);
      }

      if (!device.isMobile) {
        desktops.push(device.name);
      } else if (
        device.viewport.width >= 500 ||
        device.name.includes("ipad") ||
        device.name.includes("tab")
      ) {
        tablets.push(device.name);
      } else {
        phones.push(device.name);
      }
    }

    return {
      desktops,
      phones,
      tablets,
      browsers: [...browsers],
      touchDevices,
    };
  }
}
