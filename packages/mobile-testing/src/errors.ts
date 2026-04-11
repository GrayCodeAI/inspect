// ──────────────────────────────────────────────────────────────────────────────
// Mobile Testing Errors
// ──────────────────────────────────────────────────────────────────────────────

import { Schema } from "effect";

export class MobileError extends Schema.ErrorClass<MobileError>("MobileError")({
  _tag: Schema.tag("MobileError"),
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class DeviceNotFoundError extends Schema.ErrorClass<DeviceNotFoundError>(
  "DeviceNotFoundError",
)({
  _tag: Schema.tag("DeviceNotFoundError"),
  deviceType: Schema.String,
  deviceId: Schema.optional(Schema.String),
}) {
  message = `Device not found: ${this.deviceType}${this.deviceId ? ` (${this.deviceId})` : ""}`;
}

export class AppiumConnectionError extends Schema.ErrorClass<AppiumConnectionError>(
  "AppiumConnectionError",
)({
  _tag: Schema.tag("AppiumConnectionError"),
  host: Schema.String,
  port: Schema.Number,
  cause: Schema.optional(Schema.Unknown),
}) {
  message = `Failed to connect to Appium server at ${this.host}:${this.port}`;
}
