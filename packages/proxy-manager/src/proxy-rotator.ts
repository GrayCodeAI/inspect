import { Effect, Layer, Option, ServiceMap } from "effect";
import { ProxyPool } from "./proxy-pool.js";
import type { ProxyServer } from "./proxy-pool.js";

export interface RotationStrategy {
  readonly _tag: "RotationStrategy";
  readonly mode: "per-request" | "per-session" | "sticky" | "round-robin";
  readonly stickyDurationMs?: number;
}

export interface ProxySession {
  readonly sessionId: string;
  readonly assignedProxy: ProxyServer;
  readonly createdAt: Date;
  readonly expiresAt?: Date;
}

export class ProxyRotator extends ServiceMap.Service<ProxyRotator>()(
  "@proxy-manager/ProxyRotator",
  {
    make: Effect.gen(function* () {
      const pool = yield* ProxyPool;
      const sessions: Map<string, ProxySession> = new Map();
      let currentStickyProxy: Option.Option<ProxyServer> = Option.none();
      let stickyUntil = 0;

      const assignForRequest = Effect.fn("ProxyRotator.assignForRequest")(function* (
        sessionId: string,
        strategy: RotationStrategy,
      ) {
        switch (strategy.mode) {
          case "per-request": {
            return yield* pool.getNext();
          }
          case "per-session": {
            const existing = sessions.get(sessionId);
            if (existing && (!existing.expiresAt || existing.expiresAt > new Date())) {
              return existing.assignedProxy;
            }

            const proxy = yield* pool
              .getHealthy()
              .pipe(Effect.catchTag("ProxyPoolExhaustedError", () => pool.getNext()));

            const session: ProxySession = {
              sessionId,
              assignedProxy: proxy,
              createdAt: new Date(),
              expiresAt: strategy.stickyDurationMs
                ? new Date(Date.now() + strategy.stickyDurationMs)
                : undefined,
            };
            sessions.set(sessionId, session);
            return proxy;
          }
          case "sticky": {
            const now = Date.now();
            if (Option.isSome(currentStickyProxy) && now < stickyUntil) {
              return currentStickyProxy.value;
            }

            const proxy = yield* pool
              .getHealthy()
              .pipe(Effect.catchTag("ProxyPoolExhaustedError", () => pool.getNext()));

            currentStickyProxy = Option.some(proxy);
            stickyUntil = now + (strategy.stickyDurationMs ?? 600_000);
            return proxy;
          }
          case "round-robin": {
            return yield* pool.getNext();
          }
        }
      });

      const releaseSession = Effect.fn("ProxyRotator.releaseSession")(function* (
        sessionId: string,
      ) {
        sessions.delete(sessionId);
        return yield* Effect.void;
      });

      const getActiveSessions = Effect.fn("ProxyRotator.getActiveSessions")(function* () {
        const now = new Date();
        const active = [...sessions.values()].filter(
          (s: ProxySession) => !s.expiresAt || s.expiresAt > now,
        );
        return active;
      });

      const cleanupExpiredSessions = Effect.fn("ProxyRotator.cleanupExpiredSessions")(function* () {
        const now = new Date();
        for (const [sessionId, session] of sessions.entries()) {
          if (session.expiresAt && session.expiresAt <= now) {
            sessions.delete(sessionId);
          }
        }
        return yield* Effect.void;
      });

      const rotateAll = Effect.fn("ProxyRotator.rotateAll")(function* () {
        sessions.clear();
        currentStickyProxy = Option.none();
        return yield* Effect.void;
      });

      return {
        assignForRequest,
        releaseSession,
        getActiveSessions,
        cleanupExpiredSessions,
        rotateAll,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make).pipe(Layer.provideMerge(ProxyPool.layer));
}
