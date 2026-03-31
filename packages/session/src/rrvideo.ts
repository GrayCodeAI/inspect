import { Effect, Schema, ServiceMap } from "effect";
import { RrVideoError } from "./errors.js";

export class RrVideoConvertError extends Schema.ErrorClass<RrVideoConvertError>("RrVideoConvertError")({
  _tag: Schema.tag("RrVideoConvertError"),
  cause: Schema.String,
}) {
  message = `Failed to convert rrweb recording to video: ${this.cause}`;
}

export class RrVideo extends ServiceMap.Service<RrVideo>()("@inspect/RrVideo", {
  make: Effect.succeed({
    convert: (_ndjsonPath: string, _outputPath: string): Effect.Effect<string, RrVideoError> =>
      Effect.succeed(""),
  }),
}) {}
