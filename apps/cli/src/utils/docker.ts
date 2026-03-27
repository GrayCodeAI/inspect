import { execFile as execFileCb, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const execFile = promisify(execFileCb);

const CONTAINER_NAME = "inspect-engine";
const IMAGE_NAME = "inspect:latest";
const STATE_FILE = join(homedir(), ".inspect", "docker-state.json");
const CONTAINER_PORT = 3000;
const HOST_PORT_DEFAULT = 4100;

interface DockerState {
  containerId: string;
  port: number;
  startedAt: string;
  imageId: string;
}

/**
 * Check if Docker is installed and running.
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFile("docker", ["info"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the Inspect Docker image exists.
 */
export async function hasImage(): Promise<boolean> {
  try {
    const { stdout } = await execFile("docker", ["images", "-q", IMAGE_NAME]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Build the Inspect Docker image from the project root.
 */
export async function buildImage(projectRoot: string, onProgress?: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [
      "build",
      "-f", join(projectRoot, "docker", "Dockerfile"),
      "-t", IMAGE_NAME,
      projectRoot,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    child.stdout.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line && onProgress) onProgress(line);
    });

    child.stderr.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line && onProgress) onProgress(line);
    });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Docker build failed with exit code ${code}`));
    });

    child.on("error", reject);
  });
}

/**
 * Get the running Inspect container, or null if not running.
 */
export async function getRunningContainer(): Promise<DockerState | null> {
  try {
    const { stdout } = await execFile("docker", [
      "ps", "--filter", `name=${CONTAINER_NAME}`, "--format", "{{.ID}}",
    ]);
    const id = stdout.trim();
    if (!id) return null;

    // Read saved state
    const state = loadState();
    if (state && state.containerId.startsWith(id)) return state;

    // Container exists but no state — inspect it
    const { stdout: portOut } = await execFile("docker", [
      "port", CONTAINER_NAME, String(CONTAINER_PORT),
    ]);
    const portMatch = portOut.match(/:(\d+)/);
    const port = portMatch ? parseInt(portMatch[1], 10) : HOST_PORT_DEFAULT;

    return { containerId: id, port, startedAt: new Date().toISOString(), imageId: "" };
  } catch {
    return null;
  }
}

/**
 * Ensure the Inspect container is running.
 * Starts it if not already running. Returns the container state.
 */
export async function ensureContainer(options?: {
  projectRoot?: string;
  port?: number;
  envVars?: Record<string, string>;
  onProgress?: (msg: string) => void;
}): Promise<DockerState> {
  const log = options?.onProgress ?? (() => {});

  // Check if already running
  const existing = await getRunningContainer();
  if (existing) {
    log("Inspect engine already running");
    return existing;
  }

  // Check Docker is available
  if (!(await isDockerAvailable())) {
    throw new Error(
      "Docker is not installed or not running.\n" +
      "Install Docker: https://docs.docker.com/get-docker/\n" +
      "Or run without Docker (Playwright must be installed locally)."
    );
  }

  // Check/build image
  if (!(await hasImage())) {
    const root = options?.projectRoot ?? findProjectRoot();
    if (root) {
      log("Building Inspect Docker image (first time only)...");
      await buildImage(root, (line) => log(`  ${line.slice(0, 80)}`));
    } else {
      throw new Error(
        `Docker image "${IMAGE_NAME}" not found.\n` +
        "Build it with: docker build -f docker/Dockerfile -t inspect ."
      );
    }
  }

  // Remove stopped container with same name
  try {
    await execFile("docker", ["rm", "-f", CONTAINER_NAME], { timeout: 5000 });
  } catch { /* may not exist */ }

  const port = options?.port ?? HOST_PORT_DEFAULT;

  // Build env args
  const envArgs: string[] = [];
  const envVars = options?.envVars ?? getDefaultEnvVars();
  for (const [key, value] of Object.entries(envVars)) {
    if (value) envArgs.push("-e", `${key}=${value}`);
  }

  log("Starting Inspect engine...");

  // Start container
  const { stdout } = await execFile("docker", [
    "run", "-d",
    "--name", CONTAINER_NAME,
    "-p", `${port}:${CONTAINER_PORT}`,
    ...envArgs,
    "-e", "NODE_ENV=production",
    "-e", "IN_DOCKER=true",
    "--restart", "unless-stopped",
    IMAGE_NAME,
  ]);

  const containerId = stdout.trim();

  // Wait for health check
  log("Waiting for engine to be ready...");
  await waitForHealthy(port, 30000);

  const state: DockerState = {
    containerId,
    port,
    startedAt: new Date().toISOString(),
    imageId: IMAGE_NAME,
  };

  saveState(state);
  log(`Inspect engine ready on port ${port}`);

  return state;
}

/**
 * Execute a CLI command inside the running container.
 */
export async function execInContainer(
  args: string[],
  options?: { timeout?: number; stream?: boolean },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const container = await getRunningContainer();
  if (!container) {
    throw new Error("Inspect container is not running. It will start automatically on next command.");
  }

  if (options?.stream) {
    return new Promise((resolve, reject) => {
      const child = spawn("docker", [
        "exec", CONTAINER_NAME,
        "node", "apps/cli/dist/index.js", ...args,
      ], { stdio: ["ignore", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(text);
      });

      child.stderr.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        process.stderr.write(text);
      });

      child.on("close", (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });

      child.on("error", reject);
    });
  }

  try {
    const { stdout, stderr } = await execFile("docker", [
      "exec", CONTAINER_NAME,
      "node", "apps/cli/dist/index.js", ...args,
    ], { timeout: options?.timeout ?? 300000 });

    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.code ?? 1 };
  }
}

/**
 * Stop the Inspect container.
 */
export async function stopContainer(): Promise<void> {
  try {
    await execFile("docker", ["stop", CONTAINER_NAME], { timeout: 15000 });
    await execFile("docker", ["rm", CONTAINER_NAME], { timeout: 5000 });
  } catch { /* container may not exist */ }
  clearState();
}

/**
 * Get container status info.
 */
export async function getContainerStatus(): Promise<{
  running: boolean;
  containerId?: string;
  port?: number;
  uptime?: string;
  imageId?: string;
}> {
  const state = await getRunningContainer();
  if (!state) return { running: false };

  return {
    running: true,
    containerId: state.containerId.slice(0, 12),
    port: state.port,
    uptime: state.startedAt,
    imageId: state.imageId,
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────

function getDefaultEnvVars(): Record<string, string> {
  return {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
    GOOGLE_AI_KEY: process.env.GOOGLE_AI_KEY ?? "",
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? "",
    INSPECT_LOG_LEVEL: process.env.INSPECT_LOG_LEVEL ?? "info",
    INSPECT_TELEMETRY: process.env.INSPECT_TELEMETRY ?? "false",
  };
}

async function waitForHealthy(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Container failed to become healthy within ${timeoutMs / 1000}s`);
}

function findProjectRoot(): string | null {
  // Look for docker/Dockerfile relative to cwd or script location
  const candidates = [
    process.cwd(),
    join(process.cwd(), ".."),
    join(__dirname, "../../../.."),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "docker", "Dockerfile"))) return dir;
  }
  return null;
}

function loadState(): DockerState | null {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    }
  } catch {}
  return null;
}

function saveState(state: DockerState): void {
  try {
    const dir = join(homedir(), ".inspect");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

function clearState(): void {
  try {
    const { unlinkSync } = require("node:fs");
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  } catch {}
}
