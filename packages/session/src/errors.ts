import { Schema } from "effect";

export class RecorderInjectionError extends Schema.ErrorClass<RecorderInjectionError>("RecorderInjectionError")({
  _tag: Schema.tag("RecorderInjectionError"),
  cause: Schema.String,
}) {
  message = `Failed to inject recorder: ${this.cause}`;
}

export class SessionLoadError extends Schema.ErrorClass<SessionLoadError>("SessionLoadError")({
  _tag: Schema.tag("SessionLoadError"),
  path: Schema.String,
  cause: Schema.String,
}) {
  message = `Failed to load session from ${this.path}: ${this.cause}`;
}

export class RrVideoError extends Schema.ErrorClass<RrVideoError>("RrVideoError")({
  _tag: Schema.tag("RrVideoError"),
  cause: Schema.String,
}) {
  message = `Failed to process rrweb video: ${this.cause}`;
}
