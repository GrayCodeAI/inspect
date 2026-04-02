import { Effect, Layer, ServiceMap } from "effect";

// Test simple service
export class TestService extends ServiceMap.Service<TestService>()("@inspect/TestService", {
  make: Effect.succeed({
    hello: () => Effect.succeed("world"),
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
