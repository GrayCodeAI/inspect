// ──────────────────────────────────────────────────────────────────────────────
// @inspect/network - Cloudflare Tunnel Manager
// ──────────────────────────────────────────────────────────────────────────────

import { spawn, type ChildProcess } from "node:child_process";
import { createLogger } from "@inspect/observability";

const logger = createLogger("network/cloudflare");

/** Active tunnel information */
export interface TunnelInfo {
  /** Local port being tunneled */
  port: number;
  /** Public URL assigned by Cloudflare */
  publicUrl: string;
  /** The cloudflared child process */
  process: ChildProcess;
  /** Process PID */
  pid: number;
  /** When the tunnel was created */
  createdAt: number;
  /** Current status */
  status: "starting" | "running" | "stopping" | "stopped" | "error";
  /** Error message if status is "error" */
  error?: string;
}

/** Options for creating a tunnel */
export interface TunnelOptions {
  /** Protocol to use (default: http) */
  protocol?: "http" | "https";
  /** Hostname to bind to (default: localhost) */
  hostname?: string;
  /** Path to cloudflared binary (default: "cloudflared" in PATH) */
  cloudflaredPath?: string;
  /** Timeout in ms to wait for tunnel URL (default: 30000) */
  timeoutMs?: number;
  /** Additional cloudflared arguments */
  extraArgs?: string[];
}

/**
 * TunnelManager creates and manages Cloudflare Quick Tunnels
 * using the cloudflared binary. Each tunnel exposes a local port
 * via a public Cloudflare URL.
 */
export class TunnelManager {
  private tunnels: Map<number, TunnelInfo> = new Map();
  private cleanupRegistered: boolean = false;
  private defaultCloudflaredPath: string;

  constructor(options?: { cloudflaredPath?: string }) {
    this.defaultCloudflaredPath = options?.cloudflaredPath ?? "cloudflared";
  }

  /**
   * Create a new tunnel for a local port.
   * Launches cloudflared as a child process and waits for the public URL.
   *
   * @param port - Local port to tunnel
   * @param options - Tunnel configuration options
   * @returns The public URL for the tunnel
   */
  async createTunnel(
    port: number,
    options?: TunnelOptions,
  ): Promise<string> {
    // Check if tunnel already exists for this port
    const existing = this.tunnels.get(port);
    if (existing && existing.status === "running") {
      return existing.publicUrl;
    }

    const protocol = options?.protocol ?? "http";
    const hostname = options?.hostname ?? "localhost";
    const cloudflaredPath = options?.cloudflaredPath ?? this.defaultCloudflaredPath;
    const timeoutMs = options?.timeoutMs ?? 30_000;
    const extraArgs = options?.extraArgs ?? [];

    const targetUrl = `${protocol}://${hostname}:${port}`;

    // Register cleanup on first tunnel
    this.registerCleanupHandlers();

    const tunnelInfo: TunnelInfo = {
      port,
      publicUrl: "",
      process: null!,
      pid: 0,
      createdAt: Date.now(),
      status: "starting",
    };

    this.tunnels.set(port, tunnelInfo);

    return new Promise<string>((resolve, reject) => {
      const args = [
        "tunnel",
        "--url",
        targetUrl,
        "--no-autoupdate",
        ...extraArgs,
      ];

      const child = spawn(cloudflaredPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });

      tunnelInfo.process = child;
      tunnelInfo.pid = child.pid ?? 0;

      let stderr = "";
      let resolved = false;

      // Timeout handler
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          tunnelInfo.status = "error";
          tunnelInfo.error = `Timeout waiting for tunnel URL after ${timeoutMs}ms`;
          this.killProcess(child);
          reject(new Error(tunnelInfo.error));
        }
      }, timeoutMs);

      // cloudflared outputs the public URL on stderr
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();

        // Look for the trycloudflare.com URL in output
        const urlMatch = stderr.match(
          /https?:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/,
        );
        if (urlMatch && !resolved) {
          resolved = true;
          clearTimeout(timer);
          tunnelInfo.publicUrl = urlMatch[0];
          tunnelInfo.status = "running";
          resolve(urlMatch[0]);
        }
      });

      // Also check stdout in case output goes there
      child.stdout?.on("data", (chunk: Buffer) => {
        const output = chunk.toString();
        const urlMatch = output.match(
          /https?:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/,
        );
        if (urlMatch && !resolved) {
          resolved = true;
          clearTimeout(timer);
          tunnelInfo.publicUrl = urlMatch[0];
          tunnelInfo.status = "running";
          resolve(urlMatch[0]);
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        tunnelInfo.status = "error";
        tunnelInfo.error = err.message;
        if (!resolved) {
          resolved = true;
          reject(
            new Error(
              `Failed to start cloudflared: ${err.message}. ` +
                `Make sure cloudflared is installed and in your PATH.`,
            ),
          );
        }
      });

      child.on("exit", (code, signal) => {
        clearTimeout(timer);
        if (tunnelInfo.status !== "stopping") {
          tunnelInfo.status = "stopped";
        }
        if (!resolved) {
          resolved = true;
          reject(
            new Error(
              `cloudflared exited unexpectedly with code ${code} (signal: ${signal}). stderr: ${stderr.slice(0, 500)}`,
            ),
          );
        }
      });
    });
  }

  /**
   * List all active tunnels.
   */
  listTunnels(): TunnelInfo[] {
    return Array.from(this.tunnels.values());
  }

  /**
   * Stop a tunnel for a specific port.
   *
   * @param port - The local port whose tunnel should be stopped
   * @returns true if the tunnel was found and stopped
   */
  stopTunnel(port: number): boolean {
    const tunnel = this.tunnels.get(port);
    if (!tunnel) return false;

    tunnel.status = "stopping";
    this.killProcess(tunnel.process);
    tunnel.status = "stopped";
    this.tunnels.delete(port);
    return true;
  }

  /**
   * Stop all tunnels and clean up resources.
   */
  async cleanup(): Promise<void> {
    const ports = Array.from(this.tunnels.keys());
    for (const port of ports) {
      this.stopTunnel(port);
    }
    this.tunnels.clear();
  }

  /**
   * Get a tunnel by its local port.
   */
  getTunnel(port: number): TunnelInfo | undefined {
    return this.tunnels.get(port);
  }

  /**
   * Get the number of active tunnels.
   */
  get activeCount(): number {
    let count = 0;
    for (const tunnel of this.tunnels.values()) {
      if (tunnel.status === "running") count++;
    }
    return count;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private killProcess(child: ChildProcess): void {
    try {
      if (child.killed) return;

      // Try graceful SIGTERM first
      child.kill("SIGTERM");

      // Force kill after 3 seconds if still running
      const forceKillTimer = setTimeout(() => {
        try {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        } catch (error) {
          logger.debug("Force kill failed, process already dead", { error });
        }
      }, 3000);

      child.on("exit", () => {
        clearTimeout(forceKillTimer);
      });
    } catch (error) {
      logger.debug("Process kill failed, may already be dead", { error });
    }
  }

  private registerCleanupHandlers(): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;

    const cleanup = () => {
      for (const tunnel of this.tunnels.values()) {
        try {
          if (!tunnel.process.killed) {
            tunnel.process.kill("SIGKILL");
          }
        } catch (error) {
          logger.debug("Tunnel cleanup kill failed", { error });
        }
      }
    };

    process.on("exit", cleanup);
    process.on("SIGINT", () => {
      cleanup();
      process.exit(130);
    });
    process.on("SIGTERM", () => {
      cleanup();
      process.exit(143);
    });
    process.on("uncaughtException", (err) => {
      cleanup();
      logger.error("Uncaught exception", { error: err });
      process.exit(1);
    });
  }
}
