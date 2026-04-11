// ──────────────────────────────────────────────────────────────────────────────
// SauceLabs Provider Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { CloudGridError } from "./errors.js";

export class SauceLabsConfig extends Schema.Class<SauceLabsConfig>("SauceLabsConfig")({
  username: Schema.String,
  accessKey: Schema.String,
  region: Schema.Literals(["us", "eu"] as const),
}) {}

export class SauceLabsCapabilities extends Schema.Class<SauceLabsCapabilities>(
  "SauceLabsCapabilities",
)({
  browserName: Schema.String,
  browserVersion: Schema.String,
  platformName: Schema.String,
  screenResolution: Schema.optional(Schema.String),
  extendedDebug: Schema.Boolean,
}) {}

export class SauceLabsSession extends Schema.Class<SauceLabsSession>("SauceLabsSession")({
  sessionId: Schema.String,
  status: Schema.Literals(["running", "queued", "finished"] as const),
  publicUrl: Schema.String,
}) {}

export interface SauceLabsProviderService {
  readonly createSession: (
    caps: SauceLabsCapabilities,
  ) => Effect.Effect<SauceLabsSession, CloudGridError>;
  readonly deleteSession: (sessionId: string) => Effect.Effect<void, CloudGridError>;
  readonly getSessionStatus: (
    sessionId: string,
  ) => Effect.Effect<SauceLabsSession, CloudGridError>;
  readonly getJobAssets: (
    sessionId: string,
  ) => Effect.Effect<{ videoUrl?: string; logUrl?: string }, CloudGridError>;
}

export class SauceLabsProvider extends ServiceMap.Service<
  SauceLabsProvider,
  SauceLabsProviderService
>()("@inspect/SauceLabsProvider") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const config = new SauceLabsConfig({
        username: "placeholder",
        accessKey: "placeholder",
        region: "us",
      });

      const baseUrl = `https://${config.region === "us" ? "ondemand.us-west-1" : "ondemand.eu-central-1"}.saucelabs.com`;

      const createSession = (caps: SauceLabsCapabilities) =>
        Effect.gen(function* () {
          yield* Effect.logInfo("Creating SauceLabs session", {
            browser: caps.browserName,
            version: caps.browserVersion,
          });

          return new SauceLabsSession({
            sessionId: `sl-${Date.now()}`,
            status: "running",
            publicUrl: `${baseUrl}/tests/sl-${Date.now()}`,
          });
        }).pipe(
          Effect.catchTag("NoSuchElementError", (cause) =>
            Effect.fail(
              new CloudGridError({
                message: `Failed to create SauceLabs session: ${String(cause)}`,
                provider: "saucelabs",
                cause,
              }),
            ),
          ),
          Effect.withSpan("SauceLabsProvider.createSession"),
        );

      const deleteSession = (sessionId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo("Deleting SauceLabs session", { sessionId });
        }).pipe(
          Effect.catchTag("NoSuchElementError", (cause) =>
            Effect.fail(
              new CloudGridError({
                message: `Failed to delete SauceLabs session: ${String(cause)}`,
                provider: "saucelabs",
                cause,
              }),
            ),
          ),
          Effect.withSpan("SauceLabsProvider.deleteSession"),
        );

      const getSessionStatus = (sessionId: string) =>
        Effect.sync(() => {
          return new SauceLabsSession({
            sessionId,
            status: "running",
            publicUrl: `${baseUrl}/tests/${sessionId}`,
          });
        }).pipe(Effect.withSpan("SauceLabsProvider.getSessionStatus"));

      const getJobAssets = (sessionId: string) =>
        Effect.sync(() => ({
          videoUrl: `${baseUrl}/assets/${sessionId}/video.mp4`,
          logUrl: `${baseUrl}/assets/${sessionId}/selenium-log.json`,
        })).pipe(Effect.withSpan("SauceLabsProvider.getJobAssets"));

      return { createSession, deleteSession, getSessionStatus, getJobAssets } as const;
    }),
  );
}
