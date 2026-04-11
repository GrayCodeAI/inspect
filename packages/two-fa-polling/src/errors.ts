import { Schema } from "effect";

export class TwoFAError extends Schema.ErrorClass<TwoFAError>("TwoFAError")({
  _tag: Schema.tag("TwoFAError"),
  reason: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Two-factor authentication error: ${this.reason}`;
}

export class PollingTimeoutError extends Schema.ErrorClass<PollingTimeoutError>(
  "PollingTimeoutError",
)({
  _tag: Schema.tag("PollingTimeoutError"),
  channel: Schema.String,
  timeoutMs: Schema.Number,
  attempts: Schema.Number,
}) {
  message = `Polling ${this.channel} timed out after ${this.timeoutMs}ms (${this.attempts} attempts)`;
}

export class CodeExtractionError extends Schema.ErrorClass<CodeExtractionError>(
  "CodeExtractionError",
)({
  _tag: Schema.tag("CodeExtractionError"),
  source: Schema.String,
  rawContent: Schema.String,
}) {
  message = `Failed to extract OTP code from ${this.source}`;
}

export class UnsupportedChannelError extends Schema.ErrorClass<UnsupportedChannelError>(
  "UnsupportedChannelError",
)({
  _tag: Schema.tag("UnsupportedChannelError"),
  channel: Schema.String,
}) {
  message = `Unsupported 2FA channel: ${this.channel}`;
}

export class InvalidOTPCodeError extends Schema.ErrorClass<InvalidOTPCodeError>(
  "InvalidOTPCodeError",
)({
  _tag: Schema.tag("InvalidOTPCodeError"),
  code: Schema.String,
  reason: Schema.String,
}) {
  message = `Invalid OTP code "${this.code}": ${this.reason}`;
}
