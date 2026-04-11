import { Schema } from "effect";

export class StealthError extends Schema.ErrorClass<StealthError>("StealthError")({
  _tag: Schema.tag("StealthError"),
  component: Schema.String,
  operation: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Stealth error in ${this.component} during ${this.operation}`;
}

export class FingerprintRotationError extends Schema.ErrorClass<FingerprintRotationError>(
  "FingerprintRotationError",
)({
  _tag: Schema.tag("FingerprintRotationError"),
  fingerprintType: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Failed to rotate ${this.fingerprintType} fingerprint`;
}

export class TlsFingerprintError extends Schema.ErrorClass<TlsFingerprintError>(
  "TlsFingerprintError",
)({
  _tag: Schema.tag("TlsFingerprintError"),
  targetFingerprint: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `TLS fingerprint manipulation failed for ${this.targetFingerprint}`;
}
