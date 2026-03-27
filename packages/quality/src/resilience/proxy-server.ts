// ──────────────────────────────────────────────────────────────────────────────
// @inspect/quality - Standalone TCP Proxy Server for Fault Injection
// ──────────────────────────────────────────────────────────────────────────────

import * as net from "node:net";
import * as http from "node:http";
import type {
  ProxyServerConfig,
  ProxyServerStatus,
  ToxicConfig,
  ToxicityPreset,
} from "@inspect/shared";

/** Toxicity presets for common network conditions */
export const TOXICITY_PRESETS: Record<string, ToxicityPreset> = {
  "slow-3g": {
    name: "Slow 3G",
    description: "Simulates slow 3G connection",
    toxics: [
      { type: "latency", name: "3g-latency", attributes: { latency: 2000, jitter: 500 } },
      { type: "bandwidth", name: "3g-bandwidth", attributes: { rate: 750 } },
    ],
  },
  "flaky-wifi": {
    name: "Flaky WiFi",
    description: "Simulates intermittent WiFi connection",
    toxics: [
      {
        type: "latency",
        name: "wifi-latency",
        attributes: { latency: 100, jitter: 200 },
        toxicity: 0.3,
      },
      { type: "timeout", name: "wifi-timeout", attributes: { timeout: 5000 }, toxicity: 0.1 },
      { type: "reset_peer", name: "wifi-reset", attributes: {}, toxicity: 0.05 },
    ],
  },
  offline: {
    name: "Offline",
    description: "Simulates complete network outage",
    toxics: [{ type: "timeout", name: "offline-timeout", attributes: { timeout: 1 } }],
  },
  "high-latency": {
    name: "High Latency",
    description: "Simulates high-latency connection",
    toxics: [
      { type: "latency", name: "high-latency", attributes: { latency: 5000, jitter: 1000 } },
    ],
  },
  "packet-loss": {
    name: "Packet Loss",
    description: "Simulates packet loss",
    toxics: [
      { type: "timeout", name: "packet-loss", attributes: { timeout: 3000 }, toxicity: 0.2 },
    ],
  },
};

/**
 * Standalone TCP proxy server for network-level fault injection.
 *
 * Unlike Playwright route-based interception, this provides true TCP-level
 * fault injection for any protocol (HTTP, WebSocket, etc.).
 *
 * Usage:
 * ```ts
 * const server = new ProxyServer({ port: 8080, upstream: "example.com:443" });
 * await server.start();
 * server.addToxic({ type: "latency", name: "slow", attributes: { latency: 1000 } });
 * // ... later
 * await server.stop();
 * ```
 */
export class ProxyServer {
  private config: ProxyServerConfig;
  private server: net.Server | null = null;
  private controlServer: http.Server | null = null;
  private toxics: ToxicConfig[] = [];
  private connections: Set<net.Socket> = new Set();
  private metrics = { totalConnections: 0, activeConnections: 0, bytesUp: 0, bytesDown: 0 };
  private groups: Map<string, string[]> = new Map();

  constructor(config: ProxyServerConfig) {
    this.config = config;
    if (config.toxics) {
      this.toxics = [...config.toxics];
    }
  }

  /**
   * Start the proxy server.
   */
  async start(controlPort?: number): Promise<void> {
    this.server = net.createServer((clientSocket) => {
      this.handleConnection(clientSocket);
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(this.config.port, () => resolve());
    });

    // Start control API on a separate port
    if (controlPort) {
      this.controlServer = http.createServer((req, res) => this.handleControlRequest(req, res));
      await new Promise<void>((resolve) => {
        this.controlServer!.listen(controlPort, () => resolve());
      });
    }
  }

  /**
   * Stop the proxy server.
   */
  async stop(): Promise<void> {
    for (const conn of this.connections) {
      conn.destroy();
    }
    this.connections.clear();

    if (this.controlServer) {
      await new Promise<void>((resolve) => {
        this.controlServer!.close(() => resolve());
      });
      this.controlServer = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
  }

  /**
   * Add a toxic (fault injection rule).
   */
  addToxic(toxic: ToxicConfig): void {
    this.toxics.push(toxic);
  }

  /**
   * Remove a toxic by name.
   */
  removeToxic(name: string): boolean {
    const index = this.toxics.findIndex((t) => t.name === name);
    if (index >= 0) {
      this.toxics.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Apply a toxicity preset.
   */
  applyPreset(presetName: string): boolean {
    const preset = TOXICITY_PRESETS[presetName];
    if (!preset) return false;
    this.toxics.push(...preset.toxics.map((t) => ({ ...t })));
    return true;
  }

  /**
   * Clear all toxics.
   */
  clearToxics(): void {
    this.toxics = [];
  }

  /**
   * Create a proxy group for coordinated fault injection.
   */
  createGroup(name: string, proxyNames: string[]): void {
    this.groups.set(name, proxyNames);
  }

  /**
   * Apply toxics to a group.
   */
  applyToxicToGroup(groupName: string, toxic: ToxicConfig): void {
    const proxies = this.groups.get(groupName);
    if (proxies) {
      proxies.forEach(() => this.addToxic(toxic));
    }
  }

  /**
   * Get server status.
   */
  getStatus(): ProxyServerStatus {
    return {
      name: this.config.name ?? "proxy",
      listen: `0.0.0.0:${this.config.port}`,
      upstream: this.config.upstream,
      enabled: this.server !== null,
      toxics: [...this.toxics],
    };
  }

  /**
   * Get server metrics.
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Get all available toxicity presets.
   */
  static getPresets(): Record<string, ToxicityPreset> {
    return { ...TOXICITY_PRESETS };
  }

  // ── Private methods ──────────────────────────────────────────────────

  private handleConnection(clientSocket: net.Socket): void {
    this.connections.add(clientSocket);
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;

    const [host, portStr] = this.config.upstream.split(":");
    const port = parseInt(portStr ?? "443", 10);

    const upstreamSocket = net.createConnection({ host, port }, () => {
      // Apply latency toxic
      const latencyToxic = this.toxics.find((t) => t.type === "latency");
      if (latencyToxic) {
        const latency = latencyToxic.attributes.latency as number;
        const jitter = (latencyToxic.attributes.jitter as number) ?? 0;
        const delay = latency + Math.random() * jitter;
        const toxicity = latencyToxic.toxicity ?? 1;

        if (Math.random() < toxicity) {
          clientSocket.pause();
          setTimeout(() => clientSocket.resume(), delay);
        }
      }

      // Pipe with bandwidth limiting
      const bandwidthToxic = this.toxics.find((t) => t.type === "bandwidth");
      if (bandwidthToxic) {
        const rate = bandwidthToxic.attributes.rate as number; // KB/s
        const chunkSize = rate * 1024;
        const interval = 1000;

        clientSocket.on("data", (data) => {
          for (let i = 0; i < data.length; i += chunkSize) {
            setTimeout(
              () => {
                upstreamSocket.write(data.subarray(i, i + chunkSize));
                this.metrics.bytesUp += Math.min(chunkSize, data.length - i);
              },
              (i / chunkSize) * interval,
            );
          }
        });
      } else {
        clientSocket.pipe(upstreamSocket);
        clientSocket.on("data", (data) => {
          this.metrics.bytesUp += data.length;
        });
      }

      upstreamSocket.pipe(clientSocket);
      upstreamSocket.on("data", (data) => {
        this.metrics.bytesDown += data.length;
      });
    });

    // Apply timeout toxic
    const timeoutToxic = this.toxics.find((t) => t.type === "timeout");
    if (timeoutToxic) {
      const timeout = timeoutToxic.attributes.timeout as number;
      clientSocket.setTimeout(timeout, () => {
        clientSocket.destroy();
      });
    }

    clientSocket.on("close", () => {
      this.connections.delete(clientSocket);
      this.metrics.activeConnections--;
      upstreamSocket.destroy();
    });

    clientSocket.on("error", () => {
      clientSocket.destroy();
      upstreamSocket.destroy();
    });

    upstreamSocket.on("error", () => {
      clientSocket.destroy();
      upstreamSocket.destroy();
    });
  }

  private handleControlRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? "/", `http://localhost:${this.config.port}`);

    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && url.pathname === "/status") {
      res.end(JSON.stringify(this.getStatus()));
      return;
    }

    if (req.method === "GET" && url.pathname === "/metrics") {
      res.end(JSON.stringify(this.getMetrics()));
      return;
    }

    if (req.method === "POST" && url.pathname === "/toxics") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const toxic = JSON.parse(body) as ToxicConfig;
          this.addToxic(toxic);
          res.statusCode = 201;
          res.end(JSON.stringify({ success: true, toxic }));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/toxics/")) {
      const name = url.pathname.slice("/toxics/".length);
      const removed = this.removeToxic(name);
      res.end(JSON.stringify({ success: removed }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/presets/apply") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const { preset } = JSON.parse(body) as { preset: string };
          const success = this.applyPreset(preset);
          res.end(JSON.stringify({ success }));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found" }));
  }
}
