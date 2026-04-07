import { Effect } from "effect";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MIN_TIMEOUT_MS = 100;
const MIN_MEMORY_MB = 64;
const MAX_MEMORY_MB = 8192;
const MIN_CPU_PERCENT = 1;
const MAX_CPU_PERCENT = 100;

const _RuntimeSchema = {
  node: "node",
  python: "python",
  bash: "bash",
} as const;

export interface SandboxConfig {
  runtime: "node" | "python" | "bash";
  timeout: number;
  maxMemory: number;
  maxCpu: number;
  cwd?: string;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  memoryUsed: number;
  timedOut: boolean;
}

export interface RuntimeInfo {
  available: boolean;
  version: string;
}

class InvalidConfigError extends Error {
  readonly _tag = "InvalidConfigError";
  constructor(readonly reason: string) {
    super(`Invalid config: ${reason}`);
  }
}

class RuntimeNotFoundError extends Error {
  readonly _tag = "RuntimeNotFoundError";
  constructor(readonly runtime: string) {
    super(`Runtime not found: ${runtime}`);
  }
}

class SandboxExecutionError extends Error {
  readonly _tag = "SandboxExecutionError";
  constructor(
    readonly code: string,
    readonly exitCode: number,
    readonly stderr: string,
  ) {
    super(`Execution failed: ${stderr}`);
  }
}

class SandboxTimeoutError extends Error {
  readonly _tag = "SandboxTimeoutError";
  constructor(
    readonly runtime: string,
    readonly timeout: number,
  ) {
    super(`Execution timed out after ${timeout}ms`);
  }
}

const buildNodeCommand = (config: SandboxConfig, tempFilePath: string): string => {
  return `node --max-old-space-size=${config.maxMemory} "${tempFilePath}"`;
};

const buildBashCommand = (_config: SandboxConfig, tempFilePath: string): string => {
  return `bash "${tempFilePath}"`;
};

const buildPythonCommand = (_config: SandboxConfig, tempFilePath: string): string => {
  return `python3 "${tempFilePath}"`;
};

const checkRuntimeAvailability = (runtime: string): RuntimeInfo => {
  const command =
    runtime === "node"
      ? "node --version"
      : runtime === "python"
        ? "python3 --version"
        : "bash --version";

  try {
    const result = execSync(command, { timeout: 5000 });
    return { available: true, version: result.toString().trim().split("\n")[0] };
  } catch {
    return { available: false, version: "unavailable" };
  }
};

const validateConfig = (config: SandboxConfig): void => {
  if (config.timeout < MIN_TIMEOUT_MS) {
    throw new InvalidConfigError(`Timeout must be at least ${MIN_TIMEOUT_MS}ms`);
  }
  if (config.maxMemory < MIN_MEMORY_MB || config.maxMemory > MAX_MEMORY_MB) {
    throw new InvalidConfigError(
      `Memory must be between ${MIN_MEMORY_MB}MB and ${MAX_MEMORY_MB}MB`,
    );
  }
  if (config.maxCpu < MIN_CPU_PERCENT || config.maxCpu > MAX_CPU_PERCENT) {
    throw new InvalidConfigError(`CPU must be between ${MIN_CPU_PERCENT}% and ${MAX_CPU_PERCENT}%`);
  }

  const runtimeInfo = checkRuntimeAvailability(config.runtime);
  if (!runtimeInfo.available) {
    throw new RuntimeNotFoundError(config.runtime);
  }
};

export const execute = Effect.fn("SandboxExecutor.execute")(function* (
  code: string,
  configInput: Partial<SandboxConfig>,
) {
  const config: SandboxConfig = {
    runtime: configInput.runtime ?? "node",
    timeout: configInput.timeout ?? 30000,
    maxMemory: configInput.maxMemory ?? 512,
    maxCpu: configInput.maxCpu ?? 100,
    cwd: configInput.cwd,
  };

  yield* Effect.annotateCurrentSpan({ runtime: config.runtime, timeout: config.timeout });

  try {
    validateConfig(config);
  } catch (e) {
    if (e instanceof InvalidConfigError || e instanceof RuntimeNotFoundError) {
      return yield* Effect.fail(e);
    }
    throw e;
  }

  const buildCommand =
    config.runtime === "node"
      ? buildNodeCommand
      : config.runtime === "bash"
        ? buildBashCommand
        : buildPythonCommand;

  const scriptName =
    config.runtime === "node" ? "script.js" : config.runtime === "bash" ? "script.sh" : "script.py";

  const tempDir = mkdtempSync(join(tmpdir(), `sandbox-${config.runtime}-`));
  const tempFilePath = join(tempDir, scriptName);

  try {
    writeFileSync(tempFilePath, code);
    const command = buildCommand(config, tempFilePath);
    const startTime = Date.now();

    try {
      const result = execSync(command, {
        cwd: config.cwd,
        timeout: config.timeout,
        killSignal: "SIGKILL",
      });

      const duration = Date.now() - startTime;

      return {
        stdout: result.toString(),
        stderr: "",
        exitCode: 0,
        duration,
        memoryUsed: 0,
        timedOut: false,
      };
    } catch (error: unknown) {
      const execError = error as NodeJS.ErrnoException & {
        stdout?: Buffer;
        stderr?: Buffer;
        code?: string;
      };

      if (execError.code === "ETIMEDOUT") {
        return yield* Effect.fail(new SandboxTimeoutError(config.runtime, config.timeout));
      }

      return yield* Effect.fail(
        new SandboxExecutionError(code, 1, execError.stderr?.toString() ?? String(error)),
      );
    }
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
});

export const executeFile = Effect.fn("SandboxExecutor.executeFile")(function* (
  filePath: string,
  config: Partial<SandboxConfig>,
) {
  const fs = yield* Effect.tryPromise({
    try: () => import("fs/promises"),
    catch: (e) => new SandboxExecutionError(filePath, -1, String(e)),
  });

  const fileContent = yield* Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf-8"),
    catch: (e) => new SandboxExecutionError(filePath, -1, `Failed to read file: ${String(e)}`),
  });

  return yield* execute(fileContent, config);
});

export const getRuntimeInfo = Effect.fn("SandboxExecutor.getRuntimeInfo")(function* (
  runtime: string,
) {
  return checkRuntimeAvailability(runtime);
});
