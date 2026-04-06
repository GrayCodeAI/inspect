// ──────────────────────────────────────────────────────────────────────────────
// Code Interpreter — Multi-language sandbox extension
// Adds support for Go, Java, Rust, PHP, C/C++ via compiler detection
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { exec } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export type AdditionalRuntime = "go" | "java" | "rust" | "php" | "c" | "cpp";

export const RUNTIME_CONFIGS: Record<
  AdditionalRuntime,
  {
    checkCommand: string;
    runCommand: (file: string) => string;
    extension: string;
    mimeType: string;
  }
> = {
  go: {
    checkCommand: "go version",
    runCommand: (file: string) => `go run "${file}"`,
    extension: ".go",
    mimeType: "text/x-go",
  },
  java: {
    checkCommand: "java --version",
    runCommand: (file: string) => `java "${file}"`,
    extension: ".java",
    mimeType: "text/x-java",
  },
  rust: {
    checkCommand: "rustc --version",
    runCommand: (file: string) => `rustc "${file}" -o "${file}.out" && "${file}.out"`,
    extension: ".rs",
    mimeType: "text/x-rust",
  },
  php: {
    checkCommand: "php --version",
    runCommand: (file: string) => `php "${file}"`,
    extension: ".php",
    mimeType: "text/x-php",
  },
  c: {
    checkCommand: "gcc --version",
    runCommand: (file: string) => `gcc "${file}" -o "${file}.out" && "${file}.out"`,
    extension: ".c",
    mimeType: "text/x-c",
  },
  cpp: {
    checkCommand: "g++ --version",
    runCommand: (file: string) => `g++ "${file}" -o "${file}.out" && "${file}.out"`,
    extension: ".cpp",
    mimeType: "text/x-c++",
  },
};

export class RuntimeExecutionResult extends Schema.Class<RuntimeExecutionResult>(
  "RuntimeExecutionResult",
)({
  stdout: Schema.String,
  stderr: Schema.String,
  exitCode: Schema.Number,
}) {}

export class SyntaxValidationResult extends Schema.Class<SyntaxValidationResult>(
  "SyntaxValidationResult",
)({
  valid: Schema.Boolean,
  errors: Schema.Array(Schema.String),
}) {}

export class RuntimeNotAvailableError extends Schema.ErrorClass<RuntimeNotAvailableError>(
  "RuntimeNotAvailableError",
)({
  _tag: Schema.tag("RuntimeNotAvailableError"),
  runtime: Schema.String,
}) {
  getErrorMessage = () => `${this.runtime} is not installed on this system`;
}

export class RuntimeExecutionError extends Schema.ErrorClass<RuntimeExecutionError>(
  "RuntimeExecutionError",
)({
  _tag: Schema.tag("RuntimeExecutionError"),
  runtime: Schema.String,
  errorMessage: Schema.String,
}) {
  getErrorMessage = () => this.errorMessage;
}

export class SyntaxValidationError extends Schema.ErrorClass<SyntaxValidationError>(
  "SyntaxValidationError",
)({
  _tag: Schema.tag("SyntaxValidationError"),
  runtime: Schema.String,
  errorMessage: Schema.String,
}) {
  getErrorMessage = () => this.errorMessage;
}

const RUNTIME_CHECK_TIMEOUT_MS = 5000;
const CODE_EXECUTION_TIMEOUT_MS = 30000;
const SYNTAX_CHECK_TIMEOUT_MS = 5000;

/** Check which additional runtimes are available on the system. */
const checkAdditionalRuntimes = Effect.gen(function* () {
  const available: Partial<Record<AdditionalRuntime, string>> = {};

  for (const [runtime, config] of Object.entries(RUNTIME_CONFIGS)) {
    const result = yield* Effect.tryPromise({
      try: () => execAsync(config.checkCommand, { timeout: RUNTIME_CHECK_TIMEOUT_MS }),
      catch: () => ({ stdout: "" }),
    });

    if (result.stdout) {
      available[runtime as AdditionalRuntime] = result.stdout.trim().split("\n")[0].trim();
    }
  }

  yield* Effect.logInfo("Runtime availability checked", {
    availableRuntimes: Object.keys(available),
  });

  return available;
});

/** Check if a specific runtime is available. */
const isRuntimeAvailable = (runtime: AdditionalRuntime) =>
  Effect.gen(function* () {
    const config = RUNTIME_CONFIGS[runtime];

    return yield* Effect.tryPromise({
      try: () => execAsync(config.checkCommand, { timeout: RUNTIME_CHECK_TIMEOUT_MS }),
      catch: () => undefined,
    }).pipe(
      Effect.map(() => true),
      Effect.matchEffect({
        onSuccess: () => Effect.succeed(true),
        onFailure: () => Effect.succeed(false),
      }),
    );
  });

/** Execute code in an additional runtime. */
const executeInRuntime = (
  runtime: AdditionalRuntime,
  code: string,
  timeoutMs = CODE_EXECUTION_TIMEOUT_MS,
) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ runtime, timeoutMs });

    const config = RUNTIME_CONFIGS[runtime];
    if (!config) {
      return yield* new RuntimeExecutionError({
        runtime,
        errorMessage: `Unsupported runtime: ${runtime}. Supported: ${Object.keys(RUNTIME_CONFIGS).join(", ")}`,
      }).asEffect();
    }

    const isAvailable = yield* isRuntimeAvailable(runtime);
    if (!isAvailable) {
      return yield* new RuntimeNotAvailableError({ runtime }).asEffect();
    }

    const tempDir = yield* Effect.tryPromise({
      try: () => mkdtemp(join(tmpdir(), `inspect-${runtime}-`)),
      catch: (cause) =>
        new RuntimeExecutionError({
          runtime,
          errorMessage: `Failed to create temp directory: ${String(cause)}`,
        }),
    });

    const fileName = `main${config.extension}`;
    const filePath = join(tempDir, fileName);

    yield* Effect.tryPromise({
      try: () => writeFile(filePath, code),
      catch: (cause) =>
        new RuntimeExecutionError({
          runtime,
          errorMessage: `Failed to write code file: ${String(cause)}`,
        }),
    });

    const result = yield* Effect.acquireRelease(Effect.succeed(tempDir), (dir) =>
      Effect.tryPromise({
        try: () => rm(dir, { recursive: true, force: true }),
        catch: () => undefined,
      }).pipe(Effect.ignore),
    ).pipe(
      Effect.flatMap(() =>
        Effect.tryPromise({
          try: () =>
            execAsync(config.runCommand(filePath), {
              cwd: tempDir,
              timeout: timeoutMs,
            }).then((r) => ({ ...r, exitCode: 0 })),
          catch: (error: unknown) => {
            const execError = error as { code?: number; stdout?: string; stderr?: string };
            return {
              stdout: execError.stdout ?? "",
              stderr: execError.stderr ?? String(execError),
              exitCode: execError.code ?? 1,
            };
          },
        }),
      ),
    );

    yield* Effect.logInfo("Code executed", { runtime, exitCode: result.exitCode });

    return new RuntimeExecutionResult({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  }).pipe(Effect.withSpan("CodeInterpreter.execute"));

/** Validate code syntax for an additional runtime. */
const validateSyntax = (runtime: AdditionalRuntime, code: string) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ runtime });

    const config = RUNTIME_CONFIGS[runtime];
    if (!config) {
      return new SyntaxValidationResult({
        valid: false,
        errors: [`Unsupported runtime: ${runtime}`],
      });
    }

    const tempDir = yield* Effect.tryPromise({
      try: () => mkdtemp(join(tmpdir(), `inspect-validate-${runtime}-`)),
      catch: (cause) =>
        new SyntaxValidationError({
          runtime,
          errorMessage: `Failed to create temp directory: ${String(cause)}`,
        }),
    });

    const fileName = `main${config.extension}`;
    const filePath = join(tempDir, fileName);

    yield* Effect.tryPromise({
      try: () => writeFile(filePath, code),
      catch: (cause) =>
        new SyntaxValidationError({
          runtime,
          errorMessage: `Failed to write code file: ${String(cause)}`,
        }),
    });

    const checkCommands: Partial<Record<AdditionalRuntime, string>> = {
      go: `go vet "${filePath}"`,
      java: `javac "${filePath}"`,
      rust: `rustc --edition 2021 "${filePath}"`,
      php: `php -l "${filePath}"`,
      c: `gcc -fsyntax-only "${filePath}"`,
      cpp: `g++ -fsyntax-only "${filePath}"`,
    };

    const checkCmd = checkCommands[runtime];
    if (!checkCmd) {
      return new SyntaxValidationResult({ valid: true, errors: [] });
    }

    const result = yield* Effect.acquireRelease(Effect.succeed(tempDir), (dir) =>
      Effect.matchEffect(
        Effect.tryPromise({
          try: () => rm(dir, { recursive: true, force: true }),
          catch: () => undefined,
        }),
        {
          onSuccess: () => Effect.void,
          onFailure: () => Effect.void,
        },
      ),
    ).pipe(
      Effect.flatMap(() =>
        Effect.tryPromise({
          try: () => execAsync(checkCmd, { cwd: tempDir, timeout: SYNTAX_CHECK_TIMEOUT_MS }),
          catch: (error: unknown) => {
            const execError = error as { stderr?: string };
            return {
              stderr: execError.stderr ?? String(execError),
            };
          },
        }),
      ),
      Effect.matchEffect({
        onSuccess: () => Effect.succeed(new SyntaxValidationResult({ valid: true, errors: [] })),
        onFailure: (error) =>
          Effect.succeed(
            new SyntaxValidationResult({
              valid: false,
              errors: [String(error)],
            }),
          ),
      }),
    );

    yield* Effect.logInfo("Syntax validation completed", { runtime, valid: result.valid });

    return result;
  }).pipe(Effect.withSpan("CodeInterpreter.validateSyntax"));

/** CodeInterpreter service for dependency injection. */
export class CodeInterpreter extends ServiceMap.Service<CodeInterpreter>()(
  "@sandbox/CodeInterpreter",
  {
    make: Effect.gen(function* () {
      return {
        checkAdditionalRuntimes,
        isRuntimeAvailable,
        executeInRuntime,
        validateSyntax,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}

// Re-export runtime configs for backwards compatibility
export { RUNTIME_CONFIGS as ADDITIONAL_RUNTIMES };
