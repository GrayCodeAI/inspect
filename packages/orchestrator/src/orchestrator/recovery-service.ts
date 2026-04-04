import { Effect, Layer, Schema, ServiceMap } from "effect";

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

export interface RecoveryExecutors {
  readonly reScan?: Effect.Effect<boolean>;
  readonly useVision?: (selector?: string) => Effect.Effect<boolean>;
  readonly healSelector?: (selector: string) => Effect.Effect<boolean>;
  readonly waitForLoad?: Effect.Effect<boolean>;
  readonly switchModel?: Effect.Effect<boolean>;
  readonly restart?: Effect.Effect<boolean>;
  readonly scrollIntoView?: (selector?: string) => Effect.Effect<boolean>;
  readonly dismissOverlay?: Effect.Effect<boolean>;
  readonly refreshPage?: Effect.Effect<boolean>;
  readonly clearState?: Effect.Effect<boolean>;
}

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

export class RecoveryManager extends ServiceMap.Service<
  RecoveryManager,
  {
    readonly diagnose: (
      error: string,
      context?: { selector?: string; url?: string },
    ) => DiagnosisResult;
    readonly recover: (
      diagnosis: DiagnosisResult,
      executors: RecoveryExecutors,
    ) => Effect.Effect<boolean>;
    readonly getHistory: Effect.Effect<readonly RecoveryAttempt[]>;
    readonly clearHistory: Effect.Effect<void>;
  }
>()("@inspect/RecoveryManager") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const history: RecoveryAttempt[] = [];

      const diagnose = (
        error: string,
        context?: { selector?: string; url?: string },
      ): DiagnosisResult => {
        let failureType: FailureType = "unknown";
        let confidence = 0;
        for (const { pattern, type } of ERROR_PATTERNS) {
          if (pattern.test(error)) {
            failureType = type;
            confidence = 0.85;
            break;
          }
        }
        if (failureType === "unknown" && error.toLowerCase().includes("timeout")) {
          failureType = "navigation_timeout";
          confidence = 0.6;
        }
        if (failureType === "unknown") confidence = 0.3;
        return new DiagnosisResult({
          failureType,
          confidence,
          suggestedStrategies: STRATEGY_MAP[failureType],
          context: { errorMessage: error, ...context },
        });
      };

      const recover = Effect.fn("RecoveryManager.recover")(function* (
        diagnosis: DiagnosisResult,
        _executors: RecoveryExecutors,
      ) {
        for (const strategy of diagnosis.suggestedStrategies) {
          const success = yield* Effect.sync(() => {
            switch (strategy) {
              case "retry":
                return true;
              case "waitForLoad":
                return true;
              default:
                return false;
            }
          });
          history.push(new RecoveryAttempt({ strategy, success, duration: 0 }));
          if (success) return true;
        }
        return false;
      });

      const getHistory = Effect.sync(() => [...history] as const);
      const clearHistory = Effect.sync(() => {
        history.length = 0;
      });

      return { diagnose, recover, getHistory, clearHistory } as const;
    }),
  );
}
