import { describe, it, expect } from "vitest";
import { Effect, Option } from "effect";
import { ClockService, ClockNotInstalledError } from "./clock-service.js";

describe("ClockService", () => {
  describe("standalone layer", () => {
    it("should install and report state", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const clock = yield* ClockService;

          const before = yield* clock.getState();
          expect(before.installed).toBe(false);

          yield* clock.install();

          const after = yield* clock.getState();
          expect(after.installed).toBe(true);
        }).pipe(Effect.provide(ClockService.layer)),
      );
    });

    it("should pause and resume", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const clock = yield* ClockService;
          yield* clock.install();

          yield* clock.pause();
          const paused = yield* clock.getState();
          expect(paused.paused).toBe(true);

          yield* clock.resume();
          const resumed = yield* clock.getState();
          expect(resumed.paused).toBe(false);
        }).pipe(Effect.provide(ClockService.layer)),
      );
    });

    it("should set system time", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const clock = yield* ClockService;
          yield* clock.install();

          const fixedTime = new Date("2025-06-15T12:00:00Z").getTime();
          yield* clock.setSystemTime(fixedTime);

          const state = yield* clock.getState();
          expect(Option.isSome(state.currentTime)).toBe(true);
          if (Option.isSome(state.currentTime)) {
            expect(state.currentTime.value).toBe(fixedTime);
          }
        }).pipe(Effect.provide(ClockService.layer)),
      );
    });

    it("should fast-forward time", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const clock = yield* ClockService;
          yield* clock.install();

          const startTime = new Date("2025-01-01T00:00:00Z").getTime();
          yield* clock.setSystemTime(startTime);
          yield* clock.fastForward(3_600_000);

          const state = yield* clock.getState();
          expect(Option.isSome(state.currentTime)).toBe(true);
          if (Option.isSome(state.currentTime)) {
            expect(state.currentTime.value).toBe(startTime + 3_600_000);
          }
        }).pipe(Effect.provide(ClockService.layer)),
      );
    });

    it("should restore real time", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const clock = yield* ClockService;
          yield* clock.install();
          yield* clock.setSystemTime(Date.now());
          yield* clock.restore();

          const state = yield* clock.getState();
          expect(state.paused).toBe(false);
          expect(Option.isNone(state.currentTime)).toBe(true);
        }).pipe(Effect.provide(ClockService.layer)),
      );
    });

    it("should reject operations when not installed", async () => {
      const _result = await Effect.runPromise(
        Effect.gen(function* () {
          const clock = yield* ClockService;
          const error = yield* clock.pause().pipe(Effect.flip);
          return error;
        }).pipe(Effect.provide(ClockService.layer)),
      );
      expect(_result instanceof ClockNotInstalledError).toBe(true);
    });
  });
});
