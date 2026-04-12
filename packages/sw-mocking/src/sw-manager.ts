// ──────────────────────────────────────────────────────────────────────────────
// Service Worker Manager
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { SWMockingError } from "./errors.js";

export class SwRegistration extends Schema.Class<SwRegistration>("SwRegistration")({
  id: Schema.String,
  scope: Schema.String,
  state: Schema.Literals(["registered", "active", "unregistered"] as const),
  scriptUrl: Schema.String,
  registeredAt: Schema.Number,
}) {}

export interface SwManagerService {
  readonly register: (
    scriptUrl: string,
    scope?: string,
  ) => Effect.Effect<SwRegistration, SWMockingError>;
  readonly unregister: (id: string) => Effect.Effect<void, SWMockingError>;
  readonly getRegistrations: Effect.Effect<SwRegistration[]>;
  readonly isActive: (id: string) => Effect.Effect<boolean>;
}

export class SwManager extends ServiceMap.Service<SwManager, SwManagerService>()(
  "@inspect/SwManager",
) {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const registrations = new Map<string, SwRegistration>();

      const register = (scriptUrl: string, scope = "/") =>
        Effect.gen(function* () {
          const id = `sw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          const registration = new SwRegistration({
            id,
            scope,
            state: "registered",
            scriptUrl,
            registeredAt: Date.now(),
          });

          registrations.set(id, registration);

          yield* Effect.logInfo("Service worker registered", {
            id,
            scope,
            scriptUrl,
          });

          return registration;
        }).pipe(
          Effect.matchEffect({
            onSuccess: (result) => Effect.succeed(result),
            onFailure: (cause) =>
              Effect.fail(
                new SWMockingError({
                  message: `Failed to register SW: ${String(cause)}`,
                  scope,
                  cause,
                }),
              ),
          }),
          Effect.withSpan("SwManager.register"),
        );

      const unregister = (id: string) =>
        Effect.gen(function* () {
          const registration = registrations.get(id);
          if (!registration) {
            return yield* new SWMockingError({
              message: `Registration not found: ${id}`,
            });
          }

          registrations.delete(id);

          yield* Effect.logInfo("Service worker unregistered", { id });
        }).pipe(
          Effect.catchTag("SWMockingError", Effect.fail),
          Effect.withSpan("SwManager.unregister"),
        );

      const getRegistrations = Effect.sync(() =>
        Array.from(registrations.values()).filter((r) => r.state !== "unregistered"),
      ).pipe(Effect.withSpan("SwManager.getRegistrations"));

      const isActive = (id: string) =>
        Effect.sync(() => {
          const registration = registrations.get(id);
          return registration?.state === "active" || registration?.state === "registered";
        }).pipe(Effect.withSpan("SwManager.isActive"));

      return { register, unregister, getRegistrations, isActive } as const;
    }),
  );
}
