// ──────────────────────────────────────────────────────────────────────────────
// Device Manager Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { AppiumClient } from "./appium-client.js";
import { DeviceNotFoundError, MobileError } from "./errors.js";

export class DeviceCapabilities extends Schema.Class<DeviceCapabilities>("DeviceCapabilities")({
  platformName: Schema.Literals(["iOS", "Android"] as const),
  platformVersion: Schema.optional(Schema.String),
  deviceName: Schema.String,
  app: Schema.optional(Schema.String),
  browserName: Schema.optional(Schema.String),
  automationName: Schema.optional(Schema.Literals(["XCUITest", "UiAutomator2"] as const)),
  realDevice: Schema.optional(Schema.Boolean),
  udid: Schema.optional(Schema.String),
}) {}

export class DeviceInfo extends Schema.Class<DeviceInfo>("DeviceInfo")({
  id: Schema.String,
  name: Schema.String,
  platform: Schema.Literals(["iOS", "Android"] as const),
  version: Schema.String,
  isRealDevice: Schema.Boolean,
  isConnected: Schema.Boolean,
}) {}

export class DeviceSession extends Schema.Class<DeviceSession>("DeviceSession")({
  deviceId: Schema.String,
  sessionId: Schema.String,
  capabilities: DeviceCapabilities,
  status: Schema.Literals(["active", "idle", "error"] as const),
  startedAt: Schema.Number,
}) {}

export interface DeviceManagerService {
  readonly listDevices: () => Effect.Effect<DeviceInfo[], MobileError>;
  readonly connect: (
    device: DeviceCapabilities,
  ) => Effect.Effect<DeviceSession, MobileError>;
  readonly disconnect: (sessionId: string) => Effect.Effect<void, MobileError>;
  readonly getDevice: (deviceId: string) => Effect.Effect<DeviceInfo, DeviceNotFoundError>;
  readonly activeSessions: Effect.Effect<DeviceSession[]>;
}

export class DeviceManager extends ServiceMap.Service<
  DeviceManager,
  DeviceManagerService
>()("@inspect/DeviceManager") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const appium = yield* AppiumClient;
      const devices = new Map<string, DeviceInfo>();
      const sessions = new Map<string, DeviceSession>();

      const listDevices = Effect.gen(function* () {
        yield* Effect.logDebug("Listing available mobile devices");
        return Array.from(devices.values());
      }).pipe(Effect.withSpan("DeviceManager.listDevices"));

      const connect = (capabilities: DeviceCapabilities) =>
        Effect.gen(function* () {
          const deviceId = `${capabilities.platformName}:${capabilities.deviceName}`;

          const deviceInfo = devices.get(deviceId);
          if (!deviceInfo || !deviceInfo.isConnected) {
            return yield* new DeviceNotFoundError({
              deviceType: capabilities.platformName,
              deviceId: capabilities.deviceName,
            });
          }

          const sessionId = yield* appium.createSession(capabilities);

          const session = new DeviceSession({
            deviceId,
            sessionId,
            capabilities,
            status: "active",
            startedAt: Date.now(),
          });

          sessions.set(sessionId, session);

          yield* Effect.logInfo("Device session created", {
            deviceId,
            sessionId,
            platform: capabilities.platformName,
          });

          return session;
        }).pipe(
          Effect.catchTag("AppiumConnectionError", (err) =>
            new MobileError({
              message: `Failed to connect device: ${err.message}`,
              cause: err,
            }).asEffect(),
          ),
          Effect.withSpan("DeviceManager.connect"),
        );

      const disconnect = (sessionId: string) =>
        Effect.gen(function* () {
          const session = sessions.get(sessionId);
          if (!session) {
            return yield* new MobileError({
              message: `No active session found: ${sessionId}`,
            });
          }

          yield* appium.deleteSession(sessionId);
          sessions.delete(sessionId);

          yield* Effect.logInfo("Device session disconnected", {
            deviceId: session.deviceId,
            sessionId,
          });
        }).pipe(
          Effect.catchTag("AppiumConnectionError", (err) =>
            new MobileError({
              message: `Failed to disconnect device: ${err.message}`,
              cause: err,
            }).asEffect(),
          ),
          Effect.withSpan("DeviceManager.disconnect"),
        );

      const getDevice = (deviceId: string) =>
        Effect.gen(function* () {
          const device = devices.get(deviceId);
          if (!device) {
            return yield* new DeviceNotFoundError({
              deviceType: "unknown",
              deviceId,
            });
          }
          return device;
        }).pipe(Effect.withSpan("DeviceManager.getDevice"));

      const activeSessions = Effect.sync(() => Array.from(sessions.values()));

      return { listDevices, connect, disconnect, getDevice, activeSessions } as const;
    }),
  ).pipe(Layer.provide(AppiumClient.layer));
}
