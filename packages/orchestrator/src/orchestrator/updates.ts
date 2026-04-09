import { Effect, Layer, PubSub, Stream, ServiceMap } from "effect";
import { UpdateContent } from "@inspect/shared";

export interface UpdatesService {
  readonly publish: (content: UpdateContent) => Effect.Effect<void>;
  readonly stream: () => Stream.Stream<UpdateContent>;
}

const SCREENSHOT_TOOL_NAMES = new Set(["screenshot", "click", "type", "navigate"]);

export class Updates extends ServiceMap.Service<Updates, UpdatesService>()("@inspect/Updates") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const pubsub = yield* PubSub.unbounded<UpdateContent>();

      const publish = (content: UpdateContent) => PubSub.publish(pubsub, content);

      const stream = () => Stream.fromPubSub(pubsub);

      return { publish, stream } as const;
    }),
  );
}

export { SCREENSHOT_TOOL_NAMES };
