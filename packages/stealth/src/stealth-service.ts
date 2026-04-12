import { Effect, Layer, ServiceMap } from "effect";
import { TlsFingerprintService } from "./tls-fingerprint.js";
import { HumanBehavior } from "./human-behavior.js";
import { FingerprintRotator } from "./fingerprint-rotator.js";

export interface StealthConfig {
  readonly enableTlsFingerprinting: boolean;
  readonly enableHumanBehavior: boolean;
  readonly enableFingerprintRotation: boolean;
  readonly randomizeOnSessionStart: boolean;
}

export class StealthService extends ServiceMap.Service<StealthService>()(
  "@stealth/StealthService",
  {
    make: Effect.gen(function* () {
      const tlsFingerprint = yield* TlsFingerprintService;
      const humanBehavior = yield* HumanBehavior;
      const fingerprintRotator = yield* FingerprintRotator;

      const initialize = Effect.fn("StealthService.initialize")(function* (config: StealthConfig) {
        if (config.randomizeOnSessionStart && config.enableFingerprintRotation) {
          yield* fingerprintRotator.generateFullFingerprint();
        }

        if (config.enableTlsFingerprinting) {
          yield* tlsFingerprint.randomize();
        }

        return yield* Effect.logInfo("Stealth service initialized", {
          enableTlsFingerprinting: config.enableTlsFingerprinting,
          enableHumanBehavior: config.enableHumanBehavior,
          enableFingerprintRotation: config.enableFingerprintRotation,
        });
      });

      const simulateHumanClick = Effect.fn("StealthService.simulateHumanClick")(function* (
        targetX: number,
        targetY: number,
      ) {
        const movement = yield* humanBehavior.generateMouseMovement(
          Math.random() * 500,
          Math.random() * 500,
          targetX,
          targetY,
        );
        return yield* humanBehavior.executeMouseMovement(movement);
      });

      const simulateHumanTyping = Effect.fn("StealthService.simulateHumanTyping")(function* (
        text: string,
      ) {
        const pattern = yield* humanBehavior.generateTypingPattern(text);
        return yield* humanBehavior.executeTypingPattern(pattern);
      });

      const simulateHumanScroll = Effect.fn("StealthService.simulateHumanScroll")(function* (
        startY: number,
        endY: number,
      ) {
        const pattern = yield* humanBehavior.generateScrollPattern(startY, endY);
        return yield* humanBehavior.executeScrollPattern(pattern);
      });

      const rotateAllFingerprints = Effect.fn("StealthService.rotateAllFingerprints")(function* () {
        const full = yield* fingerprintRotator.generateFullFingerprint();

        yield* fingerprintRotator.applyFingerprint(full.canvas);
        yield* fingerprintRotator.applyFingerprint(full.webgl);
        yield* fingerprintRotator.applyFingerprint(full.audio);
        yield* fingerprintRotator.applyFingerprint(full.fonts);

        return yield* Effect.logInfo("All fingerprints rotated");
      });

      const applyStealth = Effect.fn("StealthService.applyStealth")(function* () {
        yield* rotateAllFingerprints();
        return yield* Effect.void;
      });

      return {
        initialize,
        simulateHumanClick,
        simulateHumanTyping,
        simulateHumanScroll,
        rotateAllFingerprints,
        applyStealth,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make).pipe(
    Layer.provideMerge(TlsFingerprintService.layer),
    Layer.provideMerge(HumanBehavior.layer),
    Layer.provideMerge(FingerprintRotator.layer),
  );
}
