// ──────────────────────────────────────────────────────────────────────────────
// Appium Client Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { AppiumConnectionError } from "./errors.js";

export class AppiumCommand extends Schema.Class<AppiumCommand>("AppiumCommand")({
  method: Schema.Literals(["GET", "POST", "DELETE"] as const),
  endpoint: Schema.String,
  body: Schema.optional(Schema.Unknown),
}) {}

export class AppiumResponse extends Schema.Class<AppiumResponse>("AppiumResponse")({
  status: Schema.Number,
  value: Schema.Unknown,
  sessionId: Schema.optional(Schema.String),
}) {}

export interface AppiumClientService {
  readonly connect: () => Effect.Effect<void, AppiumConnectionError>;
  readonly disconnect: () => Effect.Effect<void, AppiumConnectionError>;
  readonly sendCommand: (
    command: AppiumCommand,
  ) => Effect.Effect<AppiumResponse, AppiumConnectionError>;
  readonly createSession: (
    capabilities: Record<string, unknown>,
  ) => Effect.Effect<string, AppiumConnectionError>;
  readonly deleteSession: (sessionId: string) => Effect.Effect<void, AppiumConnectionError>;
  readonly sessionId: Effect.Effect<string | undefined>;
}

export class AppiumClient extends ServiceMap.Service<AppiumClient, AppiumClientService>()(
  "@inspect/AppiumClient",
) {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const config = {
        host: "localhost",
        port: 4723,
      };

      let currentSessionId: string | undefined;

      const connect = () =>
        Effect.gen(function* () {
          yield* Effect.logDebug("Connecting to Appium server", {
            host: config.host,
            port: config.port,
          });

          return yield* Effect.tryPromise({
            try: async () => {
              const response = await fetch(`http://${config.host}:${config.port}/status`);
              if (!response.ok) {
                throw new Error(`Appium server returned ${response.status}`);
              }
              return response.json() as Promise<Record<string, unknown>>;
            },
            catch: (cause) =>
              new AppiumConnectionError({
                host: config.host,
                port: config.port,
                cause,
              }),
          }).pipe(
            Effect.tap(() =>
              Effect.logInfo("Connected to Appium server", {
                host: config.host,
                port: config.port,
              }),
            ),
          );
        }).pipe(Effect.withSpan("AppiumClient.connect"));

      const disconnect = () =>
        Effect.sync(() => {
          currentSessionId = undefined;
          return void 0;
        }).pipe(
          Effect.tap(() => Effect.logInfo("Disconnected from Appium server")),
          Effect.withSpan("AppiumClient.disconnect"),
        );

      const sendCommand = (command: AppiumCommand) =>
        Effect.gen(function* () {
          const sessionId = currentSessionId;
          const url = sessionId
            ? `http://${config.host}:${config.port}/session/${sessionId}${command.endpoint}`
            : `http://${config.host}:${config.port}${command.endpoint}`;

          return yield* Effect.tryPromise({
            try: async () => {
              const response = await fetch(url, {
                method: command.method,
                headers: { "Content-Type": "application/json" },
                body: command.body ? JSON.stringify(command.body) : undefined,
              });
              return response.json() as Promise<Record<string, unknown>>;
            },
            catch: (cause) =>
              new AppiumConnectionError({
                host: config.host,
                port: config.port,
                cause,
              }),
          }).pipe(
            Effect.map(
              (data) =>
                new AppiumResponse({
                  status: (data.status as number) ?? 0,
                  value: data.value ?? data,
                  sessionId,
                }),
            ),
          );
        });

      const createSession = (capabilities: Record<string, unknown>) =>
        sendCommand(
          new AppiumCommand({
            method: "POST",
            endpoint: "/session",
            body: { capabilities: { alwaysMatch: capabilities } },
          }),
        ).pipe(
          Effect.map((response) => {
            currentSessionId = response.sessionId as string | undefined;
            return currentSessionId ?? "";
          }),
        );

      const deleteSession = (sessionId: string) =>
        Effect.gen(function* () {
          yield* sendCommand(
            new AppiumCommand({
              method: "DELETE",
              endpoint: `/session/${sessionId}`,
            }),
          );
          if (currentSessionId === sessionId) {
            currentSessionId = undefined;
          }
        }).pipe(Effect.withSpan("AppiumClient.deleteSession"));

      const sessionId = Effect.sync(() => currentSessionId);

      return { connect, disconnect, sendCommand, createSession, deleteSession, sessionId } as const;
    }),
  );
}
