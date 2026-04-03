// ──────────────────────────────────────────────────────────────────────────────
// TunnelManager — Secure tunnel for cloud agent control of local browser
// Wraps Cloudflare Tunnel / ngrok for remote browser access
// ──────────────────────────────────────────────────────────────────────────────

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface TunnelConfig {
  provider: "ngrok" | "cloudflare" | "localtunnel";
  port: number;
  authToken?: string;
  subdomain?: string;
}

export interface TunnelResult {
  url: string;
  publicUrl: string;
  provider: string;
}

export class TunnelManager {
  private process: import("node:child_process").ChildProcess | null = null;
  private tunnelUrl = "";

  constructor(private config: TunnelConfig) {}

  /** Start a tunnel to expose the local browser port. */
  async start(): Promise<TunnelResult> {
    switch (this.config.provider) {
      case "ngrok":
        return this.startNgrok();
      case "cloudflare":
        return this.startCloudflare();
      case "localtunnel":
        return this.startLocaltunnel();
      default:
        return this.startLocaltunnel();
    }
  }

  /** Stop the active tunnel. */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
    this.tunnelUrl = "";
  }

  /** Get the current tunnel public URL. */
  getPublicUrl(): string {
    return this.tunnelUrl;
  }

  private async startNgrok(): Promise<TunnelResult> {
    const args = ["ngrok", "http", String(this.config.port)];
    if (this.config.authToken) {
      await execAsync(`ngrok config add-authtoken ${this.config.authToken}`);
    }
    if (this.config.subdomain) {
      args.push("--subdomain", this.config.subdomain);
    }

    this.process = exec(args.join(" ")).child;

    // Ngrok prints the URL to stdout — wait for it
    this.tunnelUrl = await this.waitForUrl("https://[a-z0-9-]+\\.ngrok-free\\.app");
    return {
      url: `http://localhost:${this.config.port}`,
      publicUrl: this.tunnelUrl,
      provider: "ngrok",
    };
  }

  private async startCloudflare(): Promise<TunnelResult> {
    this.process = exec(`cloudflared tunnel --url http://localhost:${this.config.port}`).child;

    this.tunnelUrl = await this.waitForUrl("https://[a-z0-9-]+\\.trycloudflare\\.com");
    return {
      url: `http://localhost:${this.config.port}`,
      publicUrl: this.tunnelUrl,
      provider: "cloudflare",
    };
  }

  private async startLocaltunnel(): Promise<TunnelResult> {
    const args = ["lt", "--port", String(this.config.port)];
    if (this.config.subdomain) {
      args.push("--subdomain", this.config.subdomain);
    }

    this.process = exec(args.join(" ")).child;

    this.tunnelUrl = await this.waitForUrl("https://[a-z0-9-]+\\.loca\\.lt");
    return {
      url: `http://localhost:${this.config.port}`,
      publicUrl: this.tunnelUrl,
      provider: "localtunnel",
    };
  }

  private waitForUrl(pattern: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Tunnel timeout")), 30000);
      const regex = new RegExp(pattern);

      if (this.process?.stdout) {
        this.process.stdout.on("data", (data: Buffer) => {
          const match = data.toString().match(regex);
          if (match) {
            clearTimeout(timeout);
            resolve(match[0]);
          }
        });
      }

      if (this.process?.stderr) {
        this.process.stderr.on("data", (data: Buffer) => {
          const match = data.toString().match(regex);
          if (match) {
            clearTimeout(timeout);
            resolve(match[0]);
          }
        });
      }
    });
  }
}
