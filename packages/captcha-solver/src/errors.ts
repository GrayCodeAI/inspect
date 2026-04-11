import { Schema } from "effect";

export class CaptchaError extends Schema.ErrorClass<CaptchaError>("CaptchaError")({
  _tag: Schema.tag("CaptchaError"),
  captchaType: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Captcha solving failed for ${this.captchaType}`;
}

export class CaptchaTimeoutError extends Schema.ErrorClass<CaptchaTimeoutError>(
  "CaptchaTimeoutError",
)({
  _tag: Schema.tag("CaptchaTimeoutError"),
  captchaType: Schema.String,
  timeoutMs: Schema.Number,
}) {
  message = `Captcha solving timed out after ${this.timeoutMs}ms for ${this.captchaType}`;
}

export class CaptchaDetectionError extends Schema.ErrorClass<CaptchaDetectionError>(
  "CaptchaDetectionError",
)({
  _tag: Schema.tag("CaptchaDetectionError"),
  pageUrl: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Captcha detection failed on ${this.pageUrl}`;
}

export class CaptchaVerificationError extends Schema.ErrorClass<CaptchaVerificationError>(
  "CaptchaVerificationError",
)({
  _tag: Schema.tag("CaptchaVerificationError"),
  captchaType: Schema.String,
  solution: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Captcha verification failed for ${this.captchaType}`;
}
