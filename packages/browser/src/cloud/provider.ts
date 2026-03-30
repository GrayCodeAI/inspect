import { createLogger } from "@inspect/observability";

const logger = createLogger("browser/cloud");

export interface CloudBrowserConfig {
  provider: "browserbase" | "steel" | "custom";
  apiKey?: string;
  cdpUrl?: string;
  region?: string;
  proxy?: {
    country: string;
    type: "residential" | "datacenter";
  };
  session: {
    maxDuration: number;
    keepAlive: boolean;
    retryOnDisconnect: boolean;
  };
}

export interface CloudSession {
  id: string;
  cdpEndpoint: string;
  provider: string;
  region?: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Cloud browser provider for remote browser execution.
 * Supports Browserbase, Steel Browser, and custom CDP endpoints.
 */
export class CloudBrowserProvider {
  private config: CloudBrowserConfig;
  private sessions = new Map<string, CloudSession>();

  constructor(config: CloudBrowserConfig) {
    this.config = config;
  }

  /**
   * Create a new cloud browser session.
   */
  async createSession(): Promise<CloudSession> {
    const now = Date.now();
    let cdpEndpoint: string;

    if (this.config.cdpUrl) {
      cdpEndpoint = this.config.cdpUrl;
    } else if (this.config.provider === "browserbase") {
      cdpEndpoint = await this.createBrowserbaseSession();
    } else if (this.config.provider === "steel") {
      cdpEndpoint = await this.createSteelSession();
    } else {
      throw new Error(`Unknown cloud provider: ${this.config.provider}`);
    }

    const session: CloudSession = {
      id: generateId(),
      cdpEndpoint,
      provider: this.config.provider,
      region: this.config.region,
      createdAt: now,
      expiresAt: now + this.config.session.maxDuration,
    };

    this.sessions.set(session.id, session);
    logger.info("Cloud session created", { id: session.id, provider: this.config.provider });
    return session;
  }

  /**
   * Get session by ID.
   */
  getSession(id: string): CloudSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * List all active sessions.
   */
  listSessions(): CloudSession[] {
    return [...this.sessions.values()];
  }

  /**
   * Destroy a session.
   */
  async destroySession(id: string): Promise<void> {
    this.sessions.delete(id);
    logger.info("Cloud session destroyed", { id });
  }

  /**
   * Get available regions.
   */
  getAvailableRegions(): string[] {
    return ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"];
  }

  private async createBrowserbaseSession(): Promise<string> {
    // In production, this would call the Browserbase API
    const response = await fetch("https://api.browserbase.com/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": this.config.apiKey ?? "",
      },
      body: JSON.stringify({
        region: this.config.region ?? "us-east-1",
        proxy: this.config.proxy,
      }),
    });

    if (!response.ok) {
      throw new Error(`Browserbase session creation failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { connectUrl: string };
    return data.connectUrl;
  }

  private async createSteelSession(): Promise<string> {
    // In production, this would call the Steel API
    const response = await fetch("https://api.steel.dev/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey ?? ""}`,
      },
      body: JSON.stringify({
        region: this.config.region,
      }),
    });

    if (!response.ok) {
      throw new Error(`Steel session creation failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { websocketUrl: string };
    return data.websocketUrl;
  }
}

function generateId(): string {
  return `cloud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Session pool manager for cloud browsers.
 * Pre-creates and manages a pool of cloud browser sessions for
 * fast acquisition and automatic failover.
 */
export interface PoolConfig {
  /** Minimum sessions to keep warm (default: 1) */
  minSize: number;
  /** Maximum pool size (default: 5) */
  maxSize: number;
  /** Session timeout in ms (default: 5 minutes) */
  sessionTimeout: number;
  /** Health check interval in ms (default: 30 seconds) */
  healthCheckInterval: number;
}

export interface PoolHealth {
  total: number;
  available: number;
  inUse: number;
  unhealthy: number;
}

export class CloudSessionPool {
  private provider: CloudBrowserProvider;
  private config: PoolConfig;
  private available: CloudSession[] = [];
  private inUse = new Set<string>();
  private healthCheckTimer?: ReturnType<typeof setInterval>;

  constructor(provider: CloudBrowserProvider, config: Partial<PoolConfig> = {}) {
    this.provider = provider;
    this.config = {
      minSize: config.minSize ?? 1,
      maxSize: config.maxSize ?? 5,
      sessionTimeout: config.sessionTimeout ?? 300_000,
      healthCheckInterval: config.healthCheckInterval ?? 30_000,
    };
  }

  /**
   * Acquire a session from the pool. Creates one if needed.
   */
  async acquire(): Promise<CloudSession> {
    // Reuse available session
    while (this.available.length > 0) {
      const session = this.available.pop()!;
      if (Date.now() - session.createdAt < this.config.sessionTimeout) {
        this.inUse.add(session.id);
        return session;
      }
      // Session expired, destroy it
      await this.provider.destroySession(session.id).catch(() => {});
    }

    // Create new session if under max
    const allCount = this.available.length + this.inUse.size;
    if (allCount < this.config.maxSize) {
      const session = await this.provider.createSession();
      this.inUse.add(session.id);
      return session;
    }

    throw new Error("Cloud session pool exhausted");
  }

  /**
   * Release a session back to the pool.
   */
  release(session: CloudSession): void {
    this.inUse.delete(session.id);
    if (Date.now() - session.createdAt < this.config.sessionTimeout) {
      this.available.push(session);
    }
  }

  /**
   * Pre-create sessions to warm up the pool.
   */
  async warmUp(count?: number): Promise<void> {
    const target = count ?? this.config.minSize;
    const toCreate = Math.max(0, target - this.available.length);

    const promises = Array.from({ length: toCreate }, async () => {
      try {
        const session = await this.provider.createSession();
        this.available.push(session);
      } catch {
        /* best effort */
      }
    });

    await Promise.all(promises);
  }

  /**
   * Run health checks on available sessions.
   */
  async healthCheck(): Promise<PoolHealth> {
    const healthy: CloudSession[] = [];
    let unhealthy = 0;

    for (const session of this.available) {
      try {
        const retrieved = await this.provider.getSession(session.id);
        if (retrieved) {
          healthy.push(session);
        } else {
          unhealthy++;
        }
      } catch {
        unhealthy++;
      }
    }

    this.available = healthy;

    return {
      total: this.available.length + this.inUse.size,
      available: this.available.length,
      inUse: this.inUse.size,
      unhealthy,
    };
  }

  /**
   * Start periodic health checks.
   */
  startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.healthCheck().catch(() => {});
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health checks and destroy all sessions.
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    const allSessions = [...this.available];
    this.available = [];
    this.inUse.clear();

    await Promise.allSettled(allSessions.map((s) => this.provider.destroySession(s.id)));
  }

  /**
   * Get pool metrics.
   */
  getMetrics(): PoolHealth & { config: PoolConfig } {
    return {
      total: this.available.length + this.inUse.size,
      available: this.available.length,
      inUse: this.inUse.size,
      unhealthy: 0,
      config: this.config,
    };
  }
}
