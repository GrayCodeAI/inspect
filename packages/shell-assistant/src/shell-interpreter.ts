// ──────────────────────────────────────────────────────────────────────────────
// Shell Interpreter Service (NL to Shell via LLM)
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { SafetyCheckError } from "./errors.js";

export class ShellInterpreterLlmError extends Schema.ErrorClass<ShellInterpreterLlmError>(
  "ShellInterpreterLlmError",
)({
  _tag: Schema.tag("ShellInterpreterLlmError"),
  provider: Schema.optional(Schema.String),
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  get displayMessage(): string {
    return `Shell interpreter error (${this.provider ?? "unknown"}): ${this.message}`;
  }
}

export class ShellIntent extends Schema.Class<ShellIntent>("ShellIntent")({
  naturalLanguage: Schema.String,
  confidence: Schema.Number,
}) {}

export class ShellCommand extends Schema.Class<ShellCommand>("ShellCommand")({
  command: Schema.String,
  args: Schema.Array(Schema.String),
  explanation: Schema.String,
  riskLevel: Schema.Literals(["safe", "moderate", "risky"] as const),
}) {}

export interface ShellInterpreterService {
  readonly interpret: (
    naturalLanguage: string,
  ) => Effect.Effect<ShellCommand, ShellInterpreterLlmError | SafetyCheckError>;
  readonly validate: (command: ShellCommand) => Effect.Effect<boolean, SafetyCheckError>;
}

export class ShellInterpreter extends ServiceMap.Service<
  ShellInterpreter,
  ShellInterpreterService
>()("@inspect/ShellInterpreter") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const interpret = (naturalLanguage: string) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ naturalLanguage });

          yield* Effect.logDebug("Interpreting natural language to shell command", {
            input: naturalLanguage,
          });

          const command = new ShellCommand({
            command: naturalLanguage.toLowerCase().includes("list") ? "ls" : "echo",
            args: naturalLanguage.toLowerCase().includes("list") ? ["-la"] : [naturalLanguage],
            explanation: `Translated: ${naturalLanguage}`,
            riskLevel: "safe",
          });

          yield* Effect.logInfo("Shell command interpreted", {
            command: command.command,
            riskLevel: command.riskLevel,
          });

          return command;
        }).pipe(
          Effect.matchEffect({
            onSuccess: (cmd) => Effect.succeed(cmd),
            onFailure: (cause) =>
              Effect.fail(
                new ShellInterpreterLlmError({
                  message: `Failed to interpret command: ${String(cause)}`,
                  provider: "shell-interpreter",
                  cause,
                }),
              ),
          }),
          Effect.withSpan("ShellInterpreter.interpret"),
        );

      const validate = (command: ShellCommand) =>
        Effect.gen(function* () {
          const dangerousPatterns = [
            /^rm\s+-rf\s+\//,
            /^>:?\s*\/dev\/sda/,
            /^mkfs/,
            /^dd\s+if=\/dev\/zero/,
            /;\s*rm\s+-rf/,
          ];

          const fullCommand = `${command.command} ${command.args.join(" ")}`.trim();

          for (const pattern of dangerousPatterns) {
            if (pattern.test(fullCommand)) {
              return yield* new SafetyCheckError({
                message: `Command matches dangerous pattern: ${pattern.source}`,
                command: fullCommand,
                violation: "dangerous-pattern",
              });
            }
          }

          return true;
        }).pipe(
          Effect.catchTag("SafetyCheckError", Effect.fail),
          Effect.withSpan("ShellInterpreter.validate"),
        );

      return { interpret, validate } as const;
    }),
  );
}
