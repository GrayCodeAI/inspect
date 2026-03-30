// CDP Auto-Discovery — scan for running Chrome instances
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "@inspect/observability";

const logger = createLogger("browser/cdp-discovery");

export interface CdpEndpoint {
  url: string;
  browser: string;
  userAgent?: string;
  webSocketDebuggerUrl?: string;
  source: "port-scan" | "user-data" | "process";
}

const COMMON_PORTS = [9222, 9223, 9224, 9225, 9229, 9230];
const CHROME_DATA_DIRS: Record<string, string[]> = {
  linux: [
    join(homedir(), ".config/google-chrome"),
    join(homedir(), ".config/chromium"),
    join(homedir(), ".config/brave-browser"),
    join(homedir(), ".config/microsoft-edge"),
  ],
  darwin: [
    join(homedir(), "Library/Application Support/Google/Chrome"),
    join(homedir(), "Library/Application Support/Chromium"),
    join(homedir(), "Library/Application Support/BraveSoftware/Brave-Browser"),
    join(homedir(), "Library/Application Support/Microsoft Edge"),
  ],
  win32: [
    join(homedir(), "AppData/Local/Google/Chrome/User Data"),
    join(homedir(), "AppData/Local/Chromium/User Data"),
    join(homedir(), "AppData/Local/Microsoft/Edge/User Data"),
  ],
};

export async function autoDiscoverCdp(): Promise<CdpEndpoint | null> {
  // 1. Try port scanning
  for (const port of COMMON_PORTS) {
    const endpoint = await probeCdpPort("127.0.0.1", port);
    if (endpoint) return endpoint;
  }

  // 2. Try known Chrome DevTools config paths
  const configPaths = [
    join(homedir(), ".config/google-chrome/DevToolsActivePort"),
    join(homedir(), ".config/chromium/DevToolsActivePort"),
  ];
  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8").trim();
        const lines = content.split("\n");
        if (lines.length > 0) {
          const port = parseInt(lines[0], 10);
          if (!isNaN(port)) {
            const endpoint = await probeCdpPort("127.0.0.1", port);
            if (endpoint) return endpoint;
          }
        }
      } catch {
        /* skip */
      }
    }
  }

  return null;
}

export async function probeCdpPort(host: string, port: number): Promise<CdpEndpoint | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);

    const response = await fetch(`http://${host}:${port}/json/version`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = (await response.json()) as {
      Browser?: string;
      "User-Agent"?: string;
      webSocketDebuggerUrl?: string;
    };

    return {
      url: `http://${host}:${port}`,
      browser: data.Browser ?? "Unknown Chrome",
      userAgent: data["User-Agent"],
      webSocketDebuggerUrl: data.webSocketDebuggerUrl,
      source: "port-scan",
    };
  } catch {
    return null;
  }
}

export async function listCdpTargets(
  host: string,
  port: number,
): Promise<
  Array<{
    id: string;
    title: string;
    url: string;
    type: string;
    webSocketDebuggerUrl: string;
  }>
> {
  try {
    const response = await fetch(`http://${host}:${port}/json/list`);
    if (!response.ok) return [];
    return (await response.json()) as Array<{
      id: string;
      title: string;
      url: string;
      type: string;
      webSocketDebuggerUrl: string;
    }>;
  } catch {
    return [];
  }
}

export function getKnownBrowserProfiles(): string[] {
  const platform =
    process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
  return CHROME_DATA_DIRS[platform] ?? [];
}
