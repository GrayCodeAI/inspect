// ──────────────────────────────────────────────────────────────────────────────
// Shell Executor Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { ShellExecutionError, SafetyCheckError } from "./errors.js";

export class ShellExecutionConfig extends Schema.Class<ShellExecutionConfig>(
  "ShellExecutionConfig",
)({
  timeout: Schema.Number,
  workingDir: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  shell: Schema.String,
}) {}

export class ShellExecutionResult extends Schema.Class<ShellExecutionResult>(
  "ShellExecutionResult",
)({
  stdout: Schema.String,
  stderr: Schema.String,
  exitCode: Schema.Number,
  duration: Schema.Number,
  command: Schema.String,
}) {}

export interface ShellExecutorService {
  readonly execute: (
    command: string,
    config?: Partial<ShellExecutionConfig>,
  ) => Effect.Effect<ShellExecutionResult, ShellExecutionError | SafetyCheckError>;
  readonly executeScript: (
    scriptPath: string,
    config?: Partial<ShellExecutionConfig>,
  ) => Effect.Effect<ShellExecutionResult, ShellExecutionError>;
}

export class ShellExecutor extends ServiceMap.Service<
  ShellExecutor,
  ShellExecutorService
>()("@inspect/ShellExecutor") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const execute = (command: string, config?: Partial<ShellExecutionConfig>) =>
        Effect.gen(function* () {
          const resolvedConfig = new ShellExecutionConfig({
            timeout: config?.timeout ?? 30000,
            workingDir: config?.workingDir,
            env: config?.env,
            shell: config?.shell ?? "bash",
          });
          const startTime = Date.now();

          yield* Effect.annotateCurrentSpan({
            command,
            timeout: resolvedConfig.timeout,
          });

          yield* Effect.logDebug("Executing shell command", {
            command,
            workingDir: resolvedConfig.workingDir,
          });

          return yield* Effect.tryPromise({
            try: async () => {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), resolvedConfig.timeout);

              try {
                const process = await import("node:child_process");
                const { promisify } = await import("node:util");
                const exec = promisify(process.exec);

                const { stdout, stderr } = await exec(command, {
                  timeout: resolvedConfig.timeout,
                  cwd: resolvedConfig.workingDir,
                  env: resolvedConfig.env,
                  shell: resolvedConfig.shell,
                });

                clearTimeout(timeoutId);

                return new ShellExecutionResult({
                  stdout,
                  stderr,
                  exitCode: 0,
                  duration: Date.now() - startTime,
                  command,
                });
              } catch (error) {
                clearTimeout(timeoutId);
                throw error;
              }
            },
            catch: (cause) => {
              const errorMessage = cause instanceof Error ? cause.message : String(cause);
              const isTimeout = errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT");

              return new ShellExecutionError({
                message: isTimeout
                  ? `Command timed out after ${resolvedConfig.timeout}ms: ${command}`
                  : errorMessage,
                command,
                exitCode: isTimeout ? -1 : 1,
                cause,
              });
            },
          });
        }).pipe(Effect.withSpan("ShellExecutor.execute"));

      const executeScript = (scriptPath: string, config?: Partial<ShellExecutionConfig>) =>
        execute(`bash "${scriptPath}"`, config).pipe(
          Effect.catchTag("ShellExecutionError", Effect.fail),
          Effect.withSpan("ShellExecutor.executeScript"),
        );

      return { execute, executeScript } as const;
    }),
  );
}
