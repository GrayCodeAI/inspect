// ──────────────────────────────────────────────────────────────────────────────
// BrowserStack Provider Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { CloudGridError } from "./errors.js";

export class BrowserStackConfig extends Schema.Class<BrowserStackConfig>("BrowserStackConfig")({
  username: Schema.String,
  accessKey: Schema.String,
}) {}

export class BrowserStackCapabilities extends Schema.Class<BrowserStackCapabilities>(
  "BrowserStackCapabilities",
)({
  browser: Schema.String,
  browserVersion: Schema.String,
  os: Schema.String,
  osVersion: Schema.String,
}) {}

export class BrowserStackSession extends Schema.Class<BrowserStackSession>(
  "BrowserStackSession",
)({
  sessionId: Schema.String,
  status: Schema.Literals(["running", "queued", "done"] as const),
  automateUrl: Schema.String,
}) {}

export interface BrowserStackProviderService {
  readonly createSession: (
    caps: BrowserStackCapabilities,
  ) => Effect.Effect<BrowserStackSession, CloudGridError>;
  readonly deleteSession: (sessionId: string) => Effect.Effect<void, CloudGridError>;
  readonly updateSession: (
    sessionId: string,
    status: "passed" | "failed",
  ) => Effect.Effect<void, CloudGridError>;
}

export class BrowserStackProvider extends ServiceMap.Service<
  BrowserStackProvider,
  BrowserStackProviderService
>()("@inspect/BrowserStackProvider") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const config = new BrowserStackConfig({
        username: "placeholder",
        accessKey: "placeholder",
      });

      const baseUrl = "https://api.browserstack.com";

      const createSession = (caps: BrowserStackCapabilities) =>
        Effect.gen(function* () {
          yield* Effect.logInfo("Creating BrowserStack session", {
            browser: caps.browser,
            os: caps.os,
          });

          return new BrowserStackSession({
            sessionId: `bs-${Date.now()}`,
            status: "running",
            automateUrl: `${baseUrl}/automate/builds/bs-${Date.now()}`,
          });
        }).pipe(
          Effect.catchTag("NoSuchElementError", (cause) =>
            Effect.fail(
              new CloudGridError({
                message: `Failed to create BrowserStack session: ${String(cause)}`,
                provider: "browserstack",
                cause,
              }),
            ),
          ),
          Effect.withSpan("BrowserStackProvider.createSession"),
        );

      const deleteSession = (sessionId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo("Deleting BrowserStack session", { sessionId });
        }).pipe(
          Effect.catchTag("NoSuchElementError", (cause) =>
            Effect.fail(
              new CloudGridError({
                message: `Failed to delete BrowserStack session: ${String(cause)}`,
                provider: "browserstack",
                cause,
              }),
            ),
          ),
          Effect.withSpan("BrowserStackProvider.deleteSession"),
        );

      const updateSession = (sessionId: string, status: "passed" | "failed") =>
        Effect.gen(function* () {
          yield* Effect.logInfo("Updating BrowserStack session status", {
            sessionId,
            status,
          });
        }).pipe(
          Effect.catchTag("NoSuchElementError", (cause) =>
            Effect.fail(
              new CloudGridError({
                message: `Failed to update BrowserStack session: ${String(cause)}`,
                provider: "browserstack",
                cause,
              }),
            ),
          ),
          Effect.withSpan("BrowserStackProvider.updateSession"),
        );

      return { createSession, deleteSession, updateSession } as const;
    }),
  );
}
