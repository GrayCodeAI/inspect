// ============================================================================
// @inspect/quality - Toxic Types for Fault Injection
// ============================================================================

import type { NetworkFault, NetworkFaultConfig } from "@inspect/shared";

/** Route-like interface for request interception */
interface Route {
  request(): { url(): string; method(): string };
  fulfill(options: { status?: number; headers?: Record<string, string>; body?: string }): Promise<void>;
  continue(): Promise<void>;
  abort(errorCode?: string): Promise<void>;
}

/** Base toxic interface */
export interface Toxic {
  /** Toxic type identifier */
  readonly type: NetworkFault["type"];
  /** Apply the toxic effect to an intercepted request */
  apply(route: Route): Promise<void>;
}

/**
 * LatencyToxic - adds a delay before the response.
 */
export class LatencyToxic implements Toxic {
  readonly type = "latency" as const;
  private readonly delay: number;
  private readonly jitter: number;

  constructor(delay: number, jitter: number = 0) {
    this.delay = delay;
    this.jitter = jitter;
  }

  async apply(route: Route): Promise<void> {
    const actualDelay = this.delay + Math.floor(Math.random() * this.jitter * 2) - this.jitter;
    const clampedDelay = Math.max(0, actualDelay);
    await new Promise((resolve) => setTimeout(resolve, clampedDelay));
    await route.continue();
  }
}

/**
 * BandwidthToxic - simulates limited bandwidth by adding
 * proportional delay based on response size estimate.
 */
export class BandwidthToxic implements Toxic {
  readonly type = "bandwidth" as const;
  /** Rate in KB/s */
  private readonly rate: number;

  constructor(rate: number) {
    this.rate = rate;
  }

  async apply(route: Route): Promise<void> {
    // Estimate delay based on typical response size (~50KB) and rate
    const estimatedSizeKB = 50;
    const delayMs = (estimatedSizeKB / this.rate) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  }
}

/**
 * TimeoutToxic - delays response past the timeout threshold,
 * effectively simulating a timeout.
 */
export class TimeoutToxic implements Toxic {
  readonly type = "timeout" as const;
  private readonly timeout: number;

  constructor(timeout: number) {
    this.timeout = timeout;
  }

  async apply(route: Route): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.timeout));
    await route.abort("timedout");
  }
}

/**
 * DisconnectToxic - immediately aborts the connection,
 * simulating a reset peer / connection refused.
 */
export class DisconnectToxic implements Toxic {
  readonly type = "reset_peer" as const;
  private readonly timeout: number;

  constructor(timeout: number = 0) {
    this.timeout = timeout;
  }

  async apply(route: Route): Promise<void> {
    if (this.timeout > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.timeout));
    }
    await route.abort("connectionreset");
  }
}

/**
 * SlowCloseToxic - adds a delay after response is sent but
 * before the connection is fully closed.
 */
export class SlowCloseToxic implements Toxic {
  readonly type = "slow_close" as const;
  private readonly delay: number;

  constructor(delay: number) {
    this.delay = delay;
  }

  async apply(route: Route): Promise<void> {
    await route.continue();
    // Simulate slow close by adding delay (this mainly affects connection pooling)
    await new Promise((resolve) => setTimeout(resolve, this.delay));
  }
}

/**
 * SlicerToxic - simulates responses being sent in small chunks
 * with delays between each chunk, causing slow loading.
 */
export class SlicerToxic implements Toxic {
  readonly type = "slicer" as const;
  private readonly avgSize: number;
  private readonly sizeVariation: number;
  private readonly delay: number;

  constructor(avgSize: number, sizeVariation: number, delay: number) {
    this.avgSize = avgSize;
    this.sizeVariation = sizeVariation;
    this.delay = delay;
  }

  async apply(route: Route): Promise<void> {
    // Calculate estimated chunk count and total delay
    const estimatedResponseSize = 50_000; // 50KB average
    const chunkSize = this.avgSize + Math.floor(Math.random() * this.sizeVariation * 2) - this.sizeVariation;
    const clampedChunkSize = Math.max(1, chunkSize);
    const chunks = Math.ceil(estimatedResponseSize / clampedChunkSize);
    const totalDelay = chunks * this.delay;

    // Apply proportional delay (capped at 30s to prevent infinite waits)
    const cappedDelay = Math.min(totalDelay, 30_000);
    await new Promise((resolve) => setTimeout(resolve, cappedDelay));
    await route.continue();
  }
}

/**
 * LimitDataToxic - limits the amount of data that can be transferred,
 * closing the connection after the limit is reached.
 */
export class LimitDataToxic implements Toxic {
  readonly type = "limit_data" as const;
  private readonly bytes: number;

  constructor(bytes: number) {
    this.bytes = bytes;
  }

  async apply(route: Route): Promise<void> {
    if (this.bytes <= 0) {
      // Zero limit means abort immediately
      await route.abort("connectionreset");
      return;
    }

    // For small limits, simulate partial response
    if (this.bytes < 1024) {
      await route.fulfill({
        status: 200,
        body: "x".repeat(this.bytes),
        headers: { "Content-Type": "application/octet-stream" },
      });
      return;
    }

    // For larger limits, let the response through
    await route.continue();
  }
}

/**
 * Create a Toxic instance from a NetworkFault config.
 */
export function createToxic(fault: NetworkFault): Toxic {
  switch (fault.type) {
    case "latency":
      return new LatencyToxic(fault.delay, fault.jitter);
    case "bandwidth":
      return new BandwidthToxic(fault.rate);
    case "timeout":
      return new TimeoutToxic(fault.timeout);
    case "reset_peer":
      return new DisconnectToxic(fault.timeout);
    case "slow_close":
      return new SlowCloseToxic(fault.delay);
    case "slicer":
      return new SlicerToxic(fault.avgSize, fault.sizeVariation, fault.delay);
    case "limit_data":
      return new LimitDataToxic(fault.bytes);
    default:
      throw new Error(`Unknown toxic type: ${(fault as NetworkFault).type}`);
  }
}

/** Pre-configured toxic presets for common scenarios */
export const TOXIC_PRESETS = {
  /** Simulate 3G mobile network */
  mobile3G: (): NetworkFaultConfig => ({
    id: "mobile-3g",
    fault: { type: "latency", delay: 300, jitter: 100 },
    stream: "downstream",
    toxicity: 100,
    enabled: true,
  }),

  /** Simulate slow 2G network */
  slow2G: (): NetworkFaultConfig => ({
    id: "slow-2g",
    fault: { type: "bandwidth", rate: 50 },
    stream: "downstream",
    toxicity: 100,
    enabled: true,
  }),

  /** Simulate intermittent failures */
  intermittentFailure: (): NetworkFaultConfig => ({
    id: "intermittent-failure",
    fault: { type: "reset_peer", timeout: 0 },
    stream: "downstream",
    toxicity: 20,
    enabled: true,
  }),

  /** Simulate server timeout */
  serverTimeout: (): NetworkFaultConfig => ({
    id: "server-timeout",
    fault: { type: "timeout", timeout: 30_000 },
    stream: "downstream",
    toxicity: 100,
    enabled: true,
  }),

  /** Simulate packet loss */
  packetLoss: (): NetworkFaultConfig => ({
    id: "packet-loss",
    fault: { type: "reset_peer", timeout: 500 },
    stream: "downstream",
    toxicity: 10,
    enabled: true,
  }),
} as const;
