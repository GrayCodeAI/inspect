// iOS Simulator Support — list, boot simulators, manage WebDriver sessions
import { execSync } from "node:child_process";
import { createLogger } from "@inspect/observability";

const logger = createLogger("browser/ios");

export interface IosDevice {
  udid: string;
  name: string;
  state: "Booted" | "Shutdown" | "Booting";
  platformVersion: string;
  deviceType: string;
}

export interface IosSession {
  udid: string;
  sessionId: string;
  baseUrl: string;
  webDriverUrl: string;
}

export class IosSimulatorManager {
  async listSimulators(): Promise<IosDevice[]> {
    if (process.platform !== "darwin") {
      logger.warn("iOS simulators only available on macOS");
      return [];
    }

    try {
      const output = execSync("xcrun simctl list devices available --json", { encoding: "utf-8" });
      const data = JSON.parse(output) as {
        devices: Record<
          string,
          Array<{
            udid: string;
            name: string;
            state: string;
            deviceTypeIdentifier?: string;
          }>
        >;
      };

      const devices: IosDevice[] = [];
      for (const [runtime, sims] of Object.entries(data.devices)) {
        for (const sim of sims) {
          const versionMatch = runtime.match(/(\d+-\d+)$/);
          devices.push({
            udid: sim.udid,
            name: sim.name,
            state: sim.state as IosDevice["state"],
            platformVersion: versionMatch ? versionMatch[1].replace("-", ".") : runtime,
            deviceType: sim.deviceTypeIdentifier ?? "unknown",
          });
        }
      }
      return devices;
    } catch (error) {
      logger.error("Failed to list iOS simulators", { error: String(error) });
      return [];
    }
  }

  async bootSimulator(udid: string): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    try {
      execSync(`xcrun simctl boot "${udid}"`, { encoding: "utf-8" });
      logger.info("Simulator booted", { udid });
      return true;
    } catch {
      // May already be booted
      return true;
    }
  }

  async shutdownSimulator(udid: string): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    try {
      execSync(`xcrun simctl shutdown "${udid}"`, { encoding: "utf-8" });
      logger.info("Simulator shutdown", { udid });
      return true;
    } catch {
      return false;
    }
  }

  async openUrl(udid: string, url: string): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    try {
      execSync(`xcrun simctl openurl "${udid}" "${url}"`, { encoding: "utf-8" });
      logger.info("URL opened in simulator", { udid, url });
      return true;
    } catch {
      return false;
    }
  }

  async getAppContainer(udid: string, bundleId: string): Promise<string | null> {
    if (process.platform !== "darwin") return null;
    try {
      return execSync(`xcrun simctl get_app_container "${udid}" "${bundleId}"`, {
        encoding: "utf-8",
      }).trim();
    } catch {
      return null;
    }
  }
}

export class IosWebDriverClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async createSession(capabilities: Record<string, unknown> = {}): Promise<string> {
    const response = await fetch(`${this.baseUrl}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capabilities }),
    });
    const data = (await response.json()) as { value: { sessionId: string } };
    return data.value.sessionId;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await fetch(`${this.baseUrl}/session/${sessionId}`, { method: "DELETE" });
  }

  async getPageSource(sessionId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/session/${sessionId}/source`);
    const data = (await response.json()) as { value: string };
    return data.value;
  }

  async executeScript(sessionId: string, script: string, args: unknown[] = []): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/session/${sessionId}/execute/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script, args }),
    });
    const data = (await response.json()) as { value: unknown };
    return data.value;
  }

  async tap(x: number, y: number): Promise<void> {
    await fetch(`${this.baseUrl}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actions: [
          {
            type: "pointer",
            actions: [
              { type: "pointerMove", x, y },
              { type: "pointerDown", button: 0 },
              { type: "pointerUp", button: 0 },
            ],
          },
        ],
      }),
    });
  }

  async swipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs = 300,
  ): Promise<void> {
    await fetch(`${this.baseUrl}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actions: [
          {
            type: "pointer",
            actions: [
              { type: "pointerMove", x: startX, y: startY },
              { type: "pointerDown", button: 0 },
              { type: "pointerMove", x: endX, y: endY, duration: durationMs },
              { type: "pointerUp", button: 0 },
            ],
          },
        ],
      }),
    });
  }
}
