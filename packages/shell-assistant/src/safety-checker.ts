// ──────────────────────────────────────────────────────────────────────────────
// Safety Checker Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { SafetyCheckError } from "./errors.js";

export class SafetyRule extends Schema.Class<SafetyRule>("SafetyRule")({
  pattern: Schema.String,
  description: Schema.String,
  severity: Schema.Literals(["block", "warn", "allow"] as const),
}) {}

export class SafetyCheckResult extends Schema.Class<SafetyCheckResult>(
  "SafetyCheckResult",
)({
  command: Schema.String,
  isAllowed: Schema.Boolean,
  warnings: Schema.Array(Schema.String),
  blockedReason: Schema.optional(Schema.String),
}) {}

export const DEFAULT_SAFETY_RULES: SafetyRule[] = [
  new SafetyRule({
    pattern: "rm -rf /",
    description: "Prevents recursive root directory deletion",
    severity: "block",
  }),
  new SafetyRule({
    pattern: "sudo rm",
    description: "Warns on sudo rm commands",
    severity: "warn",
  }),
  new SafetyRule({
    pattern: "chmod -R 777",
    description: "Warns on world-writable recursive chmod",
    severity: "warn",
  }),
  new SafetyRule({
    pattern: "dd if=/dev/zero",
    description: "Prevents disk zeroing",
    severity: "block",
  }),
];

export interface SafetyCheckerService {
  readonly check: (command: string) => Effect.Effect<SafetyCheckResult, SafetyCheckError>;
  readonly addRule: (rule: SafetyRule) => Effect.Effect<void>;
  readonly getRules: Effect.Effect<SafetyRule[]>;
}

export class SafetyChecker extends ServiceMap.Service<
  SafetyChecker,
  SafetyCheckerService
>()("@inspect/SafetyChecker") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const rules: SafetyRule[] = [...DEFAULT_SAFETY_RULES];

      const check = (command: string) =>
        Effect.gen(function* () {
          const warnings: string[] = [];
          let blockedReason: string | undefined;

          for (const rule of rules) {
            if (command.includes(rule.pattern)) {
              if (rule.severity === "block") {
                blockedReason = rule.description;
                break;
              } else if (rule.severity === "warn") {
                warnings.push(rule.description);
              }
            }
          }

          if (blockedReason) {
            return yield* new SafetyCheckError({
              message: blockedReason,
              command,
              violation: "blocked-by-safety-rule",
            });
          }

          return new SafetyCheckResult({
            command,
            isAllowed: true,
            warnings,
            blockedReason,
          });
        }).pipe(Effect.withSpan("SafetyChecker.check"));

      const addRule = (rule: SafetyRule) =>
        Effect.sync(() => {
          rules.push(rule);
        }).pipe(
          Effect.tap(() => Effect.logDebug("Safety rule added", { pattern: rule.pattern })),
          Effect.withSpan("SafetyChecker.addRule"),
        );

      const getRules = Effect.sync(() => [...rules]).pipe(
        Effect.withSpan("SafetyChecker.getRules"),
      );

      return { check, addRule, getRules } as const;
    }),
  );
}
