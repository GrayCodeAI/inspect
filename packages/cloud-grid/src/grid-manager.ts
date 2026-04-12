// ──────────────────────────────────────────────────────────────────────────────
// Grid Manager Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { CloudGridError } from "./errors.js";

export type GridProvider = "saucelabs" | "browserstack" | "lambdaTest";

export class GridSession extends Schema.Class<GridSession>("GridSession")({
  sessionId: Schema.String,
  provider: Schema.String,
  browser: Schema.String,
  platform: Schema.String,
  status: Schema.Literals(["active", "queued", "completed", "failed"] as const),
  startedAt: Schema.Number,
}) {}

export class GridConfig extends Schema.Class<GridConfig>("GridConfig")({
  provider: Schema.Literals(["saucelabs", "browserstack", "lambdaTest"] as const),
  maxConcurrent: Schema.Number,
  timeout: Schema.Number,
}) {}

export interface GridManagerService {
  readonly acquireSession: (
    browser: string,
    platform: string,
  ) => Effect.Effect<GridSession, CloudGridError>;
  readonly releaseSession: (sessionId: string) => Effect.Effect<void, CloudGridError>;
  readonly activeSessions: Effect.Effect<GridSession[]>;
  readonly getProvider: (name: GridProvider) => Effect.Effect<string, CloudGridError>;
}

export class GridManager extends ServiceMap.Service<GridManager, GridManagerService>()(
  "@inspect/GridManager",
) {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const sessions = new Map<string, GridSession>();
      let sessionCounter = 0;

      const acquireSession = (browser: string, platform: string) =>
        Effect.gen(function* () {
          sessionCounter++;
          const sessionId = `grid-${Date.now()}-${sessionCounter}`;

          const session = new GridSession({
            sessionId,
            provider: "saucelabs",
            browser,
            platform,
            status: "active",
            startedAt: Date.now(),
          });

          sessions.set(sessionId, session);

          yield* Effect.logInfo("Grid session acquired", {
            sessionId,
            browser,
            platform,
          });

          return session;
        }).pipe(Effect.withSpan("GridManager.acquireSession"));

      const releaseSession = (sessionId: string) =>
        Effect.gen(function* () {
          const session = sessions.get(sessionId);
          if (!session) {
            return yield* new CloudGridError({
              message: `Session not found: ${sessionId}`,
              provider: "grid-manager",
            });
          }

          sessions.delete(sessionId);

          yield* Effect.logInfo("Grid session released", { sessionId });
        }).pipe(Effect.withSpan("GridManager.releaseSession"));

      const activeSessions = Effect.sync(() => Array.from(sessions.values())).pipe(
        Effect.withSpan("GridManager.activeSessions"),
      );

      const getProvider = (name: GridProvider) =>
        Effect.sync(() => name).pipe(Effect.withSpan("GridManager.getProvider"));

      return { acquireSession, releaseSession, activeSessions, getProvider } as const;
    }),
  );
}
