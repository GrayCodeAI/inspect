/**
 * RecoveryManager - Effect-TS Implementation
 *
 * Handles automatic recovery from test failures.
 * Diagnoses failure types, selects recovery strategies, executes them.
 */

import { Effect, Layer, Match, Schema, ServiceMap } from "effect";

export const FailureType = Schema.Literals([
  "element_not_found",
  "element_not_visible",
  "element_not_interactable",
  "navigation_timeout",
  "page_crash",
  "network_error",
  "selector_stale",
  "captcha_detected",
  "auth_required",
  "rate_limited",
  "unknown",
] as const);
export type FailureType = typeof FailureType.Type;

export const RecoveryStrategy = Schema.Literals([
  "reScan",
  "useVision",
  "healSelector",
  "waitForLoad",
  "retry",
  "switchModel",
  "restart",
  "scrollIntoView",
  "dismissOverlay",
  "refreshPage",
  "clearState",
  "skip",
] as const);
export type RecoveryStrategy = typeof RecoveryStrategy.Type;

export class DiagnosisResult extends Schema.Class<DiagnosisResult>("DiagnosisResult")({
  failureType: FailureType,
  confidence: Schema.Number,
  suggestedStrategies: Schema.Array(RecoveryStrategy),
  context: Schema.Struct({
    errorMessage: Schema.String,
    selector: Schema.optional(Schema.String),
    url: Schema.optional(Schema.String),
    screenshot: Schema.optional(Schema.String),
    domState: Schema.optional(Schema.String),
  }),
}) {}

export class RecoveryAttempt extends Schema.Class<RecoveryAttempt>("RecoveryAttempt")({
  strategy: RecoveryStrategy,
  success: Schema.Boolean,
  duration: Schema.Number,
  error: Schema.optional(Schema.String),
}) {}

const ERROR_PATTERNS: Array<{ pattern: RegExp; type: FailureType }> = [
  { pattern: /element.*(not found|no such|missing)/i, type: "element_not_found" },
  { pattern: /element.*(not visible|hidden|display: none)/i, type: "element_not_visible" },
  { pattern: /element.*(not interactable|disabled|readonly)/i, type: "element_not_interactable" },
  { pattern: /navigation.*(timeout|timed out)/i, type: "navigation_timeout" },
  { pattern: /(page crash|target closed|context destroyed)/i, type: "page_crash" },
  { pattern: /(network|fetch|ECONNREFUSED|ENOTFOUND|ERR_CONNECTION)/i, type: "network_error" },
  { pattern: /(stale|detached|disposed)/i, type: "selector_stale" },
  { pattern: /(captcha|recaptcha|hcaptcha|challenge)/i, type: "captcha_detected" },
  { pattern: /(401|403|unauthorized|login required|sign in)/i, type: "auth_required" },
  { pattern: /(429|rate.?limit|too many requests|throttl)/i, type: "rate_limited" },
];

const STRATEGY_MAP: Record<FailureType, RecoveryStrategy[]> = {
  element_not_found: [
    "reScan",
    "scrollIntoView",
    "useVision",
    "healSelector",
    "waitForLoad",
    "retry",
  ],
  element_not_visible: ["scrollIntoView", "dismissOverlay", "waitForLoad", "reScan", "useVision"],
  element_not_interactable: ["waitForLoad", "dismissOverlay", "scrollIntoView", "reScan", "retry"],
  navigation_timeout: ["waitForLoad", "refreshPage", "retry", "restart"],
  page_crash: ["restart", "clearState", "retry"],
  network_error: ["retry", "waitForLoad", "refreshPage", "restart"],
  selector_stale: ["reScan", "healSelector", "waitForLoad", "retry"],
  captcha_detected: ["useVision", "skip"],
  auth_required: ["clearState", "restart", "skip"],
  rate_limited: ["retry", "switchModel"],
  unknown: ["retry", "reScan", "restart", "skip"],
};

export interface RecoveryExecutors {
  readonly reScan?: () => Effect.Effect<boolean>;
  readonly useVision?: (selector?: string) => Effect.Effect<boolean>;
  readonly healSelector?: (selector: string) => Effect.Effect<boolean>;
  readonly waitForLoad?: () => Effect.Effect<boolean>;
  readonly switchModel?: () => Effect.Effect<boolean>;
  readonly restart?: () => Effect.Effect<boolean>;
  readonly scrollIntoView?: (selector?: string) => Effect.Effect<boolean>;
  readonly dismissOverlay?: () => Effect.Effect<boolean>;
  readonly refreshPage?: () => Effect.Effect<boolean>;
  readonly clearState?: () => Effect.Effect<boolean>;
}

export class RecoveryManager extends ServiceMap.Service<RecoveryManager>()(
  "@orchestrator/RecoveryManager",
  {
    make: Effect.gen(function* () {
      const maxRetries = 3;
      let history: RecoveryAttempt[] = [];

      const diagnose = Effect.fn("RecoveryManager.diagnose")(function* (
        error: string | { message: string },
        context?: Partial<DiagnosisResult["context"]>,
      ) {
        const errorMessage = typeof error === "string" ? error : error.message;

        let failureType: FailureType = "unknown";
        let confidence = 0;

        for (const { pattern, type } of ERROR_PATTERNS) {
          if (pattern.test(errorMessage)) {
            failureType = type;
            confidence = 0.85;
            break;
          }
        }

        if (failureType === "unknown") {
          confidence = 0.3;
          if (errorMessage.toLowerCase().includes("timeout")) {
            failureType = "navigation_timeout";
            confidence = 0.6;
          }
        }

        const suggestedStrategies = STRATEGY_MAP[failureType];

        return new DiagnosisResult({
          failureType,
          confidence,
          suggestedStrategies,
          context: {
            errorMessage,
            ...context,
          },
        });
      });

      const recover = Effect.fn("RecoveryManager.recover")(function* (
        diagnosis: DiagnosisResult,
        executors: RecoveryExecutors,
      ) {
        const strategies = diagnosis.suggestedStrategies;

        for (const strategy of strategies) {
          const previousAttempts = history.filter(
            (a) => a.strategy === strategy && !a.success,
          ).length;

          if (previousAttempts >= maxRetries) {
            continue;
          }

          const startTime = Date.now();
          const success = yield* executeStrategy(strategy, diagnosis, executors);

          history = [
            ...history,
            new RecoveryAttempt({
              strategy,
              success,
              duration: Date.now() - startTime,
            }),
          ];

          if (success) {
            return true;
          }
        }

        return false;
      });

      const getHistory = Effect.sync(() => [...history]);
      const clearHistory = Effect.sync(() => {
        history = [];
      });

      return { diagnose, recover, getHistory, clearHistory } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}

function executeStrategy(
  strategy: RecoveryStrategy,
  diagnosis: DiagnosisResult,
  executors: RecoveryExecutors,
): Effect.Effect<boolean> {
  return Match.value(strategy).pipe(
    Match.when("reScan", () => (executors.reScan ? executors.reScan() : Effect.succeed(false))),
    Match.when("useVision", () =>
      executors.useVision ? executors.useVision(diagnosis.context.selector) : Effect.succeed(false),
    ),
    Match.when("healSelector", () =>
      executors.healSelector
        ? executors.healSelector(diagnosis.context.selector ?? "")
        : Effect.succeed(false),
    ),
    Match.when("waitForLoad", () =>
      executors.waitForLoad ? executors.waitForLoad() : Effect.succeed(true),
    ),
    Match.when("retry", () => Effect.succeed(true)),
    Match.when("switchModel", () =>
      executors.switchModel ? executors.switchModel() : Effect.succeed(false),
    ),
    Match.when("restart", () => (executors.restart ? executors.restart() : Effect.succeed(false))),
    Match.when("scrollIntoView", () =>
      executors.scrollIntoView
        ? executors.scrollIntoView(diagnosis.context.selector)
        : Effect.succeed(false),
    ),
    Match.when("dismissOverlay", () =>
      executors.dismissOverlay ? executors.dismissOverlay() : Effect.succeed(false),
    ),
    Match.when("refreshPage", () =>
      executors.refreshPage ? executors.refreshPage() : Effect.succeed(false),
    ),
    Match.when("clearState", () =>
      executors.clearState ? executors.clearState() : Effect.succeed(false),
    ),
    Match.when("skip", () => Effect.succeed(false)),
    Match.orElse(() => Effect.succeed(false)),
  );
}
