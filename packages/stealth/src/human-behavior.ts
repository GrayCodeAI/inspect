import { Effect, Layer, ServiceMap } from "effect";

export interface MouseMovement {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly durationMs: number;
  readonly waypoints: readonly { readonly x: number; readonly y: number }[];
}

export interface TypingPattern {
  readonly text: string;
  readonly delays: readonly number[];
  readonly totalDurationMs: number;
}

export interface ScrollPattern {
  readonly startY: number;
  readonly endY: number;
  readonly durationMs: number;
  readonly pauses: readonly { readonly atY: number; readonly durationMs: number }[];
}

export class HumanBehavior extends ServiceMap.Service<HumanBehavior>()("@stealth/HumanBehavior", {
  make: Effect.gen(function* () {
    const generateMouseMovement = Effect.fn("HumanBehavior.generateMouseMovement")(function* (
      startX: number,
      startY: number,
      endX: number,
      endY: number,
    ) {
      const numWaypoints = 5 + Math.floor(Math.random() * 6);
      const waypoints: Array<{ x: number; y: number }> = [];

      for (let i = 1; i < numWaypoints; i++) {
        const t = i / numWaypoints;
        const jitter = 20 + Math.random() * 30;
        waypoints.push({
          x: startX + (endX - startX) * t + (Math.random() - 0.5) * jitter,
          y: startY + (endY - startY) * t + (Math.random() - 0.5) * jitter,
        });
      }

      const durationMs = 300 + Math.random() * 700;

      return {
        startX,
        startY,
        endX,
        endY,
        durationMs,
        waypoints,
      } satisfies MouseMovement;
    });

    const generateTypingPattern = Effect.fn("HumanBehavior.generateTypingPattern")(function* (
      text: string,
    ) {
      const delays: number[] = [];
      let totalDurationMs = 0;

      for (const _char of text) {
        const baseDelay = 50 + Math.random() * 100;
        const occasionalPause = Math.random() > 0.9 ? 200 + Math.random() * 500 : 0;
        const delay = Math.round(baseDelay + occasionalPause);
        delays.push(delay);
        totalDurationMs += delay;
      }

      return {
        text,
        delays,
        totalDurationMs,
      } satisfies TypingPattern;
    });

    const generateScrollPattern = Effect.fn("HumanBehavior.generateScrollPattern")(function* (
      startY: number,
      endY: number,
    ) {
      const totalDistance = Math.abs(endY - startY);
      const numPauses = 2 + Math.floor(Math.random() * 4);
      const pauses: Array<{ atY: number; durationMs: number }> = [];

      for (let i = 0; i < numPauses; i++) {
        const t = (i + 1) / (numPauses + 1);
        pauses.push({
          atY: Math.round(startY + (endY - startY) * t),
          durationMs: Math.round(500 + Math.random() * 2000),
        });
      }

      const durationMs = Math.round(totalDistance * 2 + Math.random() * 1000);

      return {
        startY,
        endY,
        durationMs,
        pauses,
      } satisfies ScrollPattern;
    });

    const executeMouseMovement = Effect.fn("HumanBehavior.executeMouseMovement")(function* (
      _movement: MouseMovement,
    ) {
      return yield* Effect.logDebug("Simulating human-like mouse movement").pipe(Effect.as(true));
    });

    const executeTypingPattern = Effect.fn("HumanBehavior.executeTypingPattern")(function* (
      pattern: TypingPattern,
    ) {
      yield* Effect.forEach(pattern.delays, (delay: number) => Effect.sleep(delay), {
        concurrency: "unbounded",
      });
      return true;
    });

    const executeScrollPattern = Effect.fn("HumanBehavior.executeScrollPattern")(function* (
      _pattern: ScrollPattern,
    ) {
      return yield* Effect.logDebug("Simulating human-like scroll pattern").pipe(Effect.as(true));
    });

    return {
      generateMouseMovement,
      generateTypingPattern,
      generateScrollPattern,
      executeMouseMovement,
      executeTypingPattern,
      executeScrollPattern,
    } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
