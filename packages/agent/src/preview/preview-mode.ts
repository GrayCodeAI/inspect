import { Effect, Layer, Option, Ref, Schema, ServiceMap } from "effect";

// ─────────────────────────────────────────────────────────────────────────────
// PreviewMode — Stagehand-style preview/approval for AI actions
//
// Before executing an AI-proposed action, the system pauses and presents the
// action to the user for review. The user can approve, deny, or modify the
// action before it runs.
//
// API:
//   - enable(): Turn on preview mode
//   - disable(): Turn off preview mode
//   - requestApproval(action): Submit action for review, wait for response
//   - approve(actionId, modification?): Grant approval (optionally modified)
//   - deny(actionId): Deny the action
// ─────────────────────────────────────────────────────────────────────────────

export class PreviewAction extends Schema.Class<PreviewAction>("PreviewAction")({
  id: Schema.String,
  actionType: Schema.String,
  description: Schema.String,
  params: Schema.Record(Schema.String, Schema.Unknown),
  timestamp: Schema.Number,
  status: Schema.Literals(["pending", "approved", "denied", "modified"] as const),
}) {}

export class PreviewApproval extends Schema.Class<PreviewApproval>("PreviewApproval")({
  actionId: Schema.String,
  approved: Schema.Boolean,
  modification: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  reason: Schema.optional(Schema.String),
}) {}

export class PreviewModeError extends Schema.ErrorClass<PreviewModeError>("PreviewModeError")({
  _tag: Schema.tag("PreviewModeError"),
  reason: Schema.String,
}) {
  get message() {
    return this.reason;
  }
}

export class PreviewModeTimeoutError extends Schema.ErrorClass<PreviewModeTimeoutError>(
  "PreviewModeTimeoutError",
)({
  _tag: Schema.tag("PreviewModeTimeoutError"),
  actionId: Schema.String,
}) {
  get message() {
    return `Preview approval timed out for action: ${this.actionId}`;
  }
}

export interface PreviewRequest {
  readonly action: PreviewAction;
  readonly resolvedAt: Option.Option<number>;
  readonly response: Option.Option<PreviewApproval>;
}

export interface PreviewModeState {
  readonly enabled: boolean;
  readonly pendingRequests: Map<string, PreviewRequest>;
  readonly resolvedRequests: Map<string, PreviewRequest>;
}

export class PreviewModeService extends ServiceMap.Service<
  PreviewModeService,
  {
    readonly isEnabled: () => Effect.Effect<boolean>;
    readonly enable: () => Effect.Effect<void>;
    readonly disable: () => Effect.Effect<void>;
    readonly requestApproval: (
      action: Omit<PreviewAction, "id" | "timestamp" | "status">,
    ) => Effect.Effect<PreviewApproval, PreviewModeError | PreviewModeTimeoutError>;
    readonly approve: (
      actionId: string,
      modification?: Record<string, unknown>,
    ) => Effect.Effect<void>;
    readonly deny: (actionId: string, reason?: string) => Effect.Effect<void>;
    readonly getPendingRequests: () => Effect.Effect<readonly PreviewRequest[]>;
    readonly getResolvedRequests: () => Effect.Effect<readonly PreviewRequest[]>;
    readonly clearHistory: () => Effect.Effect<void>;
  }
>()("@inspect/PreviewModeService") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const enabledRef = yield* Ref.make(false);
      const pendingRef = yield* Ref.make(new Map<string, PreviewRequest>());
      const resolvedRef = yield* Ref.make(new Map<string, PreviewRequest>());
      let actionCounter = 0;

      const isEnabled = () => Ref.get(enabledRef);

      const enable = () =>
        Effect.gen(function* () {
          yield* Ref.set(enabledRef, true);
          yield* Effect.logInfo("Preview mode enabled");
        });

      const disable = () =>
        Effect.gen(function* () {
          yield* Ref.set(enabledRef, false);
          yield* Effect.logInfo("Preview mode disabled");
        });

      const requestApproval = (
        action: Omit<PreviewAction, "id" | "timestamp" | "status">,
      ) =>
        Effect.gen(function* () {
          const enabled = yield* isEnabled();
          if (!enabled) {
            return new PreviewApproval({
              actionId: "",
              approved: true,
            });
          }

          actionCounter++;
          const actionId = `preview-${actionCounter}`;
          const previewAction = new PreviewAction({
            id: actionId,
            actionType: action.actionType,
            description: action.description,
            params: action.params,
            timestamp: Date.now(),
            status: "pending",
          });

          const request: PreviewRequest = {
            action: previewAction,
            resolvedAt: Option.none(),
            response: Option.none(),
          };

          yield* Ref.update(pendingRef, (map) => {
            const next = new Map(map);
            next.set(actionId, request);
            return next;
          });

          yield* Effect.logInfo("Action submitted for preview approval", {
            actionId,
            actionType: action.actionType,
            description: action.description,
          });

          // Poll for approval response (max 5 minutes)
          const timeoutMs = 5 * 60 * 1000;
          const startTime = Date.now();

          while (Date.now() - startTime < timeoutMs) {
            const pending = yield* Ref.get(pendingRef);
            const current = pending.get(actionId);

            if (current && Option.isSome(current.response)) {
              // Move from pending to resolved
              const resolved = {
                ...current,
                resolvedAt: Option.some(Date.now()),
                response: current.response,
              };

              yield* Ref.update(resolvedRef, (map) => {
                const next = new Map(map);
                next.set(actionId, resolved);
                return next;
              });
              yield* Ref.update(pendingRef, (map) => {
                const next = new Map(map);
                next.delete(actionId);
                return next;
              });

              const approval = current.response.value;
              yield* Effect.logInfo("Preview approval received", {
                actionId,
                approved: approval.approved,
              });

              return approval;
            }

            yield* Effect.sleep(100);
          }

          return yield* new PreviewModeTimeoutError({ actionId });
        });

      const approve = (actionId: string, modification?: Record<string, unknown>) =>
        Effect.gen(function* () {
          const approval = new PreviewApproval({
            actionId,
            approved: true,
            modification,
          });

          yield* Ref.update(pendingRef, (map) => {
            const next = new Map(map);
            const current = next.get(actionId);
            if (current) {
              next.set(actionId, {
                ...current,
                action: new PreviewAction({
                  id: current.action.id,
                  actionType: current.action.actionType,
                  description: current.action.description,
                  params: current.action.params,
                  timestamp: current.action.timestamp,
                  status: modification ? "modified" as const : "approved" as const,
                }),
                response: Option.some(approval),
              });
            }
            return next;
          });

          yield* Effect.logDebug("Action approved", { actionId, modified: !!modification });
        });

      const deny = (actionId: string, reason?: string) =>
        Effect.gen(function* () {
          const approval = new PreviewApproval({
            actionId,
            approved: false,
            reason,
          });

          yield* Ref.update(pendingRef, (map) => {
            const next = new Map(map);
            const current = next.get(actionId);
            if (current) {
              next.set(actionId, {
                ...current,
                action: new PreviewAction({
                  id: current.action.id,
                  actionType: current.action.actionType,
                  description: current.action.description,
                  params: current.action.params,
                  timestamp: current.action.timestamp,
                  status: "denied" as const,
                }),
                response: Option.some(approval),
              });
            }
            return next;
          });

          yield* Effect.logDebug("Action denied", { actionId, reason });
        });

      const getPendingRequests = () =>
        Effect.gen(function* () {
          const pending = yield* Ref.get(pendingRef);
          return [...pending.values()] as readonly PreviewRequest[];
        });

      const getResolvedRequests = () =>
        Effect.gen(function* () {
          const resolved = yield* Ref.get(resolvedRef);
          return [...resolved.values()] as readonly PreviewRequest[];
        });

      const clearHistory = () =>
        Effect.gen(function* () {
          yield* Ref.set(pendingRef, new Map());
          yield* Ref.set(resolvedRef, new Map());
          yield* Effect.logDebug("Preview history cleared");
        });

      return {
        isEnabled,
        enable,
        disable,
        requestApproval,
        approve,
        deny,
        getPendingRequests,
        getResolvedRequests,
        clearHistory,
      } as const;
    }),
  );
}
