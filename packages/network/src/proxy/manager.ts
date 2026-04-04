// ──────────────────────────────────────────────────────────────────────────────
// @inspect/network - Proxy Pool Manager
// ──────────────────────────────────────────────────────────────────────────────

import type { ProxyConfig } from "@inspect/shared";
import { generateId } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("network/proxy");

/** Internal proxy entry with health tracking */
export interface ProxyEntry {
  /** Unique proxy identifier */
  id: string;
  /** Proxy configuration */
  config: ProxyConfig;
  /** Whether the proxy is healthy */
  healthy: boolean;
  /** Last health check timestamp */
  lastChecked: number;
  /** Number of consecutive failures */
  failCount: number;
  /** Total requests routed through this proxy */
  requestCount: number;
  /** Geographic location hint */
  location?: string;
}

/** Options for getting a proxy */
export interface GetProxyOptions {
  /** Preferred geographic location */
  location?: string;
  /** Only return healthy proxies */
  healthyOnly?: boolean;
}

/**
 * ProxyManager manages a pool of proxy servers with round-robin rotation,
 * health checking, and geographic filtering.
 */
export class ProxyManager {
  private proxies: Map<string, ProxyEntry> = new Map();
  private rotationIndex: number = 0;
  private healthCheckIntervalMs: number;
  private healthCheckTimer: ReturnType<typeof setInterval> | undefined;

  constructor(options?: { healthCheckIntervalMs?: number }) {
    this.healthCheckIntervalMs = options?.healthCheckIntervalMs ?? 300_000; // 5 min default
  }

  /**
   * Add a proxy to the pool.
   * Returns the generated proxy ID.
   */
  addProxy(config: ProxyConfig, location?: string): string {
    const id = generateId();
    const entry: ProxyEntry = {
      id,
      config,
      healthy: true,
      lastChecked: 0,
      failCount: 0,
      requestCount: 0,
      location,
    };
    this.proxies.set(id, entry);
    return id;
  }

  /**
   * Remove a proxy from the pool by its ID.
   * Returns true if the proxy was found and removed.
   */
  removeProxy(id: string): boolean {
    return this.proxies.delete(id);
  }

  /**
   * Get the next proxy using round-robin rotation.
   * Optionally filter by location and health status.
   */
  getProxy(options?: GetProxyOptions): ProxyEntry | undefined {
    const candidates = this.getCandidates(options);
    if (candidates.length === 0) return undefined;

    this.rotationIndex = this.rotationIndex % candidates.length;
    const proxy = candidates[this.rotationIndex];
    proxy.requestCount++;
    this.rotationIndex++;

    return proxy;
  }

  /**
   * Rotate to the next proxy in the pool and return it.
   * Skips unhealthy proxies.
   */
  rotateProxy(): ProxyEntry | undefined {
    const candidates = this.getCandidates({ healthyOnly: true });
    if (candidates.length === 0) return undefined;

    this.rotationIndex = (this.rotationIndex + 1) % candidates.length;
    const proxy = candidates[this.rotationIndex];
    proxy.requestCount++;
    return proxy;
  }

  /**
   * List all proxies in the pool with their current status.
   */
  listProxies(): ProxyEntry[] {
    return Array.from(this.proxies.values());
  }

  /**
   * Perform a health check on a specific proxy by attempting a TCP connection.
   * Updates the proxy's health status in the pool.
   */
  async healthCheck(proxy: ProxyEntry): Promise<boolean> {
    const net = await import("node:net");

    return new Promise<boolean>((resolve) => {
      const url = parseProxyUrl(proxy.config.server);
      if (!url) {
        proxy.healthy = false;
        proxy.failCount++;
        proxy.lastChecked = Date.now();
        resolve(false);
        return;
      }

      const socket = net.createConnection(
        { host: url.hostname, port: url.port, timeout: 5000 },
        () => {
          socket.destroy();
          proxy.healthy = true;
          proxy.failCount = 0;
          proxy.lastChecked = Date.now();
          resolve(true);
        },
      );

      socket.on("error", () => {
        socket.destroy();
        proxy.healthy = false;
        proxy.failCount++;
        proxy.lastChecked = Date.now();
        resolve(false);
      });

      socket.on("timeout", () => {
        socket.destroy();
        proxy.healthy = false;
        proxy.failCount++;
        proxy.lastChecked = Date.now();
        resolve(false);
      });
    });
  }

  /**
   * Run health checks on all proxies in the pool.
   * Returns the number of healthy proxies.
   */
  async healthCheckAll(): Promise<number> {
    const entries = Array.from(this.proxies.values());
    const results = await Promise.allSettled(entries.map((entry) => this.healthCheck(entry)));

    let healthyCount = 0;
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        healthyCount++;
      }
    }
    return healthyCount;
  }

  /**
   * Start periodic health checking.
   */
  startHealthChecks(): void {
    if (this.healthCheckTimer) return;
    this.healthCheckTimer = setInterval(() => {
      this.healthCheckAll().catch(() => {});
    }, this.healthCheckIntervalMs);
  }

  /**
   * Stop periodic health checking.
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Get the count of healthy proxies.
   */
  get healthyCount(): number {
    let count = 0;
    for (const entry of this.proxies.values()) {
      if (entry.healthy) count++;
    }
    return count;
  }

  /**
   * Get the total number of proxies.
   */
  get size(): number {
    return this.proxies.size;
  }

  /**
   * Mark a proxy as failed (e.g., after a request error).
   */
  markFailed(id: string): void {
    const entry = this.proxies.get(id);
    if (entry) {
      entry.failCount++;
      if (entry.failCount >= 3) {
        entry.healthy = false;
      }
    }
  }

  /**
   * Mark a proxy as recovered/healthy.
   */
  markHealthy(id: string): void {
    const entry = this.proxies.get(id);
    if (entry) {
      entry.healthy = true;
      entry.failCount = 0;
    }
  }

  /**
   * Clear all proxies from the pool.
   */
  clear(): void {
    this.stopHealthChecks();
    this.proxies.clear();
    this.rotationIndex = 0;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private getCandidates(options?: GetProxyOptions): ProxyEntry[] {
    let candidates = Array.from(this.proxies.values());

    if (options?.healthyOnly !== false) {
      candidates = candidates.filter((p) => p.healthy);
    }

    if (options?.location) {
      const locationCandidates = candidates.filter(
        (p) => p.location?.toLowerCase() === options.location!.toLowerCase(),
      );
      // Fall back to all healthy candidates if no location match
      if (locationCandidates.length > 0) {
        candidates = locationCandidates;
      }
    }

    return candidates;
  }
}

/** Parse a proxy server URL into hostname and port */
function parseProxyUrl(server: string): { hostname: string; port: number } | null {
  try {
    // Handle socks5://host:port format
    const normalized = server.replace(/^socks5:\/\//, "http://");
    const url = new URL(normalized);
    const port = url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 1080;
    return { hostname: url.hostname, port };
  } catch (error) {
    logger.debug("Failed to parse proxy URL", { server, error });
    return null;
  }
}
