import { Effect, Layer, Schema, ServiceMap } from "effect";
import { CdpConnectionError } from "./errors.js";
import type { Cookie } from "./types.js";

export class CdpClient extends ServiceMap.Service<CdpClient>()("@inspect/CdpClient", {
  make: Effect.succeed({
    extractCookies: (_options: { key: string; profilePath: string; executablePath: string }): Effect.Effect<Cookie[], CdpConnectionError> =>
      Effect.succeed([]),
  }),
}) {
  static layer = Layer.effect(this, this.make);
  static layerTest = Layer.effect(this, this.make);
}
