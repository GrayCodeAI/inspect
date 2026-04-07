import { Effect, Layer, ServiceMap } from "effect";
import * as FileSystem from "effect/FileSystem";
import { exec } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { SandboxConfig, SandboxResult } from "./sandbox-types";
import {
  InvalidConfigError,
  RuntimeNotFoundError,
  SandboxExecutionError,
  SandboxTimeoutError,
} from "./sandbox-errors";

const execAsync = promisify(exec);

const MIN_TIMEOUT_MS = 100;
const MIN_MEMORY_MB = 64;
const MAX_MEMORY_MB = 8192;
const MIN_CPU_PERCENT = 1;
const MAX_CPU_PERCENT = 100;

interface RuntimeInfo {
  readonly available: boolean;
  readonly version: string;
}

interface SandboxExecutorService {
  readonly execute: (
    code: string,
    config: SandboxConfig,
  ) => Effect.Effect<
    SandboxResult,
    SandboxExecutionError | SandboxTimeoutError | RuntimeNotFoundError | InvalidConfigError
  >;
  readonly executeFile: (
    filePath: string,
    config: SandboxConfig,
  ) => Effect.Effect<
    SandboxResult,
    SandboxExecutionError | SandboxTimeoutError | RuntimeNotFoundError | InvalidConfigError
  >;
  readonly validateConfig: (
    config: SandboxConfig,
  ) => Effect.Effect<void, InvalidConfigError | RuntimeNotFoundError>;
  readonly getRuntimeInfo: (
    runtime: typeof SandboxConfig.fields.runtime.Type,
  ) => Effect.Effect<RuntimeInfo, RuntimeNotFoundError>;
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

const checkRuntimeAvailability = (runtime: typeof SandboxConfig.fields.runtime.Type) =>
  Effect.gen(function* () {
    const command =
      runtime === "node"
        ? "node --version"
        : runtime === "python"
          ? "python3 --version"
          : "bash --version";

    const result = yield* Effect.tryPromise({
      try: () => execAsync(command, { timeout: 5000 }),
      catch: () => new RuntimeNotFoundError({ runtime }),
    });

    const version = result.stdout.trim().split("\n")[0].trim();
    return { available: true, version } as const;
  }).pipe(
    Effect.catchTag("RuntimeNotFoundError", () =>
      Effect.succeed({ available: false, version: "unavailable" } as const),
    ),
  );

export class SandboxExecutor extends ServiceMap.Service<SandboxExecutor, SandboxExecutorService>()(
  "@inspect/SandboxExecutor",
  {
    make: Effect.gen(function* () {
      const fs = yield* FileSystem;

      const executeRuntime = (
        code: string,
        config: SandboxConfig,
        buildCommand: (config: SandboxConfig, tempFilePath: string) => string,
        scriptName: string,
      ) =>
        Effect.gen(function* () {
          const tempDir = yield* fs.makeTempDirectory({ prefix: `sandbox-${config.runtime}-` });

          yield* Effect.addFinalizer(() =>
            fs.remove(tempDir, { recursive: true }).pipe(Effect.catch(() => Effect.void)),
          );

          const tempFilePath = join(tempDir, scriptName);

          yield* fs.writeFileString(tempFilePath, code);

          const command = buildCommand(config, tempFilePath);

          const startTime = Date.now();

          const result = yield* Effect.tryPromise({
            try: () =>
              execAsync(command, {
                cwd: config.cwd,
                timeout: config.timeout,
                killSignal: "SIGKILL",
              }),
            catch: (error: unknown) => {
              const execError = error as NodeJS.ErrnoException & {
                stdout?: string;
                stderr?: string;
                code?: string;
              };

              if (execError.code === "ETIMEDOUT") {
                return new SandboxTimeoutError({
                  runtime: config.runtime,
                  timeout: config.timeout,
                });
              }

              return new SandboxExecutionError({
                code,
                exitCode: 1,
                stderr: execError.stderr ?? String(error),
              });
            },
          });

          const duration = Date.now() - startTime;

          if (result instanceof SandboxTimeoutError) {
            return yield* Effect.fail(result);
          }

          const executionResult = result as { stdout: string; stderr: string };

          return new SandboxResult({
            stdout: executionResult.stdout,
            stderr: executionResult.stderr,
            exitCode: 0,
            duration,
            memoryUsed: 0,
            timedOut: false,
          });
        }).pipe(
          Effect.scoped,
          Effect.catchTag("SandboxExecutionError", (err) => Effect.fail(err)),
          Effect.catchTag("SandboxTimeoutError", (err) => Effect.fail(err)),
          Effect.catchTag("PlatformError", (err) =>
            Effect.fail(
              new SandboxExecutionError({
                code,
                exitCode: -1,
                stderr: `Platform error: ${String(err)}`,
              }),
            ),
          ),
        );

      const execute = Effect.fn("SandboxExecutor.execute")(function* (
        code: string,
        config: SandboxConfig,
      ) {
        yield* Effect.annotateCurrentSpan({ runtime: config.runtime, timeout: config.timeout });

        yield* validateConfig(config);

        const buildCommand =
          config.runtime === "node"
            ? buildNodeCommand
            : config.runtime === "bash"
              ? buildBashCommand
              : buildPythonCommand;

        const scriptName =
          config.runtime === "node"
            ? "script.js"
            : config.runtime === "bash"
              ? "script.sh"
              : "script.py";

        const result = yield* executeRuntime(code, config, buildCommand, scriptName);

        return result;
      });

      const executeFile = Effect.fn("SandboxExecutor.executeFile")(function* (
        filePath: string,
        config: SandboxConfig,
      ) {
        yield* Effect.annotateCurrentSpan({ filePath, runtime: config.runtime });

        yield* validateConfig(config);

        const fileContent = yield* fs.readFileString(filePath).pipe(
          Effect.catchTag("PlatformError", (cause) =>
            new SandboxExecutionError({
              code: filePath,
              exitCode: -1,
              stderr: `Failed to read file: ${String(cause)}`,
            }).asEffect(),
          ),
        );

        const buildCommand =
          config.runtime === "node"
            ? buildNodeCommand
            : config.runtime === "bash"
              ? buildBashCommand
              : buildPythonCommand;

        const scriptName =
          config.runtime === "node"
            ? "script.js"
            : config.runtime === "bash"
              ? "script.sh"
              : "script.py";

        const result = yield* executeRuntime(fileContent, config, buildCommand, scriptName);

        return result;
      });

      const validateConfig = Effect.fn("SandboxExecutor.validateConfig")(function* (
        config: SandboxConfig,
      ) {
        if (config.timeout < MIN_TIMEOUT_MS) {
          return yield* new InvalidConfigError({
            reason: `Timeout must be at least ${MIN_TIMEOUT_MS}ms, got ${config.timeout}ms`,
          });
        }

        if (config.maxMemory < MIN_MEMORY_MB || config.maxMemory > MAX_MEMORY_MB) {
          return yield* new InvalidConfigError({
            reason: `Memory must be between ${MIN_MEMORY_MB}MB and ${MAX_MEMORY_MB}MB, got ${config.maxMemory}MB`,
          });
        }

        if (config.maxCpu < MIN_CPU_PERCENT || config.maxCpu > MAX_CPU_PERCENT) {
          return yield* new InvalidConfigError({
            reason: `CPU limit must be between ${MIN_CPU_PERCENT}% and ${MAX_CPU_PERCENT}%, got ${config.maxCpu}%`,
          });
        }

        const runtimeInfo = yield* checkRuntimeAvailability(config.runtime);

        if (!runtimeInfo.available) {
          return yield* new RuntimeNotFoundError({ runtime: config.runtime });
        }

        return yield* Effect.void;
      });

      const getRuntimeInfo = Effect.fn("SandboxExecutor.getRuntimeInfo")(function* (
        runtime: typeof SandboxConfig.fields.runtime.Type,
      ) {
        const info = yield* checkRuntimeAvailability(runtime);
        return info;
      });

      return { execute, executeFile, validateConfig, getRuntimeInfo } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
